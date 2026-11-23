// Saves one GroupMe message (from the bot callback or from polling). Duplicates are ignored.
export async function saveMessage(env, m) {
  if (m.sender_type !== 'user' || !m.text || !m.id) return false;
  const res = await env.DB.prepare('INSERT OR IGNORE INTO messages (id, group_id, sender, text, sent_at, received_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(String(m.id), String(m.group_id), m.name || 'Unknown', m.text, (m.created_at || Date.now() / 1000) * 1000, Date.now())
    .run();
  return res.meta?.changes > 0;
}
