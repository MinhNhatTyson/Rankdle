// Core logic for the new-member onboarding survey: builds the embeds and
// interactive components. Selection *state* while a user is filling out the
// survey lives in an in-memory Map owned by index.js (onboardingSessions) —
// this file just renders whatever state it's given.

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require("discord.js");
const { GAME_OPTIONS, VIBE_OPTIONS, FREETIME_OPTIONS } = require("../config/onboardingConfig");

function buildWelcomeEmbed(member) {
  return new EmbedBuilder()
    .setTitle(`👋 Chào mừng ${member.user.username} đến với server!`)
    .setDescription(
      "Trước khi vào chơi, nói cho t biết m muốn gì (chỉ để biết nhau thôi, " +
        "không dùng để đánh giá gì cả 😄).\n\nBấm **Bắt đầu** bên dưới nhé."
    )
    .setColor(0x5865f2)
    .setThumbnail(member.user.displayAvatarURL());
}

function buildStartRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("onboarding_start")
      .setLabel("Bắt đầu")
      .setEmoji("📝")
      .setStyle(ButtonStyle.Primary)
  );
}

function buildSurveyEmbed(state) {
  const gamesLabel = state.games.length
    ? state.games
        .map((v) => GAME_OPTIONS.find((o) => o.value === v)?.label ?? v)
        .join(", ")
    : "_Chưa chọn_";
  const vibeLabel = state.vibe
    ? VIBE_OPTIONS.find((o) => o.value === state.vibe)?.label ?? state.vibe
    : "_Chưa chọn_";
  const freeTimeLabel = state.freeTime
    ? FREETIME_OPTIONS.find((o) => o.value === state.freeTime)?.label ?? state.freeTime
    : "_Chưa chọn_";

  return new EmbedBuilder()
    .setTitle("📝 Khảo sát nhanh")
    .setDescription(
      "Chọn từng mục bên dưới, sau đó bấm **Gửi** khi xong.\n\n" +
        `🎮 **Game hay chơi:** ${gamesLabel}\n` +
        `🕒 **Vibe:** ${vibeLabel}`
        `🕒 **Thời gian rảnh:** ${freeTimeLabel}`
    )
    .setColor(0x5865f2);
}

function buildSurveyComponents(state) {
  const gamesSelect = new StringSelectMenuBuilder()
    .setCustomId("onboarding_games")
    .setPlaceholder("Bạn hay chơi game nào?")
    .setMinValues(1)
    .setMaxValues(GAME_OPTIONS.length)
    .addOptions(
      GAME_OPTIONS.map((o) => ({
        label: o.label,
        value: o.value,
        emoji: o.emoji,
        default: state.games.includes(o.value),
      }))
    );

  const vibeSelect = new StringSelectMenuBuilder()
    .setCustomId("onboarding_vibe")
    .setPlaceholder("Bạn muốn chơi kiểu nào?")
    .setMinValues(1)
    .setMaxValues(VIBE_OPTIONS.length)
    .addOptions(
      VIBE_OPTIONS.map((o) => ({
        label: o.label,
        value: o.value,
        emoji: o.emoji,
        default: state.vibe === o.value,
      }))
    );  

  const freeTimeSelect = new StringSelectMenuBuilder()
    .setCustomId("onboarding_freetime")
    .setPlaceholder("Bạn rảnh lúc nào?")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      FREETIME_OPTIONS.map((o) => ({
        label: o.label,
        value: o.value,
        default: state.freeTime === o.value,
      }))
    );

  const isComplete = state.games.length > 0 && !!state.vibe && !!state.freeTime;

  const submitRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("onboarding_submit")
      .setLabel(isComplete ? "Gửi ✅" : "Gửi (chọn đủ 3 mục trước)")
      .setStyle(isComplete ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(!isComplete)
  );

  return [
    new ActionRowBuilder().addComponents(gamesSelect),
    new ActionRowBuilder().addComponents(vibeSelect),
    new ActionRowBuilder().addComponents(freeTimeSelect),
    submitRow,
  ];
}

function buildCompletedEmbed(state) {
  const gamesLabel = state.games
    .map((v) => GAME_OPTIONS.find((o) => o.value === v)?.label ?? v)
    .join(", ");
  const vibeLabel = state.vibe
    .map((v) => VIBE_OPTIONS.find((o) => o.value === v)?.label ?? v)
    .join(", ");
  const freeTimeLabel = FREETIME_OPTIONS.find((o) => o.value === state.freeTime)?.label ?? state.freeTime;

  return new EmbedBuilder()
    .setTitle("🎉 Cảm ơn bạn!")
    .setDescription(
      `Đã lưu thông tin:\n🎮 **Game:** ${gamesLabel}\n🕒 **Vibe:** ${vibeLabel}\n🕒 **Thời gian rảnh:** ${freeTimeLabel}\n\n` +
        "Chúc bạn chơi vui ở server nhé!"
    )
    .setColor(0x57f287);
}

module.exports = {
  buildWelcomeEmbed,
  buildStartRow,
  buildSurveyEmbed,
  buildSurveyComponents,
  buildCompletedEmbed,
};