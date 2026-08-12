# Valorant Rank Bot

A simple Discord bot that lets members link their Riot ID and check anyone's current Valorant rank with a slash command.

## Commands
- `/setriot name:<riot name> tag:<riot tag> region:<region>` — link your Riot ID (private/ephemeral reply)
- `/rank [member]` — show your rank, or a mentioned member's rank

## Setup

1. **Install Node.js** (LTS version) if you don't have it: https://nodejs.org

2. **Install dependencies**
   ```
   npm install
   ```

3. **Configure secrets**
   - Copy `.env.example` to `.env`
   - Fill in `DISCORD_TOKEN` and `CLIENT_ID` from the Discord Developer Portal (discord.com/developers/applications)
   - Fill in `GUILD_ID` — your server's ID (enable Developer Mode in Discord settings, then right-click your server icon → Copy Server ID)
   - Fill in `HENRIK_API_KEY` — get a free key from the HenrikDev API Discord server

4. **Invite the bot to your server**
   - In the Developer Portal, go to OAuth2 → URL Generator
   - Check scopes: `bot`, `applications.commands`
   - Check bot permissions: `Send Messages`, `Use Slash Commands`, `Embed Links`
   - Open the generated URL and add the bot to your server

5. **Register the slash commands**
   ```
   npm run deploy
   ```

6. **Start the bot**
   ```
   npm start
   ```

## Notes
- Rank links are stored in `links.json` in this folder — back it up if you move hosts.
- If you want the bot online 24/7, deploy this folder to a host like Railway or Render and set the same environment variables there.
- The HenrikDev API is an unofficial, community-run wrapper around Riot's data — not affiliated with Riot Games. Its free tier has rate limits, which is plenty for a normal-sized server.
## Activity Tags

The bot tracks how active each member is (messages sent, reactions given/received, voice
channel time) and auto-assigns one Discord role per member:

- **Người mới** — joined within the last 7 days
- **Ít tương tác** — established member with low overall activity
- **Nói nhiều** — heavy chatter (top 20% by messages)
- **Cày voice** — heavy voice user (top 20% by voice time)
- **Năng nổ** — above-average overall engagement
- **Bình thường** — everyone else

Run `/recalc-tags` (requires Manage Roles) whenever you want to refresh tags — there's no automatic schedule.

**Extra setup required for this feature:**
1. Developer Portal → your app → Bot → enable **"Server Members Intent"** (privileged).
2. The bot needs the **Manage Roles** permission. If already invited, either re-invite
   with an updated OAuth2 URL (add `Manage Roles` to the permissions checklist) or grant
   it directly to the bot's role in Server Settings → Roles.
3. In Server Settings → Roles, make sure the bot's own role sits **above** the tag roles
   it creates (Discord places new roles near the bottom by default — drag the bot's role
   higher if needed).
4. Re-run `npm run deploy` to register the new `/recalc-tags` command.

Activity data is stored in `activity.json` next to `links.json` — back it up the same way.

Run `/member` to see every member's current tag, sorted by tag then name. If the
server has more than 15 members it paginates automatically — use the ◀/▶ buttons
(only the person who ran the command can navigate; buttons disable after 2 minutes idle).

## Agent Guessing Game (Agentle)

A Wordle/LoLdle-style daily game — guess the mystery Valorant agent based on trait feedback.

- `/agentle guess agent:<name>` — make a guess (autocomplete helps with names). Each guess shows
  🟩/🟨/🟥 feedback for **Role, Origin, Primary Color, Gender**, and **Release Year** (with an
  ⬆️/⬇️ arrow if you're off), so it takes a few guesses to narrow it down.
- `/agentle status` — check your progress on today's puzzle without spending a guess.
- `/agentle giveup` — reveal the answer and forfeit today's streak.

Everyone gets the same agent each day (based on the UTC date), and you get 8 guesses. Progress is
stored in `agentleState.json`, streaks in `agentleStats.json` — back these up the same way as
`links.json`. The agent list lives in `valorantAgents.js`; add a row there whenever Riot ships a
new agent (colors are a rough approximation, not official Riot data — edit freely).

## Guess the Rank (Rankdle)

Members upload short gameplay clips of themselves along with their real rank in a
private channel. Once a day, the bot randomly picks up to 5 not-yet-used clips,
strips uploader identity, and posts them to a public channel for everyone else to
guess the rank of.

- `/upload-video video:<clip> rank:<tier>` — upload a clip (only works in the
  designated private upload channel)
- `/rankdle guess clip:<1-5> rank:<tier>` — guess the rank of one of today's clips
  (you can't guess your own clip, and only one guess per clip per day)
- `/rankdle status` — see which of today's clips you've guessed and whether you got
  them right
- `/rankdle stats` — see your lifetime accuracy

**Setup required:**
1. Create a private channel (e.g. `#uploading-video`) — deny `@everyone` view
   access, and allow only the bot's role and your admin role.
2. Create a public channel (e.g. `#guess-the-rank`) where the bot posts each day's
   anonymized clips.
3. Set `UPLOAD_CHANNEL_ID` and `GUESS_CHANNEL_ID` in your environment variables to
   those two channel IDs.
4. Re-run `npm run deploy` to register `/upload-video` and `/rankdle`.

**How the daily pool works:** the pool is generated lazily — the first time anyone
runs `/rankdle` on a given UTC day, the bot randomly selects up to 5 pending clips
and posts them. There's no scheduler, so nothing happens until someone actually
runs the command that day.

Data is stored in `rankdleVideos.json`, `rankdlePools.json`, `rankdleGuesses.json`,
and `rankdleStats.json` — back these up the same way as `links.json`.

**Caveat:** Discord attachment URLs are signed and expire after a while. To avoid
posting dead links days after upload, the bot immediately re-hosts every uploaded
clip as its own message in the upload channel and re-fetches that message (for a
fresh URL) whenever the clip is later used in a daily pool.