require("dotenv").config();
const http = require("http");
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require("discord.js");
const fetch = require("node-fetch");
const { setLink, getLink } = require("./storage");
const { fetchRecentMatches, computeAgentStats } = require("./matchstats");
const {
  recordMessage,
  recordReactionGiven,
  recordReactionReceived,
  addVoiceTime,
  flush: flushActivity,
} = require("./activity");
const { recalculateTags, getMemberTag } = require("./applyTags");
const { MANAGED_TAGS } = require("./tagging");

// --- Tiny HTTP server, only needed for free hosts (like Render) that require ---
// --- a web service to bind to a port. Not needed if you host as a worker/VPS. ---
const PORT = process.env.PORT || 3000;
http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Valorant rank bot is running.");
  })
  .listen(PORT, () => console.log(`Keep-alive web server listening on port ${PORT}`));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

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

function padRight(str, width) {
  str = String(str);
  return str.length >= width ? str.slice(0, width) : str + " ".repeat(width - str.length);
}

function padLeft(str, width) {
  str = String(str);
  return str.length >= width ? str.slice(0, width) : " ".repeat(width - str.length) + str;
}

function fmtNum(value, decimals = 1) {
  return value === null || Number.isNaN(value) ? "N/A" : value.toFixed(decimals);
}

function fmtSigned(value) {
  if (value === null || Number.isNaN(value)) return "N/A";
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

// Renders agent rows into a fixed-width, monospace table for a code block.
function buildAgentTable(rows) {
  const cols = [
    { key: "agent", label: "Agent", width: 12 },
    { key: "matches", label: "Matches", width: 7 },
    { key: "winRate", label: "Win%", width: 6 },
    { key: "kd", label: "K/D", width: 5 },
    { key: "adr", label: "ADR", width: 6 },
    { key: "acs", label: "ACS", width: 6 },
    { key: "dd", label: "DDΔ", width: 5 },
    { key: "bestMap", label: "Best Map", width: 18 },
  ];

  const header = cols.map((c) => padRight(c.label, c.width)).join(" ");
  const divider = cols.map((c) => "-".repeat(c.width)).join(" ");

  const lines = rows.map((row) => {
    const bestMapStr = row.bestMap
      ? `${row.bestMap.name} (${row.bestMap.winRate.toFixed(0)}% WR)`
      : "N/A";

    const cells = {
      agent: row.agentName,
      matches: row.matches,
      winRate: pct(row.winRate),
      kd: fmtNum(row.kd, 2),
      adr: fmtNum(row.adr, 0),
      acs: fmtNum(row.acs, 0),
      dd: fmtSigned(row.ddDelta),
      bestMap: bestMapStr,
    };

    return cols.map((c) => padRight(cells[c.key], c.width)).join(" ");
  });

  return ["```", header, divider, ...lines, "```"].join("\n");
}

async function runTagRecalculation() {
  for (const guild of client.guilds.cache.values()) {
    try {
      const { totalMembers, changed } = await recalculateTags(guild);
      console.log(`[tags] ${guild.name}: checked ${totalMembers} members, updated ${changed}.`);
    } catch (err) {
      console.error(`[tags] Failed for ${guild.name}:`, err.message);
    }
  }
}

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on("messageCreate", (message) => {
  if (message.author.bot || !message.guild) return;
  recordMessage(message.author.id);
});

client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;
  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();
  } catch (err) {
    console.error("Failed to fetch partial reaction:", err.message);
    return;
  }
  if (!reaction.message.guild) return;
  recordReactionGiven(user.id);
  const authorId = reaction.message.author?.id;
  if (authorId && authorId !== user.id && !reaction.message.author.bot) {
    recordReactionReceived(authorId);
  }
});

const voiceJoinTimestamps = new Map(); // userId -> timestamp entered voice

client.on("voiceStateUpdate", (oldState, newState) => {
  const userId = newState.id;
  const wasInVoice = !!oldState.channelId;
  const isInVoice = !!newState.channelId;

  if (!wasInVoice && isInVoice) {
    voiceJoinTimestamps.set(userId, Date.now());
  } else if (wasInVoice && !isInVoice) {
    const joinedAt = voiceJoinTimestamps.get(userId);
    if (joinedAt) {
      addVoiceTime(userId, Date.now() - joinedAt);
      voiceJoinTimestamps.delete(userId);
    }
  }
  // switching channels while staying in voice keeps the session running
});

function closeOpenVoiceSessions() {
  const now = Date.now();
  for (const [userId, joinedAt] of voiceJoinTimestamps) {
    addVoiceTime(userId, now - joinedAt);
  }
  voiceJoinTimestamps.clear();
}

