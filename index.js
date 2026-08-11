require("dotenv").config();
const http = require("http");
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch");
const { setLink, getLink } = require("./storage");
const { fetchRecentMatches, computeStats } = require("./matchStats");

// --- Tiny HTTP server, only needed for free hosts (like Render) that require ---
// --- a web service to bind to a port. Not needed if you host as a worker/VPS. ---
const PORT = process.env.PORT || 3000;
http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Valorant rank bot is running.");
  })
  .listen(PORT, () => console.log(`Keep-alive web server listening on port ${PORT}`));

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Rank tier colors just for nicer embeds (rough approximation)
const TIER_COLORS = {
  Iron: 0x4e4e4e,
  Bronze: 0x8c5a2b,
  Silver: 0xa8a8a8,
  Gold: 0xd4af37,
  Platinum: 0x2fb6a3,
  Diamond: 0xb066ff,
  Ascendant: 0x1fbf6f,
  Immortal: 0xb3395d,
  Radiant: 0xf5e6a8,
};

function colorForTier(tierName) {
  const key = Object.keys(TIER_COLORS).find((t) => tierName?.startsWith(t));
  return key ? TIER_COLORS[key] : 0x2b2b3a;
}

function pct(value) {
  return value === null ? "N/A" : `${value.toFixed(1)}%`;
}

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // ---------- /setriot ----------
  if (interaction.commandName === "setriot") {
    const name = interaction.options.getString("name");
    const tag = interaction.options.getString("tag").replace(/^#/, "");
    const region = interaction.options.getString("region");

    setLink(interaction.user.id, { name, tag, region });

    await interaction.reply({
      content: `Linked your Riot ID as **${name}#${tag}** (${region.toUpperCase()}). You can now use /rank and /stats.`,
      ephemeral: true,
    });
    return;
  }

  // ---------- /rank ----------
  if (interaction.commandName === "rank") {
    const targetUser = interaction.options.getUser("member") || interaction.user;
    const link = getLink(targetUser.id);

    if (!link) {
      await interaction.reply({
        content:
          targetUser.id === interaction.user.id
            ? "You haven't linked a Riot ID yet. Use `/setriot` first."
            : `${targetUser.username} hasn't linked a Riot ID yet.`,
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    try {
      const { name, tag, region } = link;
      const url = `https://api.henrikdev.xyz/valorant/v2/mmr/${region}/${encodeURIComponent(
        name
      )}/${encodeURIComponent(tag)}`;

      const res = await fetch(url, {
        headers: { Authorization: process.env.HENRIK_API_KEY },
      });

      if (res.status === 404) {
        await interaction.editReply("Couldn't find that Riot ID. Double-check the name/tag/region with `/setriot`.");
        return;
      }
      if (!res.ok) {
        await interaction.editReply(`Rank lookup failed (HTTP ${res.status}). Try again in a bit.`);
        return;
      }

      const data = await res.json();
      const current = data?.data?.current_data;

      if (!current || !current.currenttierpatched) {
        await interaction.editReply("That account doesn't have a ranked result yet this act.");
        return;
      }

      const tierName = current.currenttierpatched; // e.g. "Diamond 2"
      const rr = current.ranking_in_tier ?? 0;
      const eloChange = current.mmr_change_to_last_game ?? 0;
      const rankIcon = current.images?.large;

      const embed = new EmbedBuilder()
        .setTitle(`${name}#${tag}`)
        .setDescription(`**${tierName}** — ${rr} RR`)
        .addFields({
          name: "Last match RR change",
          value: `${eloChange > 0 ? "+" : ""}${eloChange}`,
          inline: true,
        })
        .setColor(colorForTier(tierName))
        .setFooter({ text: `Region: ${region.toUpperCase()}` });

      if (rankIcon) embed.setThumbnail(rankIcon);

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error(err);
      await interaction.editReply("Something went wrong fetching that rank. Try again shortly.");
    }
  }

  // ---------- /stats ----------
  if (interaction.commandName === "stats") {
    const targetUser = interaction.options.getUser("member") || interaction.user;
    const matchCount = interaction.options.getInteger("matches") ?? 10;
    const link = getLink(targetUser.id);

    if (!link) {
      await interaction.reply({
        content:
          targetUser.id === interaction.user.id
            ? "You haven't linked a Riot ID yet. Use `/setriot` first."
            : `${targetUser.username} hasn't linked a Riot ID yet.`,
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    try {
      const { name, tag, region } = link;
      const matches = await fetchRecentMatches({ name, tag, region, size: matchCount });

      if (!matches || matches.length === 0) {
        await interaction.editReply("Couldn't find any recent matches for that account.");
        return;
      }

      const stats = computeStats(matches, name, tag);

      if (stats.matchesConsidered === 0) {
        await interaction.editReply("Couldn't match that Riot ID up against its own match history. Try again in a bit.");
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`${name}#${tag} — last ${stats.matchesConsidered} matches`)
        .addFields(
          {
            name: "Most-used agent",
            value: stats.topAgent
              ? `${stats.topAgent.name} (${stats.topAgent.count}/${stats.matchesConsidered} games)`
              : "N/A",
          },
          { name: "Headshot rate", value: pct(stats.headshotRate), inline: true },
          {
            name: "Win rate",
            value:
              stats.decidedMatches > 0
                ? `${pct(stats.winRate)} (${stats.wins}W-${stats.decidedMatches - stats.wins}L)`
                : "N/A (no decided matches, e.g. all Deathmatch)",
            inline: true,
          }
        )
        .setColor(0x2b2b3a)
        .setFooter({ text: `Region: ${region.toUpperCase()}` });

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error(err);
      if (err.status === 404) {
        await interaction.editReply("Couldn't find that Riot ID's match history. Double-check with `/setriot`.");
      } else {
        await interaction.editReply("Something went wrong fetching those stats. Try again shortly.");
      }
    }
  }
});

client.login(process.env.DISCORD_TOKEN);