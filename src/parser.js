// Turns one GroupMe message into zero or more diversion events.
export const HOSPITALS = [
  { id: 'freeman-bentonville', name: 'Freeman Bentonville', aliases: ['freeman bentonville'] },
  { id: 'freeman-centerton', name: 'Freeman Centerton', note: 'FSED', aliases: ['freeman centerton', 'centerton fsed', 'centerton'] },
  { id: 'freeman-springdale', name: 'Freeman Springdale', aliases: ['freeman springdale'] },
  { id: 'freeman-siloam', name: 'Freeman Siloam Springs', aliases: ['freeman siloam springs', 'freeman siloam', 'siloam springs', 'siloam'] },
  { id: 'mercy-rogers', name: 'Mercy Rogers', aliases: ['mercy rogers', 'mercy nwa'] },
  { id: 'mercy-berryville', name: 'Mercy Berryville', aliases: ['mercy berryville', 'berryville'] },
  { id: 'mercy-bella-vista', name: 'Mercy Bella Vista', note: 'FSED', aliases: ['mercy bella vista', 'bella vista'] },
  { id: 'mercy-springdale', name: 'Mercy Springdale', aliases: ['mercy springdale'] },
  { id: 'freeman-fayetteville', name: 'Freeman Fayetteville', note: 'FSED', aliases: ['freeman fayetteville', 'freeman fay'] },
  { id: 'wrmc', name: 'Washington Regional', aliases: ['washington regional medical center', 'washington regional', 'wrmc'] },
  { id: 'acnw', name: "Arkansas Children's NW", aliases: ["arkansas children's northwest", 'arkansas childrens northwest', "arkansas children's nw", 'arkansas childrens nw', 'achnw', 'acnw', "children's nw", 'childrens nw'] },
];

export const SERVICES = [
  { id: 'ed', label: 'ED', re: /\b(er|ed|emergency)\b/ },
  // "ED Delay": slower offloads, not a full divert.
  { id: 'delay', label: 'ED Delay', re: /\bdelay\b/ },
  { id: 'stroke', label: 'Stroke', re: /\bstroke\b/ },
  { id: 'stemi', label: 'STEMI', re: /\b(stemi|cardiac|cath)\b/ },
  { id: 'trauma', label: 'Trauma', re: /\btrauma\b/ },
  { id: 'ob', label: 'OB', re: /\b(ob|l&d|labor)\b/ },
  { id: 'peds', label: 'Peds', re: /\b(peds|pediatric)\b/ },
  { id: 'ct', label: 'CT', re: /\bct\b/ },
];

export const TIME_ZONE = 'America/Chicago';

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ALIAS_RES = HOSPITALS.map(h => ({ h, res: h.aliases.map(a => new RegExp('\\b' + escape(a) + '\\b')) }));

function findHospitals(t) {
  const found = ALIAS_RES.filter(({ res }) => res.some(re => re.test(t))).map(({ h }) => h);
  // "Mercy Rogers, Bella Vista, and Springdale are open": a bare "Springdale" in a Mercy-only line is Mercy's.
  if (/\bmercy\b/.test(t) && !/\bfreeman\b/.test(t) && /\bspringdale\b/.test(t) && !found.some(h => h.id === 'mercy-springdale')) {
    found.push(HOSPITALS.find(h => h.id === 'mercy-springdale'));
  }
  return found;
}

