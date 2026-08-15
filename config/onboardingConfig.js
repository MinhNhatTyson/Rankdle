// Static config for the new-member onboarding survey.
// Add/remove options here — nothing else needs to change.

const GAME_OPTIONS = [
  { label: "Valorant", value: "valorant", emoji: "🔫" },
  { label: "League of Legends", value: "lol", emoji: "⚔️" },
  { label: "Cả hai", value: "both", emoji: "🎮" },
  { label: "Chỉ xem / chat thôi", value: "none", emoji: "👀" },
];

const VIBE_OPTIONS = [
  { label: "Dui dẻ thoi", value: "casual" },
  { label: "Hard lên rank", value: "competitive" },
  { label: "Cả hai", value: "both" },
];

const FREETIME_OPTIONS = [
  { label: "Sáng (6h - 12h)", value: "morning" },
  { label: "Chiều (12h - 18h)", value: "afternoon" },
  { label: "Tối (18h - 22h)", value: "evening" },
  { label: "Khuya (22h - 2h)", value: "late_night" },
  { label: "Không cố định", value: "flexible" },
];

module.exports = { GAME_OPTIONS, VIBE_OPTIONS, FREETIME_OPTIONS };