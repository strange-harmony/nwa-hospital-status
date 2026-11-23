import { saveMessage } from './store.js';

const API = 'https://api.groupme.com/v3';
// Pages fetched per run; GroupMe returns at most 100 messages per page.
const MAX_PAGES = 5;

// Pulls messages posted since the newest one we have, using a member's access token.
// Used when a bot can't be added to the group.
export async function pollGroupMe(env, fetchFn = fetch) {
  if (!env.GROUPME_TOKEN || !env.GROUPME_GROUP_ID) return 0;
  const base = `${API}/groups/${env.GROUPME_GROUP_ID}/messages`;
  const newest = await env.DB.prepare('SELECT id FROM messages WHERE group_id = ? ORDER BY sent_at DESC LIMIT 1')
    .bind(String(env.GROUPME_GROUP_ID)).first();
  let saved = 0;
  if (!newest) {
    // First run: load the latest page so diversions already in progress show up.
    const msgs = await getPage(fetchFn, `${base}?limit=100`, env.GROUPME_TOKEN);
    for (const m of msgs) if (await saveMessage(env, m)) saved++;
    return saved;
  }
  let after = newest.id;
  for (let i = 0; i < MAX_PAGES; i++) {
    const msgs = await getPage(fetchFn, `${base}?limit=100&after_id=${encodeURIComponent(after)}`, env.GROUPME_TOKEN);
    if (!msgs.length) break;
    for (const m of msgs) if (await saveMessage(env, m)) saved++;
    after = msgs[msgs.length - 1].id;
    if (msgs.length < 100) break;
  }
  return saved;
}

async function getPage(fetchFn, url, token) {
  const r = await fetchFn(url, { headers: { 'X-Access-Token': token } });
  if (r.status === 304) return [];
  if (!r.ok) throw new Error(`GroupMe returned HTTP ${r.status}`);
  const body = await r.json();
  // after_id pages come back oldest first; plain pages come back newest first.
  return [...(body.response?.messages || [])].sort((a, b) => a.created_at - b.created_at);
}
