require("dotenv").config();
const REQUIRED_ENV_VARS = [
  "DISCORD_TOKEN",
  "CLIENT_ID",
  "GUILD_ID",
  "HENRIK_API_KEY",
  "UPLOAD_CHANNEL_ID",
  "GUESS_CHANNEL_ID",
];
const missingEnvVars = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
if (missingEnvVars.length > 0) {
  console.error(`[startup] Missing required environment variable(s): ${missingEnvVars.join(", ")}`);
  console.error("[startup] Set these in your .env file (local) or Render's Environment tab (deployed), then restart.");
  process.exit(1);
}
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
  StringSelectMenuBuilder,
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
const {
  MAX_GUESSES,
  dateKeyFor,
  agentOfTheDay,
  findAgentByName,
  searchAgentNames,
  compareGuess,
} = require("./agentle");
const { getOrCreateGame, saveGame, recordResult } = require("./agentleStorage");
const { addSubmission, getVideo, dispenseNextVideo, getPoolProgress, clearPool, getVideoSummary, getUserGuesses, recordGuess, recordStatGuess, getStats: getRankdleStats } = require("./rankdleStorage");
const { dateKeyFor: rankdleDateKeyFor, fetchFreshAttachment, compareTierGuess } = require("./rankdle");
const { tierChoices } = require("./rankTiers");

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

// ---- Debug logging: surfaces discord.js-level errors/warnings that would
// otherwise fail silently (rate limits, REST failures, gateway issues). ----
client.on("error", (err) => {
  console.error("[discord.js client error]", err);
});
client.on("warn", (msg) => {
  console.warn("[discord.js warn]", msg);
});
client.rest.on("rateLimited", (info) => {
  console.warn("[discord.js rate limit]", JSON.stringify(info));
});

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
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

function formatGuessLine(cmp) {
  const check = (correct) => (correct ? "🟩" : "🟥");
  let yearEmoji = "🟩";
  let yearArrow = "";
  if (!cmp.releaseYear.correct) {
    yearEmoji = cmp.releaseYear.close ? "🟨" : "🟥";
    yearArrow = cmp.releaseYear.direction === "up" ? "⬆️" : "⬇️";
  }

  return (
    `**${cmp.name}**\n` +
    `${check(cmp.role.correct)} Role: ${cmp.role.value}  ` +
    `${check(cmp.origin.correct)} Origin: ${cmp.origin.value}  ` +
    `${check(cmp.color.correct)} Color: ${cmp.color.value}  ` +
    `${check(cmp.gender.correct)} Gender: ${cmp.gender.value}  ` +
    `${yearEmoji} Year: ${cmp.releaseYear.value} ${yearArrow}`
  );
}

