// Rules for categorizing members into activity-based tags.
// Tags are mutually exclusive per member — priority order below, first match wins.

const CONFIG = {
  NEW_MEMBER_DAYS: 7,          // joined within this many days -> "Người mới", regardless of activity
  MIN_TENURE_DAYS_FOR_LOW: 14, // must be a member this long before being eligible for "Ít tương tác"
  LOW_PERCENTILE: 0.25,        // bottom 25% of activity score (excluding new members) -> "Ít tương tác"
  HIGH_PERCENTILE: 0.80,       // top 20% -> "Nói nhiều" / "Cày voice", whichever dominates
  ACTIVE_PERCENTILE: 0.50,     // above median score -> "Năng nổ"
  WEIGHTS: {
    message: 1,
    reactionGiven: 0.5,
    reactionReceived: 0.5,
    voiceMinute: 0.3,
  },
};

const TAGS = {
  NEW: "Người mới",
  LOW: "Ít tương tác",
  CHATTY: "Nói nhiều",
  VOICE: "Cày voice",
  ACTIVE: "Năng nổ",
  NORMAL: "Bình thường",
};

const MANAGED_TAGS = Object.values(TAGS);

const TAG_COLORS = {
  [TAGS.NEW]: 0x57f287,
  [TAGS.LOW]: 0x99aab5,
  [TAGS.CHATTY]: 0xfee75c,
  [TAGS.VOICE]: 0xeb459e,
  [TAGS.ACTIVE]: 0x5865f2,
  [TAGS.NORMAL]: 0xb9bbbe,
};

function activityScore(stats) {
  const voiceMinutes = stats.voiceMs / 60000;
  return (
    stats.messageCount * CONFIG.WEIGHTS.message +
    stats.reactionsGiven * CONFIG.WEIGHTS.reactionGiven +
    stats.reactionsReceived * CONFIG.WEIGHTS.reactionReceived +
    voiceMinutes * CONFIG.WEIGHTS.voiceMinute
  );
}

function percentileValue(sortedAsc, p) {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.floor(p * sortedAsc.length));
  return sortedAsc[idx];
}

/**
 * @param {Array<{id, joinedTimestamp, stats}>} members
 * @returns {Map<string, string>} userId -> tag name
 */
function computeTags(members) {
  const now = Date.now();
  const dayMs = 86_400_000;

  const withDerived = members.map((m) => ({
    ...m,
    tenureDays: (now - m.joinedTimestamp) / dayMs,
    score: activityScore(m.stats),
  }));

  const isNew = (m) => m.tenureDays < CONFIG.NEW_MEMBER_DAYS;

  // Percentiles computed only over established members, so quiet newcomers
  // don't drag the curve down for everyone else.
  const established = withDerived.filter((m) => !isNew(m));
  const scoreSorted = established.map((m) => m.score).sort((a, b) => a - b);
  const msgSorted = established.map((m) => m.stats.messageCount).sort((a, b) => a - b);
  const voiceSorted = established.map((m) => m.stats.voiceMs).sort((a, b) => a - b);

  const lowCut = percentileValue(scoreSorted, CONFIG.LOW_PERCENTILE);
  const activeCut = percentileValue(scoreSorted, CONFIG.ACTIVE_PERCENTILE);
  const msgHighCut = percentileValue(msgSorted, CONFIG.HIGH_PERCENTILE);
  const voiceHighCut = percentileValue(voiceSorted, CONFIG.HIGH_PERCENTILE);

  const result = new Map();

  for (const m of withDerived) {
    if (isNew(m)) {
      result.set(m.id, TAGS.NEW);
      continue;
    }

    if (m.tenureDays >= CONFIG.MIN_TENURE_DAYS_FOR_LOW && m.score <= lowCut) {
      result.set(m.id, TAGS.LOW);
      continue;
    }

    const msgWeighted = m.stats.messageCount * CONFIG.WEIGHTS.message;
    const voiceWeighted = (m.stats.voiceMs / 60000) * CONFIG.WEIGHTS.voiceMinute;

    if (msgHighCut > 0 && m.stats.messageCount >= msgHighCut && msgWeighted >= voiceWeighted) {
      result.set(m.id, TAGS.CHATTY);
      continue;
    }

    if (voiceHighCut > 0 && m.stats.voiceMs >= voiceHighCut && voiceWeighted > msgWeighted) {
      result.set(m.id, TAGS.VOICE);
      continue;
    }

    if (m.score >= activeCut) {
      result.set(m.id, TAGS.ACTIVE);
      continue;
    }

    result.set(m.id, TAGS.NORMAL);
  }

  return result;
}

module.exports = { TAGS, MANAGED_TAGS, TAG_COLORS, CONFIG, activityScore, computeTags };