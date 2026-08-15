// JSON-file storage for the /agentle game: daily per-user progress plus
// lifetime streak stats. Same simple pattern as storage.js / activity.js.
const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "../data/agentleState.json");
const STATS_PATH = path.join(__dirname, "../data/agentleStats.json");

function loadJSON(filePath) {
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, JSON.stringify({}, null, 2));
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error(`${path.basename(filePath)} is corrupt, starting fresh:`, err);
    return {};
  }
}

function saveJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Returns today's game state for a user, creating a fresh one if the
// stored state is from a previous day (or doesn't exist yet).
function getOrCreateGame(userId, dateKey, answerId) {
  const db = loadJSON(DB_PATH);
  if (db[userId] && db[userId].date === dateKey) return db[userId];

  const fresh = { date: dateKey, answerId, guesses: [], solved: false, gaveUp: false };
  db[userId] = fresh;
  saveJSON(DB_PATH, db);
  return fresh;
}

function saveGame(userId, state) {
  const db = loadJSON(DB_PATH);
  db[userId] = state;
  saveJSON(DB_PATH, db);
}

function recordResult(userId, dateKey, won) {
  const stats = loadJSON(STATS_PATH);
  const s = (stats[userId] ??= { played: 0, wins: 0, currentStreak: 0, bestStreak: 0, lastPlayedDate: null });

  if (s.lastPlayedDate === dateKey) return s; // already recorded today
  s.played++;
  s.lastPlayedDate = dateKey;
  if (won) {
    s.wins++;
    s.currentStreak++;
    s.bestStreak = Math.max(s.bestStreak, s.currentStreak);
  } else {
    s.currentStreak = 0;
  }

  saveJSON(STATS_PATH, stats);
  return s;
}

function getStats(userId) {
  const stats = loadJSON(STATS_PATH);
  return stats[userId] || { played: 0, wins: 0, currentStreak: 0, bestStreak: 0, lastPlayedDate: null };
}

module.exports = { getOrCreateGame, saveGame, recordResult, getStats };