function buildAgentleEmbed(state, { finished = false, answerAgent = null } = {}) {
  const embed = new EmbedBuilder()
    .setTitle("🕵️ Agentle — Guess the Valorant Agent")
    .setColor(0xff4655)
    .setFooter({ text: `Guess ${state.guesses.length}/${MAX_GUESSES}` });

  embed.setDescription(
    state.guesses.length === 0
      ? "Use `/agentle guess agent:<name>` to make your first guess.\n" +
        "Each guess reveals Role, Origin, Primary Color, Gender, and Release Year — 🟩 match, 🟨 close, 🟥 no match."
      : state.guesses.map(formatGuessLine).join("\n\n")
  );

  if (finished && answerAgent) {
    const label = state.solved ? "🎉 Solved!" : state.gaveUp ? "Answer revealed" : "Out of guesses";
    embed.addFields({ name: label, value: `Today's agent was **${answerAgent.name}**.` });
  }

  return embed;
}

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isAutocomplete() || interaction.commandName !== "agentle") return;
  const focused = interaction.options.getFocused();
  await interaction.respond(searchAgentNames(focused));
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

  // ---------- /agentle ----------
  if (interaction.commandName === "agentle") {
    const sub = interaction.options.getSubcommand();
    const dateKey = dateKeyFor();
    const answer = agentOfTheDay(dateKey);
    const state = getOrCreateGame(interaction.user.id, dateKey, answer.id);
    const isFinished = state.solved || state.gaveUp || state.guesses.length >= MAX_GUESSES;

    if (sub === "status") {
      await interaction.reply({
        embeds: [buildAgentleEmbed(state, { finished: isFinished, answerAgent: isFinished ? answer : null })],
        ephemeral: true,
      });
      return;
    }

    if (sub === "giveup") {
      if (isFinished) {
        await interaction.reply({ embeds: [buildAgentleEmbed(state, { finished: true, answerAgent: answer })] });
        return;
      }
      state.gaveUp = true;
      saveGame(interaction.user.id, state);
      recordResult(interaction.user.id, dateKey, false);
      await interaction.reply({ embeds: [buildAgentleEmbed(state, { finished: true, answerAgent: answer })] });
      return;
    }

    if (sub === "guess") {
      if (isFinished) {
        await interaction.reply({
          content: state.solved || state.gaveUp
            ? "You've already finished today's puzzle. Come back tomorrow!"
            : "You're out of guesses for today. Come back tomorrow!",
          ephemeral: true,
        });
        return;
      }

      const guessName = interaction.options.getString("agent");
      const guessAgent = findAgentByName(guessName);
      if (!guessAgent) {
        await interaction.reply({
          content: `Couldn't find an agent named "${guessName}". Pick one from the autocomplete list.`,
          ephemeral: true,
        });
        return;
      }
      if (state.guesses.some((g) => g.id === guessAgent.id)) {
        await interaction.reply({ content: "You've already guessed that agent today.", ephemeral: true });
        return;
      }

      const cmp = compareGuess(guessAgent, answer);
      state.guesses.push(cmp);
      if (cmp.isCorrect) state.solved = true;

      const nowFinished = state.solved || state.guesses.length >= MAX_GUESSES;
      saveGame(interaction.user.id, state);
      if (nowFinished) recordResult(interaction.user.id, dateKey, state.solved);

      await interaction.reply({
        embeds: [buildAgentleEmbed(state, nowFinished ? { finished: true, answerAgent: answer } : {})],
      });
      return;
    }
  }

  // ---------- /upload-video ----------
  if (interaction.commandName === "upload-video") {
    const attachment = interaction.options.getAttachment("video");
    const rank = interaction.options.getString("rank");

    // Debug: log exactly what discord.js received for this attachment.
    console.log("[upload-video debug]", {
      name: attachment.name,
      size: attachment.size,
      contentType: attachment.contentType,
      url: attachment.url,
      width: attachment.width,
      height: attachment.height,
      duration: attachment.duration ?? null,
    });

    if (interaction.channelId !== process.env.UPLOAD_CHANNEL_ID) {
      await interaction.reply({
        content: `Please upload clips in <#${process.env.UPLOAD_CHANNEL_ID}>.`,
        ephemeral: true,
      });
      return;
    }
    const looksLikeVideo =
      attachment.contentType?.startsWith("video/") || /\.(mp4|mov|webm|mkv)$/i.test(attachment.name || "");
    if (!looksLikeVideo) {
      await interaction.reply({ content: "That doesn't look like a video file. Please attach a video clip.", ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const storageMsg = await interaction.channel.send({
        content: `📥 Clip from <@${interaction.user.id}> — rank: **${rank}** (queued for Guess the Rank)`,
        files: [{ attachment: attachment.url, name: attachment.name }],
      });

      addSubmission({
        uploaderId: interaction.user.id,
        storageChannelId: storageMsg.channelId,
        storageMessageId: storageMsg.id,
        filename: attachment.name,
        tier: rank,
      });

      await interaction.editReply(`Clip saved as **${rank}**. It'll go into a future daily Guess the Rank pool.`);
    } catch (err) {
      // Debug: dump everything discord.js knows about this failure —
      // HTTP status, Discord's error code, and the raw response body.
      console.error("[upload-video debug] re-upload failed:", {
        message: err.message,
        code: err.code,
        status: err.status,
        method: err.method,
        url: err.url,
        requestBody: err.requestBody,
        rawError: err.rawError,
      });
      await interaction.editReply(
        `Something went wrong saving that clip (${err.code ?? err.message}). Try again shortly.`
      );
    }
    return;
  }

  // ---------- /rankdle ----------
  if (interaction.commandName === "rankdle") {
    const sub = interaction.options.getSubcommand();
    const dateKey = rankdleDateKeyFor();

    if (sub === "stats") {
      const s = getRankdleStats(interaction.user.id);
      const acc = s.totalGuesses > 0 ? ((s.correctGuesses / s.totalGuesses) * 100).toFixed(1) : "0.0";
      await interaction.reply({
        content: `You've guessed ${s.totalGuesses} clip(s), ${s.correctGuesses} correct (${acc}%).`,
        ephemeral: true,
      });
      return;
    }

    if (sub === "status") {
      const progress = getPoolProgress(dateKey);
      if (progress.videoIds.length === 0) {
        await interaction.reply({
          content: "No clips have been dispensed yet today. Be the first — run `/rankdle guess`!",
          ephemeral: true,
        });
        return;
      }
      const userGuesses = getUserGuesses(dateKey, interaction.user.id);
      const dispensedIds = progress.videoIds.slice(0, progress.servedIndex);
      const lines = dispensedIds.map((id, i) => {
        const g = userGuesses[id];
        return g
          ? `Clip ${i + 1}: you guessed **${g.guessTier}** — ${g.correct ? "✅ correct" : "❌ wrong"}`
          : `Clip ${i + 1}: dispensed, but not guessed by you`;
      });
      await interaction.reply({
        content: `Today: ${progress.servedIndex}/${progress.videoIds.length} clip(s) dispensed so far.\n${
          lines.join("\n") || "None yet."
        }`,
        ephemeral: true,
      });
      return;
    }

    if (sub === "guess") {
      const dispensed = dispenseNextVideo(dateKey);

      if (dispensed.done) {
        const msg =
          dispensed.total === 0
            ? "No clips are available today — ask people to upload some with `/upload-video`!"
            : `All ${dispensed.total} of today's clips have already been shown. Come back tomorrow!`;
        await interaction.reply({ content: msg, ephemeral: true });
        return;
      }

      const video = getVideo(dispensed.videoId);
      const isOwnClip = video.uploaderId === interaction.user.id;

      const guessChannel = await client.channels.fetch(process.env.GUESS_CHANNEL_ID).catch(() => null);
      if (!guessChannel) {
        await interaction.reply({
          content: "The guess channel isn't set up correctly — ask an admin to check GUESS_CHANNEL_ID.",
          ephemeral: true,
        });
        return;
      }

      const postingHere = interaction.channelId === guessChannel.id;
      await interaction.deferReply({ ephemeral: !postingHere });

      let attachment;
      try {
        attachment = await fetchFreshAttachment(client, video);
      } catch (err) {
        console.error("[rankdle] Failed to refetch stored clip:", err);
      }
      if (!attachment) {
        await interaction.editReply(
          "Couldn't load that clip's video file — it may have been deleted from the upload channel. Try `/rankdle guess` again."
        );
        return;
      }

      const selectRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("rankdle_guess_select")
          .setPlaceholder("What rank do you think this is?")
          .addOptions(tierChoices().map((c) => ({ label: c.name, value: c.value })))
      );

      const embed = new EmbedBuilder()
        .setTitle(`🎬 Clip ${dispensed.clipNumber}/${dispensed.total} — Guess the Rank`)
        .setDescription(
          isOwnClip
            ? "That's actually your own clip — you can watch, but guessing is disabled for you."
            : `Watch the clip, then pick a rank from the dropdown below. <@${interaction.user.id}> has 3 minutes to guess.`
        )
        .setColor(0x2b2b3a);

      const payload = {
        embeds: [embed],
        files: [{ attachment: attachment.url, name: video.filename || "clip.mp4" }],
        components: isOwnClip ? [] : [selectRow],
      };

      let sentMessage;
      if (postingHere) {
        sentMessage = await interaction.editReply(payload);
      } else {
        sentMessage = await guessChannel.send(payload);
        await interaction.editReply(`Posted in <#${guessChannel.id}> — go make your guess!`);
      }

      if (isOwnClip) return;

      try {
        const selectInteraction = await sentMessage.awaitMessageComponent({
          componentType: ComponentType.StringSelect,
          filter: (i) => i.user.id === interaction.user.id,
          time: 3 * 60 * 1000,
        });

        const guessRank = selectInteraction.values[0];
        const { correct, close } = compareTierGuess(guessRank, video.tier);
        recordGuess(dateKey, interaction.user.id, video.id, guessRank, correct);
        recordStatGuess(interaction.user.id, correct);

        const resultLine = correct
          ? `✅ Correct! This clip was **${video.tier}**.`
          : close
          ? `🟨 Close! You guessed **${guessRank}**, actual was **${video.tier}** (one tier off).`
          : `❌ Not quite. You guessed **${guessRank}**, actual was **${video.tier}**.`;

        await selectInteraction.update({
          embeds: [EmbedBuilder.from(embed).setDescription(resultLine)],
          components: [],
        });
      } catch (err) {
        // No selection within the time limit — just clean up the dropdown.
        try {
          const timeoutEmbed = EmbedBuilder.from(embed).setDescription("⌛ Time's up — no guess was made for this clip.");
          if (postingHere) {
            await interaction.editReply({ embeds: [timeoutEmbed], components: [] });
          } else {
            await sentMessage.edit({ embeds: [timeoutEmbed], components: [] });
          }
        } catch {
          // message may already be gone — ignore
        }
      }
      return;
    }
  }

  // ---------- /rankdle-reset (temporary debug/admin command) ----------
  if (interaction.commandName === "rankdle-reset") {
    const dateKey = rankdleDateKeyFor();
    try {
      clearPool(dateKey);
      await interaction.reply({
        content: `Cleared today's (${dateKey}) Guess the Rank pool. Run \`/rankdle guess\` again to regenerate it from pending uploads.`,
        ephemeral: true,
      });
    } catch (err) {
      console.error("[rankdle-reset] failed:", err);
      await interaction.reply({ content: `Reset failed: ${err.message}`, ephemeral: true });
    }
    return;
  }

  // ---------- /rankdle-inspect (temporary debug/admin command) ----------
  if (interaction.commandName === "rankdle-inspect") {
    const summary = getVideoSummary();
    if (summary.length === 0) {
      await interaction.reply({ content: "No videos in storage at all.", ephemeral: true });
      return;
    }
    const lines = summary.map(
      (v) => `#${v.id} — status: **${v.status}**, dateKey: ${v.dateKey ?? "null"}, tier: ${v.tier}, uploader: <@${v.uploaderId}>`
    );
    await interaction.reply({ content: lines.join("\n"), ephemeral: true });
    return;
  }
});

client.login(process.env.DISCORD_TOKEN);