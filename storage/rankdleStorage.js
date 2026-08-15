// JSON-file storage for the /rankdle "Guess the Rank" minigame.
// Same simple pattern as storage.js / activity.js / agentleStorage.js.

const fs = require("fs");
const path = require("path");

const VIDEOS_PATH = path.join(__dirname, "../data/rankdleVideos.json");
const POOLS_PATH = path.join(__dirname, "../data/rankdlePools.json");
const GUESSES_PATH = path.join(__dirname, "../data/rankdleGuesses.json");
const STATS_PATH = path.join(__dirname, "../data/rankdleStats.json");

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

function getVideoSummary() {
  const db = loadVideos();
  return Object.values(db.videos).map((v) => ({
    id: v.id,
    status: v.status,
    dateKey: v.dateKey,
    tier: v.tier,
    uploaderId: v.uploaderId,
  }));
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

// ---------------- Daily pool (shared, order-based) ----------------
// { [dateKey]: { videoIds: [...5 random ids, fixed order], servedIndex } }
// servedIndex tracks how many /rankdle guess calls have dispensed a clip
// today — NOT per-user. This is a server-wide budget of 5 clips/day.
const DAILY_POOL_SIZE = 5;

function loadPools() {
  return loadJSON(POOLS_PATH, {});
}
function savePools(db) {
  saveJSON(POOLS_PATH, db);
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getPoolProgress(dateKey) {
  const db = loadPools();
  return db[dateKey] || { videoIds: [], servedIndex: 0 };
}

function clearPool(dateKey) {
  const db = loadPools();
  delete db[dateKey];
  savePools(db);
}

// Pops the next not-yet-served clip off today's pool, creating the pool
// (randomly, from currently pending uploads) the first time it's called
// each day. Returns { done: true, total } once all of today's clips have
// been dispensed, or { done: false, videoId, clipNumber, total } otherwise.
function dispenseNextVideo(dateKey) {
  const db = loadPools();
  let pool = db[dateKey];

  // Don't treat a pool with zero clips as "created" — retry pending videos
  // on the next call instead of permanently locking in an empty day.
  if (!pool || pool.videoIds.length === 0) {
    const chosen = shuffle(getPendingVideos()).slice(0, DAILY_POOL_SIZE);
    if (chosen.length > 0) {
      pool = { videoIds: chosen.map((v) => v.id), servedIndex: 0 };
      db[dateKey] = pool;
      markVideosUsed(chosen.map((v) => v.id), dateKey);
      savePools(db);
    } else {
      pool = pool || { videoIds: [], servedIndex: 0 };
    }
  }

  if (pool.videoIds.length === 0) return { done: true, total: 0 };
  if (pool.servedIndex >= pool.videoIds.length) return { done: true, total: pool.videoIds.length };

  const clipNumber = pool.servedIndex + 1;
  const videoId = pool.videoIds[pool.servedIndex];
  pool.servedIndex++;
  db[dateKey] = pool;
  savePools(db);

  return { done: false, videoId, clipNumber, total: pool.videoIds.length };
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
  getVideoSummary,
  getVideo,
  markVideosUsed,
  dispenseNextVideo,
  getPoolProgress,
  clearPool,
  getUserGuesses,
  recordGuess,
  recordStatGuess,
  getStats,
};