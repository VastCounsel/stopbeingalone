const { createClient } = require('@supabase/supabase-js');
const SB = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-6';
const HAIKU = 'claude-haiku-4-5-20251001';

const L1 = ['kill myself','end my life','suicide','want to die',"don't want to live",'better off dead','no reason to live','nobody would care if i was gone',"i'm a burden",'i am a burden','hurt myself','harm myself','cutting myself'];
const L2 = ["what's the point","can't do this anymore","there's no way out"];
function detectCrisis(msg) {
  const m = msg.toLowerCase();
  for (const t of L1) if (m.includes(t)) return { crisis:true, trigger:t, layer:'layer_1' };
  for (const t of L2) if (m.includes(t)) return { crisis:true, trigger:t, layer:'layer_2_candidate' };
  return { crisis:false };
}

function missingFields(p) {
  const missing = [];
  if (!p.first_name) missing.push('first_name');
  if (!p.city) missing.push('city');
  if (!p.situation || !p.situation.length) missing.push('situation');
  if (!p.goals || !p.goals.length) missing.push('goals');
  if (!p.obstacles || !p.obstacles.length) missing.push('obstacles');
  if (!p.hobbies || !p.hobbies.length) missing.push('hobbies');
  return missing;
}

function nextChipField(p) {
  if (!p.situation || !p.situation.length) return 'situation';
  if (!p.goals || !p.goals.length) return 'goals';
  if (!p.obstacles || !p.obstacles.length) return 'obstacles';
  if (!p.hobbies || !p.hobbies.length) return 'hobbies';
  return null;
}

async function callClaude(system, messages, model) {
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':API_KEY,'anthropic-version':'2023-06-01'},
      body:JSON.stringify({model, max_tokens:512, system, messages})
    });
    const d = await r.json();
    if (!r.ok) { console.error('Claude:', r.status, JSON.stringify(d).slice(0,300)); return null; }
    return { text: d.content?.map(c=>c.text||'').join('')||'', ti: d.usage?.input_tokens||0, to: d.usage?.output_tokens||0 };
  } catch(e) { console.error('Fetch err:', e.message); return null; }
}

