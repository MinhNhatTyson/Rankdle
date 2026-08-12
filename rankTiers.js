// Valorant rank tiers used by the "Guess the Rank" (/rankdle) minigame.
// Order matters — it's used to compute how close a wrong guess was.

const RANK_TIERS = [
  { name: "Iron", color: 0x4e4e4e },
  { name: "Bronze", color: 0x8c5a2b },
  { name: "Silver", color: 0xa8a8a8 },
  { name: "Gold", color: 0xd4af37 },
  { name: "Platinum", color: 0x2fb6a3 },
  { name: "Diamond", color: 0xb066ff },
  { name: "Ascendant", color: 0x1fbf6f },
  { name: "Immortal", color: 0xb3395d },
  { name: "Radiant", color: 0xf5e6a8 },
].map((t, i) => ({ ...t, order: i }));

function findTier(name) {
  return RANK_TIERS.find((t) => t.name.toLowerCase() === String(name).trim().toLowerCase()) || null;
}

// For building slash command .addChoices() — Discord allows up to 25, we have 9.
function tierChoices() {
  return RANK_TIERS.map((t) => ({ name: t.name, value: t.name }));
}

module.exports = { RANK_TIERS, findTier, tierChoices };