function shutdown() {
  closeOpenVoiceSessions();
  flushActivity();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

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

      const { rows: agentRows, skipCounts, totalMatches } = computeAgentStats(matches, name, tag, {
        topN: 5,
        debug: process.env.DEBUG_STATS === "true",
      });


      if (agentRows.length === 0) {
        let reason = "No matches with usable round/win data found in that sample.";
        if (skipCounts.playerNotFound === totalMatches) {
          reason = `Couldn't match "${name}#${tag}" against any of the ${totalMatches} matches pulled — the name/tag on file may be out of date. Try re-linking with \`/setriot\`.`;
        } else if (skipCounts.noRoundData === totalMatches) {
          reason = `All ${totalMatches} matches pulled had no rounds/win data (e.g. all Deathmatch/Escalation). Try increasing \`matches\` or check back after a ranked/unrated game.`;
        } else if (skipCounts.noTeamResult > 0) {
          reason = `Found matches but couldn't resolve a team result for ${skipCounts.noTeamResult} of them — this looks like an API data-shape issue rather than a Deathmatch issue.`;
        }
        await interaction.editReply(
          reason + (process.env.DEBUG_STATS === "true" ? "\n(Debug logging is on — check the bot's console/logs for per-match details.)" : "")
        );
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`${name}#${tag} — Top Agents`)
        .setDescription(
          `Based on the last ${matches.length} matches pulled (Deathmatch/Escalation excluded — no rounds/win data).\n` +
            buildAgentTable(agentRows)
        )
        .setColor(0x2b2b3a)
        .setFooter({ text: `Region: ${region.toUpperCase()} • DDΔ = your ACS vs. lobby average ACS` });

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

  // ---------- /recalc-tags ----------
  if (interaction.commandName === "recalc-tags") {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.reply({ content: "You need the Manage Roles permission to run this.", ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    try {
      const { totalMembers, changed } = await recalculateTags(interaction.guild);
      await interaction.editReply(`Recalculated tags for ${totalMembers} members — ${changed} role updates made.`);
    } catch (err) {
      console.error(err);
      await interaction.editReply(`Couldn't recalculate tags: ${err.message}`);
    }
    return;
  }

  // ---------- /member ----------
  if (interaction.commandName === "member") {
    await interaction.deferReply();

    try {
      const members = await interaction.guild.members.fetch();
      const humanMembers = members.filter((m) => !m.user.bot);

      const entries = humanMembers.map((member) => ({
        id: member.id,
        displayName: member.displayName,
        tag: getMemberTag(member),
      }));

      const UNTAGGED = "Chưa gắn thẻ";
      const tagOrder = [...MANAGED_TAGS, UNTAGGED];
      entries.sort((a, b) => {
        const tagDiff = tagOrder.indexOf(a.tag) - tagOrder.indexOf(b.tag);
        return tagDiff !== 0 ? tagDiff : a.displayName.localeCompare(b.displayName);
      });

      const PAGE_SIZE = 15;
      const pages = [];
      for (let i = 0; i < entries.length; i += PAGE_SIZE) {
        pages.push(entries.slice(i, i + PAGE_SIZE));
      }
      if (pages.length === 0) pages.push([]);

      const buildEmbed = (pageIndex) => {
        const page = pages[pageIndex];
        const lines = page.length
          ? page.map((e) => `<@${e.id}> — **${e.tag}**`).join("\n")
          : "Không có thành viên nào.";
        return new EmbedBuilder()
          .setTitle(`Danh sách thành viên (${entries.length} người)`)
          .setDescription(lines)
          .setColor(0x5865f2)
          .setFooter({ text: `Trang ${pageIndex + 1}/${pages.length}` });
      };

      const buildRow = (pageIndex) =>
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("member_prev")
            .setLabel("◀ Trước")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(pageIndex === 0),
          new ButtonBuilder()
            .setCustomId("member_next")
            .setLabel("Sau ▶")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(pageIndex === pages.length - 1)
        );

      let currentPage = 0;
      const message = await interaction.editReply({
        embeds: [buildEmbed(currentPage)],
        components: pages.length > 1 ? [buildRow(currentPage)] : [],
      });

      if (pages.length <= 1) return;

      const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 2 * 60 * 1000, // stop listening after 2 minutes
      });

      collector.on("collect", async (btnInteraction) => {
        if (btnInteraction.user.id !== interaction.user.id) {
          await btnInteraction.reply({
            content: "Chỉ người dùng lệnh mới có thể chuyển trang.",
            ephemeral: true,
          });
          return;
        }

        if (btnInteraction.customId === "member_prev") currentPage = Math.max(0, currentPage - 1);
        if (btnInteraction.customId === "member_next")
          currentPage = Math.min(pages.length - 1, currentPage + 1);

        await btnInteraction.update({
          embeds: [buildEmbed(currentPage)],
          components: [buildRow(currentPage)],
        });
      });

      collector.on("end", async () => {
        try {
          await interaction.editReply({ components: [] }); // disable buttons after timeout
        } catch {
          // message may already be gone (e.g. channel deleted) — ignore
        }
      });
    } catch (err) {
      console.error(err);
      await interaction.editReply("Something went wrong fetching the member list.");
    }
    return;
  }
});

client.login(process.env.DISCORD_TOKEN);