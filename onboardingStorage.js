// JSON-file storage for new-member onboarding survey answers.
// Same simple pattern as storage.js / activity.js.

const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "onboarding.json");

function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({}, null, 2));
  }
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  } catch (err) {
    console.error("onboarding.json is corrupt, starting fresh:", err);
    return {};
  }
}

function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function saveOnboarding(userId, { games, freeTime }) {
  const db = loadDB();
  db[userId] = {
    games,
    freeTime,
    completedAt: Date.now(),
  };
  saveDB(db);
  return db[userId];
}

function getOnboarding(userId) {
  const db = loadDB();
  return db[userId] || null;
}

function hasCompletedOnboarding(userId) {
  return getOnboarding(userId) !== null;
}

module.exports = { saveOnboarding, getOnboarding, hasCompletedOnboarding };