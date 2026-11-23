# NWA Hospital Status

A web dashboard that shows each Northwest Arkansas hospital's diversion status, read from the hospital GroupMe group.

Every minute, the Worker asks GroupMe for new group messages using a member's access token (a GroupMe bot posting to the Worker also works, if a group admin adds one). The Worker stores the message in D1, and the dashboard rebuilds each hospital's status by replaying the last 14 days of messages through a rules parser (`src/parser.js`).

## How messages are read

- `on` / `is on` → diversion starts; `continues` / `remains` → still on (updates "last confirmed"); `off` → diversion ends.
- ER and ED both mean ED divert. Stroke, STEMI, trauma, OB, peds and CT are tracked separately.
- A stated time (`as of 2000`, `at 0014`, `starting at 18:00`) is used as the effective time, in Central time.
- Messages with no divert language, no known hospital, or more than one hospital are shown in the log as not a status.
- The page is a full-screen TV board, hospitals in alphabetical order.
- Edited GroupMe messages are not seen; GroupMe only sends new messages to bots.

Hospital names and nicknames live in `HOSPITALS` in `src/parser.js`.

## Setup

1. Database: `nwa-hospital-status` (D1, already created and set up). To recreate it: `npx wrangler d1 create nwa-hospital-status`, put its id in `wrangler.jsonc`, then `npm run db:init`.
2. In the Cloudflare dashboard, under the worker's Settings > Variables and Secrets, add:
   - `GROUPME_GROUP_ID`: the group's id (the number in the group's web.groupme.com address).
   - `GROUPME_TOKEN` (secret): a group member's access token from dev.groupme.com. Polling starts on the next minute and loads the latest 100 messages first.
3. Deploys happen automatically on every push to `main` (Cloudflare Workers Builds).
4. Optional, instead of polling: a group admin creates a bot at dev.groupme.com/bots with callback URL `https://<worker-url>/groupme/<GROUPME_PATH_TOKEN>`, and `GROUPME_PATH_TOKEN` is set as a secret.

## Develop

```
npm install
npm test
npx wrangler d1 execute nwa-hospital-status --local --file=schema.sql
echo GROUPME_PATH_TOKEN=dev > .dev.vars
npm run dev
```
