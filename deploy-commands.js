// Run this once (and again any time you change command definitions):
//   node deploy-commands.js

require("dotenv").config();
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { tierChoices } = require("./rankTiers");

const commands = [
  new SlashCommandBuilder()
    .setName("setriot")
    .setDescription("Link your Riot ID so the bot can look up your Valorant rank")
    .addStringOption((opt) =>
      opt.setName("name").setDescription("Your Riot name (without the #tag)").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("tag").setDescription("Your Riot tag (without the #), e.g. 1234").setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("region")
        .setDescription("Your Valorant region")
        .setRequired(true)
        .addChoices(
          { name: "NA", value: "na" },
          { name: "EU", value: "eu" },
          { name: "AP", value: "ap" },
          { name: "KR", value: "kr" },
          { name: "LATAM", value: "latam" },
          { name: "BR", value: "br" }
        )
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Show a member's current Valorant rank")
    .addUserOption((opt) =>
      opt.setName("member").setDescription("Whose rank to check (defaults to you)").setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Show a member's most-used agent, headshot rate, and win rate over recent matches")
    .addUserOption((opt) =>
      opt.setName("member").setDescription("Whose stats to check (defaults to you)").setRequired(false)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("matches")
        .setDescription("How many recent matches to look at (default 10, max 25)")
        .setMinValue(1)
        .setMaxValue(25)
        .setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("recalc-tags")
    .setDescription("Recalculate and reassign activity tags for all members")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .toJSON(),

  new SlashCommandBuilder()
    .setName("member")
    .setDescription("List every member in the server with their current activity tag")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("agentle")
    .setDescription("Guess today's mystery Valorant agent")
    .addSubcommand((sub) =>
      sub
        .setName("guess")
        .setDescription("Make a guess for today's agent")
        .addStringOption((opt) =>
          opt
            .setName("agent")
            .setDescription("Which agent do you think it is?")
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand((sub) => sub.setName("status").setDescription("Show your progress on today's puzzle"))
    .addSubcommand((sub) => sub.setName("giveup").setDescription("Reveal today's answer and end your run"))
    .toJSON(),

  // inside the `commands` array, after the /agentle command:

  new SlashCommandBuilder()
    .setName("upload-video")
    .setDescription("Upload a gameplay clip + your real rank for Guess the Rank (upload channel only)")
    .addAttachmentOption((opt) =>
      opt.setName("video").setDescription("Short gameplay clip").setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("rank")
        .setDescription("Your real rank in this clip")
        .setRequired(true)
        .addChoices(...tierChoices())
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("rankdle")
    .setDescription("Guess the Rank — guess the rank shown in today's anonymized clips")
    .addSubcommand((sub) => sub.setName("guess").setDescription("Get a random clip and guess its rank"))
    .addSubcommand((sub) => sub.setName("status").setDescription("See which of today's clips you've guessed"))
    .addSubcommand((sub) => sub.setName("stats").setDescription("See your lifetime Guess the Rank accuracy"))
    .toJSON(),
];

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("Registering slash commands...");
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log("Slash commands registered to your server.");
  } catch (err) {
    console.error(err);
  }
})();