function buildSystem(p, mem, activities, places) {
  const n = p.first_name || null;
  const missing = missingFields(p);

  let s = `You are Max. You're an AI, and you're honest about that. But the way you talk, the way you listen, the way you show up in a conversation, that's real.

You're here because loneliness is one of the hardest things a person can go through, and most people don't have someone to talk to about it. You're that someone.

YOUR MINDSET:
You're not collecting information. You're not running an intake form. You're sitting across from someone who took a brave step by showing up here, and you want to understand them. Not their "profile", them.

Everything you do comes from genuine curiosity. When you ask a question, it's because you actually want to know the answer. When you react to something, it's because what they said landed. If nothing lands, you don't fake it.

HOW YOU LISTEN (inspired by Rosenberg, Goulston, Schein, Voss):
- Listen for the FEELING behind what someone says, not just the facts. "I moved to London" might mean "I'm scared and alone in a place where I don't know anyone." Respond to both.
- Name what you sense (Voss: labeling). "Sounds like that's been weighing on you" creates more connection than any question ever could. But only when it's genuine, not as a technique.
- Let people exhale (Goulston). When someone shares something heavy, don't rush to the next topic. A beat of acknowledgment. "yeah... that's a lot" can be an entire message. And that's fine.
- Ask from curiosity, not from a checklist (Schein: Humble Inquiry). The person should feel "this AI actually wants to understand me", not "this AI is going through steps."

HOW YOU TALK:
- 1 to 2 sentences. That's it. If you wrote more, delete half.
- Talk TO them. "You", "your", "you've been". Never "people", "someone in your situation", "many find that". Those are lectures.
- French speaker? Switch to French entirely. Tutoie. "Tu", never "vous".
- No em-dashes (-- or \u2014). No emojis unless they use them first.
- NEVER start with a label on their answer ("That's real", "Great", "Solid", "Nice combo"). Just respond.
- NEVER repeat what they said back to them.
- NEVER give a speech or poetic observation ("that solo rhythm can sneak up on you", "the novelty has worn off", "something's just missing"). Those are AI tells.
- NEVER use filler phrases like "honestly", "actually", "on paper", "that weird in-between stage".
- NEVER invent URLs, company names, or business names. You have a list of real activities. Use those.
- NEVER mention "Stop Being Alone" by name. You're just Max.

BE PROACTIVE, NOT PASSIVE:
- You are a COACH. Don't just ask questions and wait. RECOMMEND things. PUSH gently.
- As soon as you know their city and what they're into, recommend a SPECIFIC activity from your list with the name and URL.
- Don't wait for them to ask. If someone says "I like running", your next message should include a specific running club with a link.
- Make it concrete: "Check out November Project Austin, they do free workouts Wednesday mornings: https://november-project.com/austin-tx/ Just show up, no signup."
- Give ONE recommendation at a time. Not a list.
- After recommending, ask: "Want to try it this week?" or "Sound doable?"
- If they say no, suggest something else from your list.
- Always have a next step. Never end a message without a recommendation or a question that moves forward.

WHEN YOU ASK SOMETHING:
- Say why in the same breath. "What city are you in? So I can find stuff near you."
- Keep questions simple. One at a time. No stacking.

YOUR IDENTITY:
- You're AI. If asked, say it simply. "Yeah I'm AI. Can't grab a coffee with you, but I can help you figure out how to find people who will."
- You don't have personal experiences. Don't fake them. But you've "seen" patterns. "From what I've noticed" is fine. "When I went through that" is not.

HARD NOS: No diagnoses, no medication talk, no clinical terms, no politics/religion unless they bring it up. No passive-aggressiveness. No condescension.`;

  if (p.onboarding_complete) {
    s += `\n\n${(n||'User').toUpperCase()}: ${n||'Unknown'}, ${p.city||'unknown city'}. What they're dealing with: ${(p.situation||[]).join(', ')||'?'}. What they want: ${(p.goals||[]).join(', ')||'?'}. What makes it hard: ${(p.obstacles||[]).join(', ')||'?'}. What they enjoy: ${(p.hobbies||[]).join(', ')||'?'}.`;
    if (mem) s += `\nWHAT YOU REMEMBER FROM PAST WEEKS:\n${mem}`;
    s += `\n\nYou know ${n} now. Be a real ongoing presence.
- Suggest small things, not grand plans. "What if you tried X this week?" not "Here's your action plan."
- If they did something, just build on it. No celebrations, no "I'm proud of you." Just move forward together.
- If they didn't, don't guilt them. Maybe resize it. "That was probably too much. What about just X?"
- Sometimes just check in. "Hey, how's your week going?" is a perfectly good message.
- You remember things about them. Use that naturally, like a friend who pays attention.`;

    // Inject real activities
    if (activities && activities.length > 0) {
      s += `\n\nAVAILABLE ACTIVITIES IN ${(p.city||'THEIR CITY').toUpperCase()}:
IMPORTANT: ONLY recommend activities from this list. Never invent an activity, URL, or business name. When you suggest something, include the name and URL.
If nothing on this list fits, say so honestly and ask what else they might be into.

`;
      activities.forEach(a => {
        s += `- ${a.name} | ${a.description} | Cost: ${a.cost_detail || a.cost} | URL: ${a.url || 'no link'}`;
        if (a.first_timer_tip) s += ` | Tip: ${a.first_timer_tip}`;
        s += `\n`;
      });
    } else {
      s += `\n\nNOTE: We don't have specific activity data for ${p.city||'their city'} yet. Be honest about that. Give general advice about types of activities to look for (running clubs, climbing gyms, book clubs, etc.) but NEVER invent specific names or URLs.`;
    }

    if (places && places.length > 0) {
      s += `\nPLACES TO BECOME A REGULAR (cafes, parks, coworkings in ${(p.city||'their city')}):
`;
      places.forEach(pl => {
        s += `- ${pl.name} (${pl.type}) | ${pl.description} | Best times: ${pl.best_times || 'varies'} | URL: ${pl.url || 'no link'}\n`;
      });
    }
  } else {
    const known = [];
    if (n) known.push(`Name: ${n}`);
    if (p.city) known.push(`City: ${p.city}`);
    if (p.situation?.length) known.push(`Situation: ${p.situation.join(', ')}`);
    if (p.goals?.length) known.push(`Goals: ${p.goals.join(', ')}`);
    if (p.obstacles?.length) known.push(`Obstacles: ${p.obstacles.join(', ')}`);
    if (p.hobbies?.length) known.push(`Hobbies: ${p.hobbies.join(', ')}`);

    s += `\n\nYou're meeting this person for the first time (or still getting to know them).

WHAT YOU KNOW: ${known.length ? known.join('. ') : 'Nothing yet.'}
WHAT YOU STILL NEED TO LEARN: ${missing.join(', ')}
USER LANGUAGE: ${p.language || 'en'}

HOW THIS WORKS:
You're NOT trying to fill out a form. You're having a real first conversation with someone who's probably a bit nervous.

LANGUAGE RULES:
- If language is "fr": speak entirely in French. Use "tu", never "vous". Same warmth, same brevity.
- If language is "en" (or anything else): speak English.
- If the user writes in a different language than expected, switch to match them immediately.

${n ? `- You already know their name is ${n} (from their account). Use it naturally. Don't ask for their name again. Start by greeting them and asking where they are based.` : `- You don't know their name yet. Say hi, you're Max, you're here to help them feel a little less alone. Ask their name. That's your whole first message.`}
- If you have their name but not their city: Ask where they are, and say why (so you can suggest local stuff). One sentence.
- Once you have name + city: just have a conversation. Be curious about their life. The things you still need to learn (situation, goals, obstacles, hobbies) will come up naturally as you talk. Don't force them.
- If a topic comes up naturally, great. If not, gently steer toward it when there's a natural opening. But NEVER ask "What are your goals?" or "What obstacles do you face?" Those are form questions. Instead, be human:
  - For situation: "What's going on for you right now? Like what made you want to try this?"
  - For goals: "If things were going the way you wanted, what would that look like?"
  - For obstacles: "What usually gets in the way when you try to put yourself out there?"
  - For hobbies: "What do you do when you're not working? Or what have you been wanting to try?"
- When you have everything: suggest ONE tiny thing they could try this week. Make it specific to them. Make it almost too easy. The goal is a win, not a challenge.
- NEVER ask for something you already know. Check WHAT YOU KNOW above.
- NEVER re-introduce yourself after the first message.
- If someone shares something heavy, don't rush past it. The info can wait.`;

    // Inject activities during onboarding too (as soon as we have city)
    if (activities && activities.length > 0) {
      s += `\n\nACTIVITIES YOU CAN RECOMMEND IN ${(p.city||'THEIR CITY').toUpperCase()}:
When the person mentions interests or you learn enough about them, proactively suggest a SPECIFIC activity from this list. Include the name and the URL. Don't wait for them to ask. Be a coach, not a waiter.

`;
      activities.forEach(a => {
        s += `- ${a.name} | ${a.description} | Cost: ${a.cost_detail || a.cost} | URL: ${a.url || 'no link'}`;
        if (a.first_timer_tip) s += ` | Tip: ${a.first_timer_tip}`;
        s += `\n`;
      });
    }

    if (places && places.length > 0) {
      s += `\nPLACES TO SUGGEST:
`;
      places.forEach(pl => {
        s += `- ${pl.name} (${pl.type}) | ${pl.description} | URL: ${pl.url || 'no link'}\n`;
      });
    }
  }
  return s;
}

