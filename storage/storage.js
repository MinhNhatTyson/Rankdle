// Very simple JSON-file storage for linking Discord users -> Riot IDs.
// Fine for a single-server bot. If you outgrow this, swap it for SQLite/Postgres later.

const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "../data/links.json");

function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({}, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function setLink(discordUserId, { name, tag, region }) {
  const db = loadDB();
  db[discordUserId] = { name, tag, region };
  saveDB(db);
}

function getLink(discordUserId) {
  const db = loadDB();
  return db[discordUserId] || null;
}

module.exports = { setLink, getLink };
