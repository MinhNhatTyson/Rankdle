// JSON-file storage for the /rankdle "Guess the Rank" minigame.
// Same simple pattern as storage.js / activity.js / agentleStorage.js.

const fs = require("fs");
const path = require("path");

const VIDEOS_PATH = path.join(__dirname, "rankdleVideos.json");
const POOLS_PATH = path.join(__dirname, "rankdlePools.json");
const GUESSES_PATH = path.join(__dirname, "rankdleGuesses.json");
const STATS_PATH = path.join(__dirname, "rankdleStats.json");

function loadJSON(filePath, fallback) {
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2));
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error(`${path.basename(filePath)} is corrupt, starting fresh:`, err);
    return fallback;
  }
}
function saveJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ---------------- Videos ----------------
// { nextId, videos: { [id]: { id, uploaderId, storageChannelId, storageMessageId,
//                              filename, tier, uploadedAt, status: "pending"|"used", dateKey } } }
function loadVideos() {
  return loadJSON(VIDEOS_PATH, { nextId: 1, videos: {} });
}
function saveVideos(db) {
  saveJSON(VIDEOS_PATH, db);
}

function addSubmission({ uploaderId, storageChannelId, storageMessageId, filename, tier }) {
  const db = loadVideos();
  const id = String(db.nextId++);
  db.videos[id] = {
    id,
    uploaderId,
    storageChannelId,
    storageMessageId,
    filename,
    tier,
    uploadedAt: Date.now(),
    status: "pending",
    dateKey: null,
  };
  saveVideos(db);
  return db.videos[id];
}

function getPendingVideos() {
  const db = loadVideos();
  return Object.values(db.videos).filter((v) => v.status === "pending");
}

function getVideo(id) {
  const db = loadVideos();
  return db.videos[id] || null;
}

function markVideosUsed(ids, dateKey) {
  const db = loadVideos();
  for (const id of ids) {
    if (db.videos[id]) {
      db.videos[id].status = "used";
      db.videos[id].dateKey = dateKey;
    }
  }
  saveVideos(db);
}

// ---------------- Daily pools ----------------
// { [dateKey]: { videoIds: [...], postedAt } }
function loadPools() {
  return loadJSON(POOLS_PATH, {});
}
function savePools(db) {
  saveJSON(POOLS_PATH, db);
}
function getPool(dateKey) {
  const db = loadPools();
  return db[dateKey] || null;
}
function savePool(dateKey, videoIds) {
  const db = loadPools();
  db[dateKey] = { videoIds, postedAt: Date.now() };
  savePools(db);
  return db[dateKey];
}

// ---------------- Guesses ----------------
// { [dateKey]: { [userId]: { [videoId]: { guessTier, correct, guessedAt } } } }
function loadGuesses() {
  return loadJSON(GUESSES_PATH, {});
}
function saveGuesses(db) {
  saveJSON(GUESSES_PATH, db);
}
function getUserGuesses(dateKey, userId) {
  const db = loadGuesses();
  return db[dateKey]?.[userId] || {};
}
function recordGuess(dateKey, userId, videoId, guessTier, correct) {
  const db = loadGuesses();
  db[dateKey] ??= {};
  db[dateKey][userId] ??= {};
  db[dateKey][userId][videoId] = { guessTier, correct, guessedAt: Date.now() };
  saveGuesses(db);
}

// ---------------- Lifetime stats ----------------
function loadStats() {
  return loadJSON(STATS_PATH, {});
}
function saveStatsDb(db) {
  saveJSON(STATS_PATH, db);
}
function recordStatGuess(userId, correct) {
  const db = loadStats();
  const s = (db[userId] ??= { totalGuesses: 0, correctGuesses: 0 });
  s.totalGuesses++;
  if (correct) s.correctGuesses++;
  saveStatsDb(db);
  return s;
}
function getStats(userId) {
  const db = loadStats();
  return db[userId] || { totalGuesses: 0, correctGuesses: 0 };
}

module.exports = {
  addSubmission,
  getPendingVideos,
  getVideo,
  markVideosUsed,
  getPool,
  savePool,
  getUserGuesses,
  recordGuess,
  recordStatGuess,
  getStats,
};