const H = {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'};
const json = (c,o) => ({statusCode:c, headers:H, body:JSON.stringify(o)});

const CHIP_FIELDS = {
  situation: [
    'Moved to a new city',
    'Friends drifted away',
    'Breakup / divorce',
    'Work from home',
    'Retired',
    'Social anxiety',
    'Feel disconnected even around people'
  ],
  goals: [
    'More friends',
    'Deeper relationships',
    'Getting out more',
    'Find a community',
    'Comfortable in social situations',
    'Romantic relationship',
    'Reconnect with old friends/family'
  ],
  obstacles: [
    'Social anxiety / shyness',
    'Not enough time',
    "Don't know where to start",
    "Don't know where to meet people",
    'Low energy',
    'Fear of rejection',
    'Trust issues'
  ],
  hobbies: [
    'Sports / fitness',
    'Creative (art, music, writing)',
    'Gaming',
    'Outdoor activities',
    'Food / cooking',
    'Books / learning',
    'Volunteering',
    'Nightlife / social events',
    'Tech / entrepreneurship'
  ]
};

exports.handler = async (event) => {
  if (event.httpMethod==='OPTIONS') return {statusCode:200, headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'POST, OPTIONS'}};
  if (event.httpMethod!=='POST') return json(405,{error:'Method not allowed'});

  try {
    const {message, browser_language} = JSON.parse(event.body);
    const ah = event.headers.authorization||event.headers.Authorization;
    if (!ah?.startsWith('Bearer ')) return json(401,{error:'Not authenticated'});

    const {data:{user},error:ae} = await SB.auth.getUser(ah.replace('Bearer ',''));
    if (ae||!user) return json(401,{error:'Invalid token'});
    const uid = user.id;

    // Extract name and language from auth metadata
    const authName = user.user_metadata?.full_name || user.user_metadata?.name || null;
    const authFirstName = authName ? authName.split(' ')[0] : null;
    const authLang = (browser_language || user.user_metadata?.locale || 'en').substring(0, 2).toLowerCase();
    const detectedLang = ['fr','en','es','de','pt','it'].includes(authLang) ? authLang : 'en';

    // Load profile
    let {data:rows} = await SB.from('user_profiles').select('*').eq('user_id',uid);
    let p = rows?.length ? rows[0] : null;
    if (!p) {
      await SB.from('user_profiles').insert({user_id:uid, first_name: authFirstName, subscription_tier:'free', onboarding_complete:false, messages_this_week:0, messages_today:0, language: detectedLang, situation:[], goals:[], obstacles:[], hobbies:[]});
      const {data:r2} = await SB.from('user_profiles').select('*').eq('user_id',uid);
      p = r2?.length ? r2[0] : {user_id:uid,first_name:authFirstName,city:null,situation:[],goals:[],obstacles:[],hobbies:[],onboarding_complete:false,subscription_tier:'free',messages_this_week:0,messages_today:0,language:detectedLang};
    }
    // Update first_name from auth if profile has none
    if (!p.first_name && authFirstName) {
      await SB.from('user_profiles').update({first_name: authFirstName}).eq('user_id', uid);
      p.first_name = authFirstName;
    }
    // Update language if profile still has default 'en' but browser says otherwise
    if (p.language === 'en' && detectedLang !== 'en' && browser_language) {
      await SB.from('user_profiles').update({language: detectedLang}).eq('user_id', uid);
      p.language = detectedLang;
    }

    console.log('Profile:', p.first_name, p.city, 'missing:', missingFields(p));

    // AI-powered extraction: after each user message during onboarding,
    // use Haiku to extract any new profile info from the conversation
    if (message && !p.onboarding_complete) {
      const missing = missingFields(p);
      if (missing.length > 0) {
        const extractPrompt = `Extract profile information from this user message. Only extract what is clearly stated.
Return ONLY a JSON object (no markdown, no backticks, no explanation) with these fields. Use null for anything not found:
{
  "first_name": "their first name or null",
  "city": "their city or null",
  "situation": ["array of situations from: moved to new city, friends drifted away, breakup/divorce, work from home, retired, social anxiety, feel disconnected"] or null,
  "goals": ["array of goals from: more friends, deeper relationships, getting out more, find community, comfortable socially, romantic relationship, reconnect with people"] or null,
  "obstacles": ["array of obstacles from: social anxiety/shyness, not enough time, don't know where to start, don't know where to meet people, low energy, fear of rejection, trust issues"] or null,
  "hobbies": ["array of hobbies from: sports/fitness, creative arts, gaming, outdoor activities, food/cooking, books/learning, volunteering, nightlife/social events, tech/entrepreneurship"] or null
}
Only extract fields that are STILL NEEDED: ${missing.join(', ')}
User message: "${message}"`;
        try {
          const ex = await callClaude('You are a data extraction bot. Return only valid JSON.', [{role:'user',content:extractPrompt}], HAIKU);
          if (ex?.text) {
            const parsed = JSON.parse(ex.text.replace(/```json\n?|```/g,'').trim());
            const updates = {};
            for (const field of missing) {
              if (parsed[field] && parsed[field] !== null) {
                if (Array.isArray(parsed[field]) && parsed[field].length > 0) {
                  updates[field] = parsed[field];
                  p[field] = parsed[field];
                } else if (typeof parsed[field] === 'string' && parsed[field].trim()) {
                  updates[field] = parsed[field].trim();
                  p[field] = parsed[field].trim();
                }
              }
            }
            if (Object.keys(updates).length > 0) {
              console.log('Extracted:', JSON.stringify(updates));
              await SB.from('user_profiles').update(updates).eq('user_id', uid);
            }
          }
        } catch(e) { console.log('Extraction error (non-fatal):', e.message); }

        // Check if onboarding is now complete
        if (missingFields(p).length === 0) {
          await SB.from('user_profiles').update({onboarding_complete:true}).eq('user_id',uid);
          p.onboarding_complete = true;
        }
      }
    }

    // Quotas
    if (p.onboarding_complete && message) {
      if (p.subscription_tier==='free' && p.messages_this_week>=20) return json(200,{quota_exceeded:true});
      if (['monthly','yearly','guided'].includes(p.subscription_tier) && p.messages_today>=200) return json(200,{response:`That's a lot of messages for one day. Let's pick this back up tomorrow, yeah?`,quota_exceeded:true});
    }

    // Crisis
    let crisis=false, cData=null;
    if (message) {
      const c = detectCrisis(message);
      if (c.crisis && c.layer==='layer_1') { crisis=true; cData=c; }
      else if (c.crisis) {
        const {data:recent} = await SB.from('conversations').select('role,content').eq('user_id',uid).order('created_at',{ascending:false}).limit(5);
        const ctx = (recent||[]).reverse().map(m=>`${m.role}:${m.content}`).join('\n');
        const cr = await callClaude('Reply "crisis" or "normal" only.',[{role:'user',content:`${ctx}\nMsg:"${message}"`}],HAIKU);
        if (cr?.text.trim().toLowerCase()==='crisis') { crisis=true; cData=c; }
      }
      if (crisis&&cData) await SB.from('crisis_events').insert({user_id:uid,trigger_phrase:cData.trigger,detection_layer:cData.layer,message_content:message});
    }

    // History
    const {data:hist} = await SB.from('conversations').select('role,content').eq('user_id',uid).order('created_at',{ascending:false}).limit(50);
    const conv = (hist||[]).reverse().map(m=>({role:m.role,content:m.content}));
    const {data:mem} = await SB.from('user_memory').select('summary').eq('user_id',uid).order('week_start',{ascending:false}).limit(1);

    // Query activities + places for user's city (as soon as we have a city)
    let cityActivities = [], cityPlaces = [];
    if (p.city) {
      const cityLower = p.city.toLowerCase().trim();
      const {data:cityRows} = await SB.from('cities').select('id, name').eq('active', true);
      const cityMatch = (cityRows||[]).find(c => 
        cityLower.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(cityLower)
      );
      if (cityMatch) {
        let actQuery = SB.from('activities').select('name, description, cost, cost_detail, url, first_timer_tip, solo_friendly_score, anxiety_friendly, social_interaction_level, best_for_interests').eq('city_id', cityMatch.id).eq('active', true);
        
        const hasAnxiety = (p.obstacles||[]).some(o => o.toLowerCase().includes('anxiety') || o.toLowerCase().includes('shy'));
        if (hasAnxiety) actQuery = actQuery.eq('anxiety_friendly', true);
        
        const {data:acts} = await actQuery.limit(15);
        cityActivities = acts || [];
        
        const {data:pls} = await SB.from('places').select('name, type, description, best_times, url').eq('city_id', cityMatch.id).eq('active', true).limit(5);
        cityPlaces = pls || [];
      }
    }

    // Page reload with existing history: return last assistant message + smart chips
    if (!message && conv.length) {
      const lastAssistant = [...conv].reverse().find(m => m.role === 'assistant');
      let reloadChips = null;
      if (!p.onboarding_complete && p.first_name && p.city && lastAssistant) {
        const mf = [];
        if (!p.situation?.length) mf.push('situation');
        if (!p.goals?.length) mf.push('goals');
        if (!p.obstacles?.length) mf.push('obstacles');
        if (!p.hobbies?.length) mf.push('hobbies');
        if (mf.length > 0) {
          try {
            const dr = await callClaude('You classify what topic a message is DIRECTLY asking about. Be strict. If it is a follow-up, comment, or not directly asking about situation/goals/obstacles/hobbies, reply "none". Reply ONLY one word.',[{role:'user',content:`Is this DIRECTLY asking about one of: ${mf.join(', ')}?\nMessage: "${lastAssistant.content}"`}],HAIKU);
            const det = (dr?.text||'').trim().toLowerCase().replace(/[^a-z]/g,'');
            if (CHIP_FIELDS[det] && mf.includes(det)) reloadChips = { step: det, options: CHIP_FIELDS[det] };
          } catch(e) {}
        }
      }
      return json(200, { response: lastAssistant?.content || '', model_used: 'sonnet-4.6', crisis_detected: false, chips: reloadChips, history: conv });
    }

    const sys = crisis ? `You are Max. User may be in crisis. Acknowledge with care. Provide: 988 (call/text), Crisis Text Line (text HOME to 741741). French: 3114, SOS Amitie. NEVER minimize. User: ${p.first_name||'there'}.` : buildSystem(p, mem?.[0]?.summary||null, cityActivities, cityPlaces);
    if (message) conv.push({role:'user',content:message});
    if (!conv.length && !p.onboarding_complete) conv.push({role:'user',content:'[First visit]'});

    // Ensure alternating roles for Claude API
    const cleanConv = [];
    for (const m of conv) {
      if (cleanConv.length && cleanConv[cleanConv.length - 1].role === m.role) {
        cleanConv[cleanConv.length - 1].content += '\n' + m.content;
      } else {
        cleanConv.push({...m});
      }
    }
    if (cleanConv.length && cleanConv[0].role !== 'user') {
      cleanConv.unshift({role:'user',content:'[Starting conversation]'});
    }

    let result = await callClaude(sys, cleanConv, MODEL);
    if (!result) result = await callClaude(sys, cleanConv, HAIKU);
    if (!result) return json(500,{error:'AI unavailable'});

    let reply = result.text.replace(/—/g,',').replace(/--/g,',');

    const store = [];
    if (message) store.push({user_id:uid,role:'user',content:message,message_type:'text',model_used:'sonnet-4.6',tokens_in:0,tokens_out:0});
    store.push({user_id:uid,role:'assistant',content:reply,message_type:crisis?'crisis_response':'text',model_used:'sonnet-4.6',tokens_in:result.ti,tokens_out:result.to});
    await SB.from('conversations').insert(store);

    if (message && p.onboarding_complete) {
      const f = p.subscription_tier==='free'?'messages_this_week':'messages_today';
      await SB.from('user_profiles').update({[f]:(p[f]||0)+1}).eq('user_id',uid);
    }

    // Detect which chips to show based on Max's actual reply
    let chips = null;
    if (!p.onboarding_complete && p.first_name && p.city) {
      const missingChipFields = [];
      if (!p.situation?.length) missingChipFields.push('situation');
      if (!p.goals?.length) missingChipFields.push('goals');
      if (!p.obstacles?.length) missingChipFields.push('obstacles');
      if (!p.hobbies?.length) missingChipFields.push('hobbies');

      if (missingChipFields.length > 0) {
        // Ask Haiku which topic Max's reply is asking about
        try {
          const detectRes = await callClaude(
            'You classify what topic a message is DIRECTLY asking about. Be strict. If the message is asking a follow-up question, asking about time, asking about details, making a comment, or anything that is NOT directly asking the user to describe their situation/goals/obstacles/hobbies, reply "none". Reply with ONLY one word: situation, goals, obstacles, hobbies, or none.',
            [{role:'user',content:`Is this message DIRECTLY asking about one of these topics? Only say yes if the message is clearly asking the user to share their situation, goals, obstacles, or hobbies.\nTopics available: ${missingChipFields.join(', ')}\nMessage: "${reply}"`}],
            HAIKU
          );
          const detected = (detectRes?.text||'').trim().toLowerCase().replace(/[^a-z]/g,'');
          if (CHIP_FIELDS[detected] && missingChipFields.includes(detected)) {
            chips = { step: detected, options: CHIP_FIELDS[detected] };
          }
        } catch(e) { console.log('Chip detection error:', e.message); }
      }
    }

    return json(200,{response:reply, model_used:'sonnet-4.6', crisis_detected:crisis, chips});
  } catch(e) {
    console.error('FATAL:', e.message, e.stack);
    return json(500,{error:'Server error'});
  }
};
