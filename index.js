require('dotenv').config();
const {
  Client, GatewayIntentBits, Events,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  PermissionFlagsBits,
} = require('discord.js');
const { postEntryMessage, handleButton, handleModal } = require('./giveawayEntryButton');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Where people paste their code. Falls back to your store if not set.
const GIVEAWAY_URL = process.env.GIVEAWAY_URL || process.env.WP_URL || 'https://peppertidez.shop';

// --- ask WordPress for this user's code ---
async function mintCode(user) {
  const res = await fetch(`${process.env.WP_URL}/wp-json/ptz/v1/mint-code`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-PTZ-Secret': process.env.PTZ_SECRET,
    },
    body: JSON.stringify({ discord_id: user.id, discord_username: user.username }),
  });
  return res.json();
}

// --- the private message they get with their code ---
function codeMessage(data) {
  return [
    `🌶️ **Here's your giveaway entry code:**`,
    '```',
    data.code,
    '```',
    `👉 Tap to copy it, then paste it into the entry form here:`,
    GIVEAWAY_URL,
    ``,
    `One entry per person — keep this code to yourself.`,
  ].join('\n');
}

// --- shared handler for both the button and the /entrycode command ---
async function giveCode(interaction) {
  if (!interaction.inGuild()) {
    return interaction.reply({ content: 'Please use this inside the Peppertidez server.', ephemeral: true });
  }
  await interaction.deferReply({ ephemeral: true }); // only they can see it
  try {
    const data = await mintCode(interaction.user);
    if (!data.ok) {
      return interaction.editReply(`Hmm, something went wrong (${data.msg || 'try again shortly'}).`);
    }
    return interaction.editReply(codeMessage(data));
  } catch (err) {
    console.error(err);
    return interaction.editReply('Network hiccup reaching the site. Try again in a minute.');
  }
}

// --- on startup: come online + register commands (no separate deploy step) ---
client.once(Events.ClientReady, async (c) => {
  console.log(`Peppertidez bot online as ${c.user.tag}`);
  try {
    const guild = await c.guilds.fetch(process.env.GUILD_ID);
    await guild.commands.set([
      { name: 'entrycode', description: 'Get your Peppertidez giveaway entry code' },
      {
        name: 'postgiveaway',
        description: 'Admin: post the giveaway entry button in this channel',
        default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
      },
      {
        name: 'postentry',
        description: 'Admin: post the giveaway ENTRY FORM button in the giveaway-entry channel',
        default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
      },
    ]);
    console.log('Slash commands registered.');
  } catch (err) {
    console.error('Command registration failed:', err);
  }
});

// --- handle commands + button clicks ---
client.on(Events.InteractionCreate, async (interaction) => {
  // Giveaway entry form: button opens the popup, modal saves the entry
  if (interaction.isButton() && await handleButton(interaction)) return;
  if (interaction.isModalSubmit() && await handleModal(interaction)) return;

  // Slash commands
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'entrycode') {
      return giveCode(interaction);
    }
    if (interaction.commandName === 'postgiveaway') {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ptz_get_code')
          .setLabel('Get My Entry Code')
          .setEmoji('🎟️')
          .setStyle(ButtonStyle.Primary)
      );
      await interaction.channel.send({
        content: [
          `🎯 **2,500 Follower Giveaway**`,
          ``,
          `Click the button below to get your personal entry code, then paste it into the entry form on our site to lock in your entry. One entry per person — good luck! 🌶️`,
        ].join('\n'),
        components: [row],
      });
      return interaction.reply({ content: 'Posted ✅', ephemeral: true });
    }
    if (interaction.commandName === 'postentry') {
      await interaction.deferReply({ ephemeral: true });
      try {
        await postEntryMessage(interaction.client);
        return interaction.editReply('Entry form posted to the giveaway-entry channel ✅');
      } catch (err) {
        console.error('postentry failed:', err);
        return interaction.editReply('Could not post it — check PTZ_GW_ENTRY_CHANNEL_ID is set correctly.');
      }
    }
  }

  // Button click (entry code)
  if (interaction.isButton() && interaction.customId === 'ptz_get_code') {
    return giveCode(interaction);
  }
});

client.login(process.env.TOKEN);
