// Core logic for /agentle — a Wordle/LoLdle-style "guess the Valorant agent" game.
const { AGENTS } = require("../config/valorantAgents");

const MAX_GUESSES = 8;

const agentByName = new Map(AGENTS.map((a) => [a.name.toLowerCase(), a]));

// Deterministic "agent of the day" — same seed for every user on a given
// calendar date (UTC), so everyone solves the same puzzle that day.
function dateKeyFor(date = new Date()) {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function agentOfTheDay(dateKey) {
  return AGENTS[hashString(dateKey) % AGENTS.length];
}

function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findAgentByName(input) {
  const needle = input.trim().toLowerCase();
  if (agentByName.has(needle)) return agentByName.get(needle);
  const target = normalize(needle); // handles "kay o" / "kayo" -> "KAY/O"
  return AGENTS.find((a) => normalize(a.name) === target) || null;
}

function searchAgentNames(query, limit = 25) {
  const needle = query.trim().toLowerCase();
  const matches = AGENTS.filter((a) => a.name.toLowerCase().includes(needle));
  const list = matches.length > 0 ? matches : AGENTS;
  return list.slice(0, limit).map((a) => ({ name: a.name, value: a.name }));
}

// Compares a guessed agent against the answer, category by category.
// direction on releaseYear: "up" = answer is later than the guess, "down" = answer is earlier.
function compareGuess(guess, answer) {
  const yearDiff = guess.releaseYear - answer.releaseYear;

  return {
    id: guess.id,
    name: guess.name,
    role: { value: guess.role, correct: guess.role === answer.role },
    origin: { value: guess.origin, correct: guess.origin === answer.origin },
    color: { value: guess.color, correct: guess.color === answer.color },
    gender: { value: guess.gender, correct: guess.gender === answer.gender },
    releaseYear: {
      value: guess.releaseYear,
      correct: yearDiff === 0,
      direction: yearDiff === 0 ? null : yearDiff > 0 ? "down" : "up",
      close: yearDiff !== 0 && Math.abs(yearDiff) <= 1,
    },
    isCorrect: guess.id === answer.id,
  };
}

module.exports = {
  MAX_GUESSES,
  AGENTS,
  dateKeyFor,
  agentOfTheDay,
  findAgentByName,
  searchAgentNames,
  compareGuess,
};