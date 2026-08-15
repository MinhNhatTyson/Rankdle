// Core logic for /rankdle — "Guess the Rank". Members upload short clips with
// their real rank in a private channel. Each day, up to 5 clips are randomly
// queued; every /rankdle guess call dispenses the next one in that queue.

const { findTier } = require("../config/rankTiers");

function dateKeyFor(date = new Date()) {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

// Re-fetches a stored clip's message to get a fresh (non-expired) attachment
// URL, since Discord's CDN URLs are signed and expire.
async function fetchFreshAttachment(client, video) {
  const channel = await client.channels.fetch(video.storageChannelId);
  const message = await channel.messages.fetch(video.storageMessageId);
  return message.attachments.first() || null;
}

// "close" = guessed tier is exactly one tier away from the real one.
function compareTierGuess(guessTierName, actualTierName) {
  const guess = findTier(guessTierName);
  const actual = findTier(actualTierName);
  if (!guess || !actual) return { correct: false, close: false };
  const diff = guess.order - actual.order;
  return { correct: diff === 0, close: diff !== 0 && Math.abs(diff) === 1 };
}

module.exports = { dateKeyFor, fetchFreshAttachment, compareTierGuess };