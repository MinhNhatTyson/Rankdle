// Core logic for /rankdle — "Guess the Rank". Members upload short clips with
// their real rank in a private channel; once a day, up to 5 unused clips are
// randomly picked, anonymized, and posted to a public channel for others to
// guess the rank of.

const { EmbedBuilder } = require("discord.js");
const { findTier } = require("./rankTiers");
const { getPendingVideos, getVideo, markVideosUsed, getPool, savePool } = require("./rankdleStorage");

const DAILY_POOL_SIZE = 5;

function dateKeyFor(date = new Date()) {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Re-fetches a stored clip's message to get a fresh (non-expired) attachment
// URL, since Discord's CDN URLs are signed and expire.
async function fetchFreshAttachment(client, video) {
  const channel = await client.channels.fetch(video.storageChannelId);
  const message = await channel.messages.fetch(video.storageMessageId);
  return message.attachments.first() || null;
}

// Ensures today's pool of up to 5 clips exists, posting them (anonymized —
// no uploader identity) to the guess channel the first time they're needed.
// Safe to call on every /rankdle invocation — only posts once per day.
async function ensureDailyPool(dateKey, guessChannel, client) {
  const existing = getPool(dateKey);
  if (existing) return existing;

  const pending = shuffle(getPendingVideos()).slice(0, DAILY_POOL_SIZE);
  if (pending.length === 0) return savePool(dateKey, []);

  markVideosUsed(pending.map((v) => v.id), dateKey);

  for (let i = 0; i < pending.length; i++) {
    const video = pending[i];
    const attachment = await fetchFreshAttachment(client, video);
    if (!attachment) {
      console.error(`[rankdle] Couldn't refetch stored clip for video ${video.id}, skipping.`);
      continue;
    }

    const embed = new EmbedBuilder()
      .setTitle(`Clip #${i + 1} — Guess the Rank`)
      .setDescription("Watch the clip, then run `/rankdle guess` to lock in your guess.")
      .setColor(0x2b2b3a)
      .setFooter({ text: `Today's clip ${i + 1}/${pending.length}` });

    await guessChannel.send({
      embeds: [embed],
      files: [{ attachment: attachment.url, name: video.filename || `clip-${i + 1}.mp4` }],
    });
  }

  return savePool(dateKey, pending.map((v) => v.id));
}

// "close" = guessed tier is exactly one tier away from the real one.
function compareTierGuess(guessTierName, actualTierName) {
  const guess = findTier(guessTierName);
  const actual = findTier(actualTierName);
  if (!guess || !actual) return { correct: false, close: false };
  const diff = guess.order - actual.order;
  return { correct: diff === 0, close: diff !== 0 && Math.abs(diff) === 1 };
}

module.exports = { dateKeyFor, ensureDailyPool, compareTierGuess, DAILY_POOL_SIZE };