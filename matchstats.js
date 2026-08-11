// Fetches recent match history from HenrikDev's v4 matches endpoint and
// crunches it into: most-played agent, headshot rate, and win rate.

const fetch = require("node-fetch");

// Modes where there's no "you won / you lost" outcome (free-for-all style).
// Matches in these modes are counted toward agent usage and headshot rate,
// but excluded from the win-rate calculation.
const NO_TEAM_RESULT_MODES = new Set(["deathmatch", "escalation"]);

async function fetchRecentMatches({ name, tag, region, size = 10 }) {
  const url = `https://api.henrikdev.xyz/valorant/v4/matches/${region}/pc/${encodeURIComponent(
    name
  )}/${encodeURIComponent(tag)}?size=${size}`;

  const res = await fetch(url, {
    headers: { Authorization: process.env.HENRIK_API_KEY },
  });

  if (!res.ok) {
    const err = new Error(`Match history request failed (HTTP ${res.status})`);
    err.status = res.status;
    throw err;
  }

  const body = await res.json();
  return body?.data ?? [];
}

// Pulls this player's entry out of a single match's player list.
function findPlayerInMatch(match, name, tag) {
  const players = match?.players ?? [];
  return players.find(
    (p) => p.name?.toLowerCase() === name.toLowerCase() && p.tag?.toLowerCase() === tag.toLowerCase()
  );
}

function computeStats(matches, name, tag) {
  const agentCounts = {};
  let totalHeadshots = 0;
  let totalBodyshots = 0;
  let totalLegshots = 0;
  let matchesConsidered = 0;
  let wins = 0;
  let decidedMatches = 0;

  for (const match of matches) {
    const me = findPlayerInMatch(match, name, tag);
    if (!me) continue; // shouldn't normally happen, but guard just in case

    matchesConsidered++;

    const agentName = me.agent?.name;
    if (agentName) {
      agentCounts[agentName] = (agentCounts[agentName] || 0) + 1;
    }

    const stats = me.stats ?? {};
    totalHeadshots += stats.headshots ?? 0;
    totalBodyshots += stats.bodyshots ?? 0;
    totalLegshots += stats.legshots ?? 0;

    const queueId = match?.metadata?.queue?.id;
    const teams = match?.teams;
    const teamId = me.team_id?.toLowerCase();

    if (!NO_TEAM_RESULT_MODES.has(queueId) && teams && teamId && teams[teamId]) {
      decidedMatches++;
      if (teams[teamId].has_won) wins++;
    }
  }

  const totalShots = totalHeadshots + totalBodyshots + totalLegshots;
  const headshotRate = totalShots > 0 ? (totalHeadshots / totalShots) * 100 : null;
  const winRate = decidedMatches > 0 ? (wins / decidedMatches) * 100 : null;

  const topAgent = Object.entries(agentCounts).sort((a, b) => b[1] - a[1])[0] ?? null;

  return {
    matchesConsidered,
    topAgent: topAgent ? { name: topAgent[0], count: topAgent[1] } : null,
    headshotRate,
    winRate,
    wins,
    decidedMatches,
  };
}

module.exports = { fetchRecentMatches, computeStats };