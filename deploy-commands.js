// Run this once (and again any time you change command definitions):
//   node deploy-commands.js

require("dotenv").config();
const { REST, Routes, SlashCommandBuilder } = require("discord.js");

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