// "as of 2000", "at 0014", "starting at 18:00" -> minutes after midnight
function findTime(t) {
  const m = t.match(/(?:\bas of|\bat|\bstarting(?: at)?|\bbeginning(?: at)?|\beffective|@)\s*(\d{1,2}):?(\d{2})\b/);
  if (!m) return null;
  const h = +m[1], min = +m[2];
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function localMinutes(date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const get = type => +parts.find(p => p.type === type).value;
  return get('hour') * 60 + get('minute');
}

// Returns { ok: true, events: [{ hospitalId, service, kind: 'on'|'off'|'confirm', effectiveAt: ms }] }
// or { ok: false, reason } when a person should look at it.
// Each line is read on its own, so "X on divert\nY and Z are open" doesn't mix the two up.
export function parseMessage(text, sentAtMs) {
  const lines = String(text || '').split(/\n+/).map(l => l.trim()).filter(Boolean);
  const results = lines.map(l => parseLine(l, sentAtMs));
  const events = results.filter(r => r.ok).flatMap(r => r.events);
  if (events.length) return { ok: true, events };
  return results[0] || { ok: false, reason: 'Empty message' };
}

function parseLine(text, sentAtMs) {
  const t = String(text || '').toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim();
  const hospitals = findHospitals(t);
  // "WRMC is open", "Freeman Bentonville and Centerton open": clears every divert for the named hospitals.
  if (!/\b(diver(t|sion|ted)|delay)\b/.test(t)) {
    if (hospitals.length && /\bopen\b/.test(t) && !/\?/.test(t)) {
      return { ok: true, events: hospitals.map(h => ({ hospitalId: h.id, service: '*', kind: 'off', effectiveAt: sentAtMs })) };
    }
    return { ok: false, reason: 'No divert language' };
  }
  if (!hospitals.length) return { ok: false, reason: 'No known hospital name' };
  if (hospitals.length > 1) return { ok: false, reason: 'More than one hospital named' };

  let kind;
  if (/\b(off|ended|lifted|no longer|open)\b/.test(t)) kind = 'off';
  else if (/\b(continues|continuing|remains|remaining|still)\b/.test(t)) kind = 'confirm';
  else if (/\b(on|going|is|placed|starting)\b/.test(t)) kind = 'on';
  else return { ok: false, reason: 'Could not tell on or off' };

  let services = SERVICES.filter(s => s.re.test(t)).map(s => s.id);
  if (services.includes('delay')) services = services.filter(s => s !== 'ed');
  if (!services.length) services = ['ed'];

  // A stated clock time is taken as the nearest such time to when the message was sent,
  // so "off at 0014" sent at 00:15 and "starting at 18:00" sent at 17:48 both land right.
  let effectiveAt = sentAtMs;
  const stated = findTime(t);
  if (stated !== null) {
    let delta = stated - localMinutes(new Date(sentAtMs));
    if (delta > 720) delta -= 1440;
    if (delta < -720) delta += 1440;
    effectiveAt = Math.floor(sentAtMs / 60000) * 60000 + delta * 60000;
  }

  return { ok: true, events: services.map(service => ({ hospitalId: hospitals[0].id, service, kind, effectiveAt })) };
}

// Replays parsed messages (oldest first) into per-hospital, per-service state.
export function buildState(messages, nowMs) {
  const st = Object.fromEntries(HOSPITALS.map(h => [h.id, {}]));
  for (const m of messages) {
    if (m.sentAt > nowMs || !m.parsed.ok) continue;
    for (const e of m.parsed.events) {
      if (e.service === '*') {
        for (const v of Object.values(st[e.hospitalId])) if (v.active) Object.assign(v, { active: false, since: e.effectiveAt, last: m.id });
        continue;
      }
      // ED divert supersedes ED delay, and coming off ED divert clears a delay nobody closed out.
      if (e.service === 'ed') { const dl = st[e.hospitalId].delay; if (dl && dl.active) Object.assign(dl, { active: false, since: e.effectiveAt, last: m.id }); }
      const cur = st[e.hospitalId][e.service];
      if (e.kind === 'off') st[e.hospitalId][e.service] = { active: false, since: e.effectiveAt, last: m.id };
      else if (cur && cur.active) { cur.lastConfirmed = m.sentAt; cur.last = m.id; }
      else st[e.hospitalId][e.service] = { active: true, since: e.effectiveAt, sinceUnknown: e.kind === 'confirm', lastConfirmed: m.sentAt, last: m.id };
    }
  }
  return st;
}

// Newest message that says anything about each hospital, including repeats like "WRMC is open".
export function lastReports(messages) {
  const out = {};
  for (const m of messages) {
    if (!m.parsed.ok) continue;
    for (const e of m.parsed.events) {
      if (!out[e.hospitalId] || out[e.hospitalId].sentAt < m.sentAt) out[e.hospitalId] = { sentAt: m.sentAt, text: m.text, from: m.from };
    }
  }
  return out;
}
