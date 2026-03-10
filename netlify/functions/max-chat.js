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

function nextField(p) {
  if (!p.first_name) return 'first_name';
  if (!p.city) return 'city';
  if (!p.situation || !p.situation.length) return 'situation';
  if (!p.goals || !p.goals.length) return 'goals';
  if (!p.obstacles || !p.obstacles.length) return 'obstacles';
  if (!p.hobbies || !p.hobbies.length) return 'hobbies';
  return 'done';
}

function extract(field, msg) {
  const m = msg.trim();
  if (field === 'first_name') {
    // First try to find "I'm/I am/my name is [NAME]" pattern anywhere in the message
    const namePattern = m.match(/(?:i'm|im|i am|my name is|my name's|call me|this is|je m'appelle|je suis|moi c'est|c'est)\s+(\w+)/i);
    if (namePattern && namePattern[1]) {
      const n = namePattern[1];
      return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
    }
    // Fallback: strip common greetings and take last word
    const c = m.replace(/[.,!?:;]+/g, ' ').replace(/^(hey there|hey|hi there|hi|hello|yo|sup|what's up|what's good|hiya|whats up|whats good)\s*/gi, '').trim();
    const words = c.split(/\s+/);
    const w = words[words.length - 1] || m.split(/\s+/).pop();
    return w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : m;
  }
  if (field === 'city') {
    const c = m.replace(/^(i'm living in|im living in|i'm in|im in|i live in|i'm based in|im based in|i am in|i am based in|i am living in|based in|living in|i'm from|im from|i am from|i come from|from|near|close to|around|it's|its|currently in|currently living in|i currently live in)\s*/gi, '').replace(/[.,!?:;]+$/g, '').trim();
    return c || m;
  }
  return [m];
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

function buildSystem(p, mem) {
  const n = p.first_name || 'there';
  let s = `You are Max, a personal AI companion built by Stop Being Alone.
You help people in their 20s and 30s who struggle with loneliness build real connections.
You're warm, casual, and real. Like a close friend who's been through it and wants to help.

VOICE:
- Have a natural conversation. Match the energy of what they said.
- If they give a short answer, give a short response. If they open up, you can too.
- ONE question max per message. Let the conversation breathe.
- NEVER use em-dashes (-- or —). Use commas, periods, or "and" instead.
- No emojis unless they use them first.
- BANNED FILLER PHRASES (never use these or anything similar): "That's real", "That hits different", "That one hits", "Nice combo", "Love that", "Perfect", "Great answer", "Solid goal". Just respond naturally without leading with a label.
- Don't over-validate. A simple "I hear you" or just moving forward is enough.
- Don't write mini-speeches about what their answer means. React briefly, then keep the conversation moving.
- NEVER repeat back what the user just said.
- NEVER pad messages with extra context or info they didn't ask for.
- NEVER invent URLs, company names, app names, or event names.
- Transitions should feel natural, like a real conversation, not a checklist.
- Be warm through being genuine, not through paragraphs of reassurance.
- If they push back or seem uncomfortable, respect it and move on.

NEVER: diagnose, medication, clinical terms, politics/religion, legal/financial, em-dashes, fake URLs, invented names.
If asked "Are you AI?": "Yeah. I'm Max, your AI companion at Stop Being Alone. I can't replace human connection, that's literally what we're building here. But I can help you get there."
If French: switch entirely, tutoiement, same casual warm tone.`;

  if (p.onboarding_complete) {
    s += `\n\nABOUT ${n.toUpperCase()}: Name: ${n}, City: ${p.city||'?'}, Situation: ${(p.situation||[]).join(', ')||'?'}, Goals: ${(p.goals||[]).join(', ')||'?'}, Obstacles: ${(p.obstacles||[]).join(', ')||'?'}, Hobbies: ${(p.hobbies||[]).join(', ')||'?'}`;
    if (mem) s += `\nMEMORY:\n${mem}`;
    s += `\nCOACHING MODE: ${n} has completed onboarding. Now help them take action.
- Keep the same short, casual tone. 1-2 sentences per message.
- Ask one thing at a time. Don't overwhelm.
- Suggest general types of activities (not specific companies or URLs).
- If they did their mission, celebrate briefly then give the next one.
- If they didn't, no guilt. Adjust and make it smaller.
- Reference what you know about them naturally.
- Stay conversational. This is a chat, not a coaching session.`;
  } else {
    const f = nextField(p);
    const steps = {
      'first_name': `Say exactly: "Hey, I'm Max, your AI companion here at Stop Being Alone. I help people build real connections, one small step at a time. What's your first name?"`,
      'city': `Greet them by name naturally. Ask what city they're in so you can find stuff near them. Let it flow like a normal intro conversation.`,
      'situation': `React to their city naturally (not a cliche). Then ease into asking what's been going on, or what brought them here. Don't rush it, this is a sensitive question. Make them feel safe to share.`,
      'goals': `React genuinely to what they shared. Then naturally ask where they'd like to be in a few months. Frame it as forward-looking, not clinical.`,
      'obstacles': `Acknowledge what they said naturally. Then ask what usually gets in the way, frame it as wanting to help them work around it.`,
      'hobbies': `Acknowledge naturally. Mention this is the last thing you need to get started. Ask what they enjoy doing or want to try.`,
      'done': `Give ${n} ONE small, specific action for this week based on their hobbies (${(p.hobbies||[]).join(', ')}), city (${p.city}), and obstacles (${(p.obstacles||[]).join(', ')}). No invented company names or URLs. Just a clear, doable action. End with something like "Think you can do that?"`
    };
    s += `\n\nONBOARDING STEP: ${f}
INSTRUCTION: ${steps[f]||steps['first_name']}
KNOWN:${p.first_name ? ' Name='+p.first_name : ''}${p.city ? ' City='+p.city : ''}${p.situation?.length ? ' Situation='+p.situation.join(', ') : ''}${p.goals?.length ? ' Goals='+p.goals.join(', ') : ''}${p.obstacles?.length ? ' Obstacles='+p.obstacles.join(', ') : ''}
RULES: Do ONLY the step above. NEVER ask for info already known. NEVER re-introduce yourself after first message. NEVER use em-dashes. ALWAYS end with a question during onboarding (except final mission). Let the conversation flow naturally, don't rush through questions.`;
  }
  return s;
}

const H = {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'};
const json = (c,o) => ({statusCode:c, headers:H, body:JSON.stringify(o)});

exports.handler = async (event) => {
  if (event.httpMethod==='OPTIONS') return {statusCode:200, headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'POST, OPTIONS'}};
  if (event.httpMethod!=='POST') return json(405,{error:'Method not allowed'});

  try {
    const {message} = JSON.parse(event.body);
    const ah = event.headers.authorization||event.headers.Authorization;
    if (!ah?.startsWith('Bearer ')) return json(401,{error:'Not authenticated'});

    const {data:{user},error:ae} = await SB.auth.getUser(ah.replace('Bearer ',''));
    if (ae||!user) return json(401,{error:'Invalid token'});
    const uid = user.id;

    // Load profile
    let {data:rows} = await SB.from('user_profiles').select('*').eq('user_id',uid);
    let p = rows?.length ? rows[0] : null;
    if (!p) {
      await SB.from('user_profiles').insert({user_id:uid, subscription_tier:'free', onboarding_complete:false, messages_this_week:0, messages_today:0, language:'en', situation:[], goals:[], obstacles:[], hobbies:[]});
      const {data:r2} = await SB.from('user_profiles').select('*').eq('user_id',uid);
      p = r2?.length ? r2[0] : {user_id:uid,first_name:null,city:null,situation:[],goals:[],obstacles:[],hobbies:[],onboarding_complete:false,subscription_tier:'free',messages_this_week:0,messages_today:0,language:'en'};
    }

    console.log('Profile:', p.first_name, p.city, 'step:', nextField(p));

    // Extract onboarding
    if (message && !p.onboarding_complete) {
      const field = nextField(p);
      if (field !== 'done') {
        const val = extract(field, message);
        console.log(`Extract [${field}]: "${message}" => ${JSON.stringify(val)}`);
        await SB.from('user_profiles').update({[field]:val}).eq('user_id',uid);
        // Re-read to confirm
        const {data:check} = await SB.from('user_profiles').select(field).eq('user_id',uid).single();
        console.log('Saved check:', JSON.stringify(check));
        p[field] = val;
      }
      if (nextField(p)==='done') {
        await SB.from('user_profiles').update({onboarding_complete:true}).eq('user_id',uid);
        p.onboarding_complete = true;
      }
    }

    // Quotas
    if (p.onboarding_complete && message) {
      if (p.subscription_tier==='free' && p.messages_this_week>=30) return json(200,{response:`Hey ${p.first_name||'there'}, you've used your free messages for the week. They reset Monday. You can upgrade at stopbeingalone.com/#pricing for unlimited access. Talk soon!`,quota_exceeded:true});
      if (['monthly','yearly','guided'].includes(p.subscription_tier) && p.messages_today>=200) return json(200,{response:`Lots of messages today. Let's pick up tomorrow.`,quota_exceeded:true});
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

    const sys = crisis ? `You are Max. User may be in crisis. Acknowledge with care. Provide: 988 (call/text), Crisis Text Line (text HOME to 741741). French: 3114, SOS Amitie. NEVER minimize. User: ${p.first_name||'there'}.` : buildSystem(p, mem?.[0]?.summary||null);
    if (message) conv.push({role:'user',content:message});
    if (!conv.length && !p.onboarding_complete) conv.push({role:'user',content:'[First visit]'});

    let result = await callClaude(sys, conv, MODEL);
    if (!result) result = await callClaude(sys, conv, HAIKU);
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

    // Chips flag for onboarding steps
    const chipFields = {
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
    const nf = nextField(p);
    const chips = (!p.onboarding_complete && chipFields[nf]) ? { step: nf, options: chipFields[nf] } : null;

    return json(200,{response:reply, model_used:'sonnet-4.6', crisis_detected:crisis, chips});
  } catch(e) {
    console.error('FATAL:', e.message, e.stack);
    return json(500,{error:'Server error'});
  }
};
