// Static Valorant agent trait database used by the /agentle guessing game.
// "color" is a community-approximated primary kit/VFX color, not official
// Riot data — tweak freely without breaking anything else in agentle.js.
//
// If Riot ships a new agent, just add a row here — nothing else needs to change.

const AGENTS = [
  { id: "brimstone", name: "Brimstone", role: "Controller", origin: "United States", gender: "Male",   releaseYear: 2020, color: "Orange" },
  { id: "viper",     name: "Viper",     role: "Controller", origin: "United States", gender: "Female", releaseYear: 2020, color: "Green" },
  { id: "omen",      name: "Omen",      role: "Controller", origin: "Unknown",       gender: "Male",   releaseYear: 2020, color: "Purple" },
  { id: "cypher",    name: "Cypher",    role: "Sentinel",   origin: "Morocco",       gender: "Male",   releaseYear: 2020, color: "White" },
  { id: "sova",      name: "Sova",      role: "Initiator",  origin: "Russia",        gender: "Male",   releaseYear: 2020, color: "Blue" },
  { id: "sage",      name: "Sage",      role: "Sentinel",   origin: "China",         gender: "Female", releaseYear: 2020, color: "Cyan" },
  { id: "phoenix",   name: "Phoenix",   role: "Duelist",    origin: "United Kingdom",gender: "Male",   releaseYear: 2020, color: "Red" },
  { id: "jett",      name: "Jett",      role: "Duelist",    origin: "South Korea",   gender: "Female", releaseYear: 2020, color: "White" },
  { id: "raze",      name: "Raze",      role: "Duelist",    origin: "Brazil",        gender: "Female", releaseYear: 2020, color: "Orange" },
  { id: "breach",    name: "Breach",    role: "Initiator",  origin: "Sweden",        gender: "Male",   releaseYear: 2020, color: "Orange" },
  { id: "reyna",     name: "Reyna",     role: "Duelist",    origin: "Mexico",        gender: "Female", releaseYear: 2020, color: "Purple" },
  { id: "killjoy",   name: "Killjoy",   role: "Sentinel",   origin: "Germany",       gender: "Female", releaseYear: 2020, color: "Yellow" },
  { id: "skye",      name: "Skye",      role: "Initiator",  origin: "Australia",     gender: "Female", releaseYear: 2020, color: "Green" },
  { id: "yoru",      name: "Yoru",      role: "Duelist",    origin: "Japan",         gender: "Male",   releaseYear: 2021, color: "Blue" },
  { id: "astra",     name: "Astra",     role: "Controller", origin: "Ghana",         gender: "Female", releaseYear: 2021, color: "Purple" },
  { id: "kayo",      name: "KAY/O",     role: "Initiator",  origin: "Alternate Earth", gender: "Male", releaseYear: 2021, color: "Gray" },
  { id: "chamber",   name: "Chamber",   role: "Sentinel",   origin: "France",        gender: "Male",   releaseYear: 2021, color: "Gold" },
  { id: "neon",      name: "Neon",      role: "Duelist",    origin: "Philippines",   gender: "Female", releaseYear: 2022, color: "Blue" },
  { id: "fade",      name: "Fade",      role: "Initiator",  origin: "Türkiye",       gender: "Female", releaseYear: 2022, color: "Purple" },
  { id: "harbor",    name: "Harbor",    role: "Controller", origin: "India",         gender: "Male",   releaseYear: 2022, color: "Teal" },
  { id: "gekko",     name: "Gekko",     role: "Initiator",  origin: "United States", gender: "Male",   releaseYear: 2023, color: "Green" },
  { id: "deadlock",  name: "Deadlock",  role: "Sentinel",   origin: "Norway",        gender: "Female", releaseYear: 2023, color: "White" },
  { id: "iso",       name: "Iso",       role: "Duelist",    origin: "China",         gender: "Male",   releaseYear: 2023, color: "Purple" },
  { id: "clove",     name: "Clove",     role: "Controller", origin: "Scotland",      gender: "Nonbinary", releaseYear: 2024, color: "Pink" },
  { id: "vyse",      name: "Vyse",      role: "Sentinel",   origin: "Unknown",       gender: "Female", releaseYear: 2024, color: "Blue" },
  { id: "tejo",      name: "Tejo",      role: "Initiator",  origin: "Colombia",      gender: "Male",   releaseYear: 2025, color: "Orange" },
  { id: "waylay",    name: "Waylay",    role: "Duelist",    origin: "Thailand",      gender: "Female", releaseYear: 2025, color: "Blue" },
  { id: "veto",      name: "Veto",      role: "Sentinel",   origin: "Senegal",       gender: "Male",   releaseYear: 2025, color: "Red" },
  { id: "miks",      name: "Miks",      role: "Controller", origin: "Croatia",       gender: "Male",   releaseYear: 2026, color: "Yellow" },
];

module.exports = { AGENTS };