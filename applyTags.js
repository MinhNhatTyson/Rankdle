const { PermissionFlagsBits } = require("discord.js");
const { MANAGED_TAGS, TAG_COLORS, computeTags } = require("./tagging");
const { getAllActivity } = require("./activity");

async function ensureTagRoles(guild) {
  const roleMap = new Map();
  for (const tagName of MANAGED_TAGS) {
    let role = guild.roles.cache.find((r) => r.name === tagName);
    if (!role) {
      role = await guild.roles.create({
        name: tagName,
        color: TAG_COLORS[tagName] ?? 0x99aab5,
        reason: "Auto-created activity tag role",
        mentionable: false,
      });
    }
    roleMap.set(tagName, role);
  }
  return roleMap;
}

function getMemberTag(member) {
  const role = member.roles.cache.find((r) => MANAGED_TAGS.includes(r.name));
  return role ? role.name : "Chưa gắn thẻ";
}
async function recalculateTags(guild) {
  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new Error("Bot is missing the 'Manage Roles' permission.");
  }

  const roleMap = await ensureTagRoles(guild);

  const botTopPosition = me.roles.highest.position;
  for (const role of roleMap.values()) {
    if (role.position >= botTopPosition) {
      throw new Error(
        `Bot's role must be positioned above "${role.name}" in Server Settings > Roles.`
      );
    }
  }

  const members = await guild.members.fetch();
  const activity = getAllActivity();

  const memberInputs = [];
  for (const member of members.values()) {
    if (member.user.bot) continue;
    const stats = activity[member.id] || {
      messageCount: 0,
      reactionsGiven: 0,
      reactionsReceived: 0,
      voiceMs: 0,
    };
    memberInputs.push({ id: member.id, joinedTimestamp: member.joinedTimestamp ?? Date.now(), stats });
  }

  const tagByUser = computeTags(memberInputs);

  let changed = 0;
  for (const member of members.values()) {
    if (member.user.bot) continue;
    const targetTag = tagByUser.get(member.id);
    if (!targetTag) continue;

    const targetRole = roleMap.get(targetTag);
    const currentManaged = member.roles.cache.filter((r) => MANAGED_TAGS.includes(r.name));
    if (currentManaged.size === 1 && currentManaged.first().id === targetRole.id) continue;

    try {
      const toRemove = currentManaged.filter((r) => r.id !== targetRole.id);
      if (toRemove.size > 0) await member.roles.remove(toRemove);
      if (!member.roles.cache.has(targetRole.id)) await member.roles.add(targetRole);
      changed++;
    } catch (err) {
      console.error(`Failed to update tag role for ${member.user.tag}:`, err.message);
    }
  }

  return { totalMembers: memberInputs.length, changed };
}

module.exports = { recalculateTags, ensureTagRoles, getMemberTag };