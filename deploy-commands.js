require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

// Register the /entrycode command to your server.
// Run this ONCE (and again only if you change the command).
const commands = [
  new SlashCommandBuilder()
    .setName('entrycode')
    .setDescription('Get your Peppertidez giveaway entry code')
    .toJSON(),
];

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('✅ /entrycode registered to your server.');
  } catch (err) {
    console.error(err);
  }
})();
