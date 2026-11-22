# NWA Hospital Status

A web dashboard that shows each Northwest Arkansas hospital's diversion status, read from the hospital GroupMe group.

A GroupMe bot posts every new group message to this Cloudflare Worker. The Worker stores the message in D1, and the dashboard rebuilds each hospital's status by replaying the last 14 days of messages through a rules parser (`src/parser.js`).

## How messages are read

- `on` / `is on` → diversion starts; `continues` / `remains` → still on (updates "last confirmed"); `off` → diversion ends.
- ER and ED both mean ED divert. Stroke, STEMI, trauma, OB, peds and CT are tracked separately.
- A stated time (`as of 2000`, `at 0014`, `starting at 18:00`) is used as the effective time, in Central time.
- Messages with no divert language, no known hospital, or more than one hospital are shown in the log as not a status.
- Edited GroupMe messages are not seen; GroupMe only sends new messages to bots.

Hospital names and nicknames live in `HOSPITALS` in `src/parser.js`.

## Setup

1. Create the database: `npx wrangler d1 create nwa-hospital-status`, put its id in `wrangler.jsonc`, then `npm run db:init`.
2. Set the bot secret: `npx wrangler secret put GROUPME_PATH_TOKEN` (any long random string).
3. Deploy: `npm run deploy`, or connect this repo in the Cloudflare dashboard so every push deploys.
4. At dev.groupme.com, create a bot in the group with callback URL `https://<worker-url>/groupme/<GROUPME_PATH_TOKEN>`.
5. Optional: set `GROUPME_GROUP_ID` in `wrangler.jsonc` so only that group is accepted.

## Develop

```
npm install
npm test
npx wrangler d1 execute nwa-hospital-status --local --file=schema.sql
echo GROUPME_PATH_TOKEN=dev > .dev.vars
npm run dev
```
