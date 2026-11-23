import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMessage, buildState } from '../src/parser.js';

// Real messages from the GroupMe group, with sample dates (Central time, UTC-6 in November).
const SAMPLES = [
  ['WRMC on ER Divert as of 2000', '2026-11-20T20:02-06:00', 'wrmc/ed/on@20:00'],
  ['WRMC remains on ER Divert', '2026-11-20T22:30-06:00', 'wrmc/ed/confirm@22:30'],
  ['WRMC off ER Divert', '2026-11-21T00:00-06:00', 'wrmc/ed/off@00:00'],
  ['Mercy Rogers on ED Divert', '2026-11-21T03:11-06:00', 'mercy-rogers/ed/on@03:11'],
  ['Mercy Rogers is OFF ED Divert', '2026-11-21T03:44-06:00', 'mercy-rogers/ed/off@03:44'],
  ['Freeman Bentonville continues stroke divert', '2026-11-21T08:18-06:00', 'freeman-bentonville/stroke/confirm@08:18'],
  ['Freeman Bentonville is OFF Stroke Divert', '2026-11-21T12:11-06:00', 'freeman-bentonville/stroke/off@12:11'],
  ['House supervisor WRMC is on ER Divert', '2026-11-21T15:03-06:00', 'wrmc/ed/on@15:03'],
  ['WRMC remains on ED Divert', '2026-11-21T17:33-06:00', 'wrmc/ed/confirm@17:33'],
  ['Freeman Centerton FSED on stroke divert starting at 18:00', '2026-11-21T17:48-06:00', 'freeman-centerton/stroke/on@18:00'],
  ['WRMC continues ER divert.', '2026-11-21T18:56-06:00', 'wrmc/ed/confirm@18:56'],
  ['WRMC off ER Divert at 0014', '2026-11-22T00:15-06:00', 'wrmc/ed/off@00:14'],
];

const central = ms => new Date(ms - 6 * 3600e3).toISOString().slice(11, 16);

test('reads every sample message', () => {
  for (const [text, at, want] of SAMPLES) {
    const r = parseMessage(text, Date.parse(at));
    assert.ok(r.ok, text);
    const e = r.events[0];
    assert.equal(`${e.hospitalId}/${e.service}/${e.kind}@${central(e.effectiveAt)}`, want, text);
  }
});

test('stated time just past midnight lands on the right day', () => {
  const sent = Date.parse('2026-11-22T00:15-06:00');
  assert.equal(parseMessage('WRMC off ER Divert at 0014', sent).events[0].effectiveAt, Date.parse('2026-11-22T00:14-06:00'));
});

test('flags chatter and unknown hospitals', () => {
  assert.equal(parseMessage('Can someone call me back', 0).ok, false);
  assert.equal(parseMessage('St Somewhere on ER divert', 0).ok, false);
});

test('replay ends with only Centerton on stroke divert', () => {
  const msgs = SAMPLES.map(([text, at], i) => ({ id: String(i), sentAt: Date.parse(at), parsed: parseMessage(text, Date.parse(at)) }));
  const st = buildState(msgs, Date.parse('2026-11-22T01:00-06:00'));
  const active = Object.entries(st).flatMap(([h, s]) => Object.entries(s).filter(([, v]) => v.active).map(([k]) => `${h}/${k}`));
  assert.deepEqual(active, ['freeman-centerton/stroke']);
});

test('multi-line and open messages', () => {
  const at = Date.parse('2026-10-14T07:09-05:00');
  const r = parseMessage('Mercy Rogers is on ED Divert\nMercy Bella Vista and Springdale are open', at);
  assert.deepEqual(r.events.map(e => `${e.hospitalId}/${e.service}/${e.kind}`), ['mercy-rogers/ed/on', 'mercy-bella-vista/*/off', 'mercy-springdale/*/off']);
  const o = parseMessage('Freeman Bentonville and Centerton open', at);
  assert.deepEqual(o.events.map(e => `${e.hospitalId}/${e.service}/${e.kind}`).sort(), ['freeman-bentonville/*/off', 'freeman-centerton/*/off']);
  assert.equal(parseMessage('Is WRMC open?', at).ok, false);
  const d = parseMessage('Mercy Rogers is on ED Delay', at);
  assert.deepEqual(d.events.map(e => e.service), ['delay']);
  const msgs = [['WRMC on ER divert', 0], ['WRMC is open', 60000]].map(([text, t], i) => ({ id: String(i), sentAt: at + t, parsed: parseMessage(text, at + t) }));
  assert.equal(buildState(msgs, at + 120000).wrmc.ed.active, false);
});

test('ED divert clears an open ED delay', () => {
  const at = Date.parse('2026-11-10T12:00-06:00');
  const msgs = ['Mercy Rogers is on ED Delay', 'Mercy Rogers is ED Divert', 'Mercy Rogers is OFF ED Divert']
    .map((text, i) => ({ id: String(i), sentAt: at + i * 60000, parsed: parseMessage(text, at + i * 60000) }));
  const st = buildState(msgs, at + 600000)['mercy-rogers'];
  assert.equal(st.delay.active, false);
  assert.equal(st.ed.active, false);
});

test('Mercy lines name Bella Vista and Springdale', () => {
  const at = Date.parse('2026-11-01T11:11-05:00');
  const ids = parseMessage('Mercy Rogers, Bella Vista, and Springdale are open', at).events.map(e => e.hospitalId).sort();
  assert.deepEqual(ids, ['mercy-bella-vista', 'mercy-rogers', 'mercy-springdale']);
  assert.deepEqual(parseMessage('Freeman Fay is open', at).events.map(e => e.hospitalId), ['freeman-fayetteville']);
  assert.deepEqual(parseMessage('Freeman Springdale is on ER divert', at).events.map(e => e.hospitalId), ['freeman-springdale']);
});
