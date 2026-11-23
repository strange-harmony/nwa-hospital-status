import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pollGroupMe } from '../src/poll.js';

// Minimal stand-in for D1: just enough for the two queries pollGroupMe and saveMessage run.
function fakeDB() {
  const rows = [];
  return {
    rows,
    prepare(sql) {
      return {
        bind: (...a) => ({
          first: async () => [...rows].sort((x, y) => y.sent_at - x.sent_at)[0] || null,
          run: async () => {
            if (rows.some(r => r.id === a[0])) return { meta: { changes: 0 } };
            rows.push({ id: a[0], group_id: a[1], sender: a[2], text: a[3], sent_at: a[4] });
            return { meta: { changes: 1 } };
          },
        }),
      };
    },
  };
}
const msg = (id, t, text, sender_type = 'user') => ({ id: String(id), group_id: '42', name: 'Test', text, created_at: t, sender_type });

test('first run loads the latest page, later runs ask for messages after the newest', async () => {
  const env = { DB: fakeDB(), GROUPME_TOKEN: 'tok', GROUPME_GROUP_ID: '42' };
  const urls = [];
  let page = [msg(2, 200, 'WRMC remains on ER divert'), msg(1, 100, 'WRMC on ER divert'), msg(9, 150, 'bot says hi', 'bot')];
  const fetchFn = async url => { urls.push(url); const p = page; page = []; return p.length ? new Response(JSON.stringify({ response: { messages: p } })) : new Response(null, { status: 304 }); };

  assert.equal(await pollGroupMe(env, fetchFn), 2);
  assert.ok(!urls[0].includes('after_id'));
  page = [msg(3, 300, 'WRMC off ER divert')];
  assert.equal(await pollGroupMe(env, fetchFn), 1);
  assert.ok(urls[1].includes('after_id=2'));
  assert.equal(await pollGroupMe(env, fetchFn), 0);
  assert.deepEqual(env.DB.rows.map(r => r.id), ['1', '2', '3']);
});

test('does nothing without a token', async () => {
  assert.equal(await pollGroupMe({ DB: fakeDB() }, () => { throw new Error('should not fetch'); }), 0);
});
