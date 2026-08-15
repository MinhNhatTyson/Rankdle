// Fetches recent match history from HenrikDev's v4 matches endpoint and
// crunches it into a per-agent breakdown similar to tracker.gg's "Top Agents"
// table: matches played, win %, K/D, ADR, ACS, DDΔ (combat score vs. lobby
// average), and best map (by win rate).
//
// Only matches with real team/round scoring are counted (Competitive,
// Unrated, Spike Rush, etc.) — Deathmatch/Escalation don't have rounds or a
// win/loss result, so ADR/ACS/win-rate can't be computed for them and they're
// skipped entirely.

const fetch = require("node-fetch");

async function fetchRecentMatches({ name, tag, region, size = 15 }) {
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

function findPlayerInMatch(match, name, tag) {
  const players = match?.players ?? [];
  const wantName = name.trim().toLowerCase();
  const wantTag = tag.trim().toLowerCase();
  return players.find(
    (p) => p.name?.trim().toLowerCase() === wantName && p.tag?.trim().toLowerCase() === wantTag
  );
}

// The HenrikDev API has renamed this field across versions
// (damage_made -> damage.made). Check both so we don't silently break.
function getDamageMade(stats) {
  if (!stats) return null;
  if (typeof stats.damage?.made === "number") return stats.damage.made;
  if (typeof stats.damage_made === "number") return stats.damage_made;
  return null;
}

// Returns { teams, roundsPlayed }. Normalizes `teams` into a lowercase-keyed
// object ({ red: {...}, blue: {...} }) regardless of whether the API returns
// it that way already, or as an array of team objects (e.g.
// [{ team_id: "Red", ... }, { team_id: "Blue", ... }]) — we've seen both
// shapes reported for this API across versions.
function getTeamsAndRounds(match) {
  const rawTeams = match?.teams;
  let teams = null;

  if (Array.isArray(rawTeams)) {
    teams = {};
    for (const entry of rawTeams) {
      const key = (entry?.team_id ?? entry?.team ?? entry?.id ?? "").toString().toLowerCase();
      if (key) teams[key] = entry;
    }
  } else if (rawTeams && typeof rawTeams === "object") {
    teams = {};
    for (const [key, value] of Object.entries(rawTeams)) {
      teams[key.toLowerCase()] = value;
    }
  }

  let roundsPlayed = 0;
  if (teams?.red && teams?.blue) {
    roundsPlayed = (teams.red.rounds_won ?? 0) + (teams.red.rounds_lost ?? 0);
  }
  if (roundsPlayed <= 0 && typeof match?.metadata?.rounds_played === "number") {
    roundsPlayed = match.metadata.rounds_played;
  }
  if (roundsPlayed <= 0 && Array.isArray(match?.rounds)) {
    roundsPlayed = match.rounds.length;
  }

  return { teams, roundsPlayed };
}

function computeAgentStats(matches, name, tag, { topN = 5, debug = false } = {}) {
  const agents = {}; // agentName -> accumulator
  const skipCounts = { playerNotFound: 0, noRoundData: 0, noTeamResult: 0 };

  for (const match of matches) {
    const me = findPlayerInMatch(match, name, tag);
    if (!me) {
      skipCounts.playerNotFound++;
      if (debug) {
        const firstPlayer = match?.players?.[0];
        console.log("[stats debug] ---- player not found ----");
        console.log(`[stats debug] match_id=${match?.metadata?.match_id ?? "?"}`);
        console.log(`[stats debug] first payload player name=${firstPlayer?.name} tag=${firstPlayer?.tag}`);
      }
      continue;
    }

    const { teams, roundsPlayed } = getTeamsAndRounds(match);
    if (roundsPlayed <= 0) {
      skipCounts.noRoundData++;
      if (debug) {
        console.log("[stats debug] ---- no round data ----");
        console.log(`[stats debug] match_id=${match?.metadata?.match_id ?? "?"}`);
        console.log(`[stats debug] queue=${match?.metadata?.queue?.id ?? "?"}`);
        console.log(`[stats debug] raw teams type=${Array.isArray(match?.teams) ? "array" : typeof match?.teams}`);
      }
      continue; // no clean team/round data, e.g. Deathmatch
    }

    const teamId = me.team_id?.trim().toLowerCase();
    const teamResult = teams?.[teamId];
    if (!teamResult) {
      skipCounts.noTeamResult++;
      if (debug) {
        console.log("[stats debug] ---- no team result ----");
        console.log(`[stats debug] match_id=${match?.metadata?.match_id ?? "?"}`);
        console.log(`[stats debug] me.team_id (raw)=${me.team_id}`);
        console.log(`[stats debug] normalized teamId=${teamId}`);
        console.log(`[stats debug] resolved teams keys=${teams ? Object.keys(teams).join(",") : "none"}`);
        console.log(`[stats debug] raw match.teams type=${Array.isArray(match?.teams) ? "array" : typeof match?.teams}`);
        try {
          console.log(`[stats debug] raw match.teams=${JSON.stringify(match?.teams)}`);
        } catch {
          console.log("[stats debug] raw match.teams could not be stringified");
        }
      }
      continue;
    }

    const agentName = me.agent?.name ?? "Unknown";
    const acc = (agents[agentName] ??= {
      matches: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      damageMade: 0,
      hasDamage: false,
      roundsPlayed: 0,
      scoreSum: 0,
      ddSum: 0,
      ddCount: 0,
      playtimeMs: 0,
      mapStats: {},
    });

    acc.matches++;
    acc.playtimeMs += match.metadata?.game_length_in_ms ?? 0;
    acc.kills += me.stats?.kills ?? 0;
    acc.deaths += me.stats?.deaths ?? 0;
    acc.roundsPlayed += roundsPlayed;
    acc.scoreSum += me.stats?.score ?? 0;

    const damageMade = getDamageMade(me.stats);
    if (damageMade !== null) {
      acc.damageMade += damageMade;
      acc.hasDamage = true;
    }

    const won = !!teamResult.has_won;
    if (won) acc.wins++;

    // DDΔ: this player's combat score for the match vs. the average combat
    // score of everyone in the lobby that match.
    const allPlayers = match.players ?? [];
    let lobbyAcsSum = 0;
    let lobbyCount = 0;
    for (const p of allPlayers) {
      if (typeof p.stats?.score === "number") {
        lobbyAcsSum += p.stats.score / roundsPlayed;
        lobbyCount++;
      }
    }
    if (lobbyCount > 0) {
      const lobbyAvgAcs = lobbyAcsSum / lobbyCount;
      const myAcs = (me.stats?.score ?? 0) / roundsPlayed;
      acc.ddSum += myAcs - lobbyAvgAcs;
      acc.ddCount++;
    }

    const mapName = match.metadata?.map?.name ?? "Unknown";
    const mapAcc = (acc.mapStats[mapName] ??= { matches: 0, wins: 0 });
    mapAcc.matches++;
    if (won) mapAcc.wins++;
  }

  const rows = Object.entries(agents).map(([agentName, acc]) => {
    const winRate = acc.matches > 0 ? (acc.wins / acc.matches) * 100 : null;
    const kd = acc.deaths > 0 ? acc.kills / acc.deaths : acc.kills;
    const adr = acc.hasDamage && acc.roundsPlayed > 0 ? acc.damageMade / acc.roundsPlayed : null;
    const acs = acc.roundsPlayed > 0 ? acc.scoreSum / acc.roundsPlayed : null;
    const ddDelta = acc.ddCount > 0 ? acc.ddSum / acc.ddCount : null;
    const hours = acc.playtimeMs / 3_600_000;

    let bestMap = null;
    for (const [mapName, mapAcc] of Object.entries(acc.mapStats)) {
      const mapWinRate = mapAcc.matches > 0 ? (mapAcc.wins / mapAcc.matches) * 100 : 0;
      if (
        !bestMap ||
        mapWinRate > bestMap.winRate ||
        (mapWinRate === bestMap.winRate && mapAcc.matches > bestMap.matches)
      ) {
        bestMap = { name: mapName, winRate: mapWinRate, matches: mapAcc.matches };
      }
    }

    return {
      agentName,
      matches: acc.matches,
      winRate,
      kd,
      adr,
      acs,
      ddDelta,
      hours,
      bestMap,
    };
  });

  // Mirrors tracker.gg: ranked by total time played on that agent.
  rows.sort((a, b) => b.hours - a.hours);

  return { rows: rows.slice(0, topN), skipCounts, totalMatches: matches.length };
}

module.exports = { fetchRecentMatches, computeAgentStats };