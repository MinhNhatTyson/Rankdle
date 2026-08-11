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
