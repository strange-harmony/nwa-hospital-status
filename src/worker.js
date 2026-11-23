import { HOSPITALS, SERVICES, parseMessage, buildState, lastReports } from './parser.js';
import { saveMessage } from './store.js';
import { pollGroupMe } from './poll.js';

// How far back to replay messages when building current status.
const HISTORY_DAYS = 14;

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

async function receiveGroupMe(request, env) {
  let body;
  try { body = await request.json(); } catch { return new Response('bad json', { status: 400 }); }
  if (env.GROUPME_GROUP_ID && String(body.group_id) !== env.GROUPME_GROUP_ID) return new Response('wrong group', { status: 403 });
  // saveMessage skips bots and system notices; only people post statuses.
  await saveMessage(env, body);
  return new Response('ok');
}

async function status(env) {
  const now = Date.now();
  // All stored messages: the last 14 days decide status, and any age counts for "Updated at".
  const { results } = await env.DB.prepare('SELECT id, sender, text, sent_at FROM messages ORDER BY sent_at ASC').all();
  const all = results.map(r => ({ id: r.id, from: r.sender, text: r.text, sentAt: r.sent_at, parsed: parseMessage(r.text, r.sent_at) }));
  const recent = all.filter(m => m.sentAt > now - HISTORY_DAYS * 86400e3);
  return json({
    now,
    hospitals: HOSPITALS.map(({ id, name, note }) => ({ id, name, note })),
    services: SERVICES.map(({ id, label }) => ({ id, label })),
    state: buildState(recent, now),
    lastReport: lastReports(all),
    messages: recent.slice(-200).reverse(),
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // The token in the path keeps strangers from posting fake statuses.
    if (request.method === 'POST' && env.GROUPME_PATH_TOKEN && url.pathname === `/groupme/${env.GROUPME_PATH_TOKEN}`) return receiveGroupMe(request, env);
    if (request.method === 'GET' && url.pathname === '/api/status') return status(env);
    return env.ASSETS.fetch(request);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(pollGroupMe(env));
  },
};
