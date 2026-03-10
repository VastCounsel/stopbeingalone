// ============================================
// MAX MEMORY - Weekly Summary Generator
// Stop Being Alone - AI Companion
// ============================================
// Deploy to: /netlify/functions/max-memory.js
// Schedule: Runs every Sunday at midnight UTC
// Netlify config: [functions."max-memory"] schedule = "0 0 * * 0"

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

const SUMMARY_PROMPT = `You are a memory summarizer for Max, an AI companion that helps people with loneliness.

Analyze the following conversation history from the past week and extract a structured summary.

Return a JSON object (no markdown, no backticks) with these fields:
{
  "summary": "A 2-3 paragraph narrative summary of the week. What happened, how the user felt, what progress was made, what setbacks occurred. Write it as notes for Max to reference later.",
  "people_mentioned": ["list of names of friends, family, coworkers the user mentioned"],
  "missions_given": [{"mission": "description", "completed": true/false/null}],
  "places_mentioned": ["specific places: coffee shops, gyms, parks, restaurants, etc."],
  "activities_tried": ["activities the user tried or talked about trying"],
  "emotional_patterns": "Brief note on what seems to energize vs drain this person"
}

If any field has no data, use an empty array [] or null.
Focus on information Max should remember for future conversations.`;

exports.handler = async (event) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Get all users who had conversations this week
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const { data: activeUsers } = await supabase
    .from('conversations')
    .select('user_id')
    .gte('created_at', oneWeekAgo.toISOString())
    .order('user_id');

  // Deduplicate user IDs
  const userIds = [...new Set((activeUsers || []).map(r => r.user_id))];

  console.log(`Processing memory summaries for ${userIds.length} active users`);

  let processed = 0;
  let errors = 0;

  for (const userId of userIds) {
    try {
      // Load this week's conversations
      const { data: messages } = await supabase
        .from('conversations')
        .select('role, content, created_at')
        .eq('user_id', userId)
        .gte('created_at', oneWeekAgo.toISOString())
        .order('created_at', { ascending: true });

      if (!messages || messages.length < 3) continue; // Skip if too few messages

      // Load user profile for context
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('first_name, city, hobbies, goals')
        .eq('user_id', userId)
        .single();

      const conversationText = messages
        .map(m => `[${new Date(m.created_at).toLocaleDateString()}] ${m.role}: ${m.content}`)
        .join('\n');

      const userContext = profile
        ? `User: ${profile.first_name || 'Unknown'}, City: ${profile.city || 'Unknown'}, Hobbies: ${(profile.hobbies || []).join(', ') || 'Unknown'}`
        : '';

      // Call Claude to generate summary
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: HAIKU_MODEL,
          max_tokens: 1000,
          system: SUMMARY_PROMPT,
          messages: [
            { role: 'user', content: `${userContext}\n\nConversations this week:\n${conversationText}` }
          ],
        }),
      });

      const data = await res.json();
      const rawText = (data.content?.[0]?.text || '').trim();

      // Parse JSON response
      let summary;
      try {
        summary = JSON.parse(rawText.replace(/```json\n?|```/g, '').trim());
      } catch {
        console.error(`Failed to parse summary for user ${userId}:`, rawText.substring(0, 200));
        errors++;
        continue;
      }

      // Store in user_memory
      const weekStart = new Date(oneWeekAgo);
      weekStart.setDate(weekStart.getDate() + 1); // Monday

      await supabase.from('user_memory').insert({
        user_id: userId,
        summary: summary.summary || '',
        people_mentioned: summary.people_mentioned || [],
        missions_given: summary.missions_given || [],
        places_mentioned: summary.places_mentioned || [],
        activities_tried: summary.activities_tried || [],
        emotional_patterns: summary.emotional_patterns || null,
        week_start: weekStart.toISOString().split('T')[0],
      });

      processed++;
    } catch (err) {
      console.error(`Error processing user ${userId}:`, err);
      errors++;
    }
  }

  console.log(`Memory generation complete: ${processed} processed, ${errors} errors`);

  return {
    statusCode: 200,
    body: JSON.stringify({ processed, errors, total: userIds.length }),
  };
};
