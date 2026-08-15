// JSON-file storage for member interaction/activity data used for auto-tagging.
// Kept in memory and flushed to disk periodically to avoid a disk write per message.

const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "../data/activity.json");
const FLUSH_INTERVAL_MS = 15_000;

function loadFromDisk() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({}, null, 2));
  }
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  } catch (err) {
    console.error("activity.json is corrupt, starting fresh:", err);
    return {};
  }
}

let db = loadFromDisk();
let dirty = false;

function flush() {
  if (!dirty) return;
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  dirty = false;
}

setInterval(flush, FLUSH_INTERVAL_MS).unref();
process.on("exit", flush); // last-resort sync flush if the process exits unexpectedly

function ensureUser(userId) {
  if (!db[userId]) {
    db[userId] = {
      messageCount: 0,
      reactionsGiven: 0,
      reactionsReceived: 0,
      voiceMs: 0,
      lastUpdated: Date.now(),
    };
  }
  return db[userId];
}

function recordMessage(userId) {
  ensureUser(userId).messageCount++;
  db[userId].lastUpdated = Date.now();
  dirty = true;
}

function recordReactionGiven(userId) {
  ensureUser(userId).reactionsGiven++;
  db[userId].lastUpdated = Date.now();
  dirty = true;
}

function recordReactionReceived(userId) {
  ensureUser(userId).reactionsReceived++;
  db[userId].lastUpdated = Date.now();
  dirty = true;
}

function addVoiceTime(userId, ms) {
  if (ms <= 0) return;
  ensureUser(userId).voiceMs += ms;
  db[userId].lastUpdated = Date.now();
  dirty = true;
}

function getActivity(userId) {
  return db[userId] || { messageCount: 0, reactionsGiven: 0, reactionsReceived: 0, voiceMs: 0 };
}

function getAllActivity() {
  return db;
}

module.exports = {
  recordMessage,
  recordReactionGiven,
  recordReactionReceived,
  addVoiceTime,
  getActivity,
  getAllActivity,
  flush,
};