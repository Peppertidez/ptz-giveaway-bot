/**
 * discordStirButton.js — Prize Cauldron Discord stir
 *
 * Adds:
 *   • /poststir           admin command: posts the "🎃 Stir the Cauldron" button
 *                         in the current channel
 *   • Button handler      opens an email modal
 *   • Modal handler       POSTs to WordPress REST, DMs the user their prize
 *   • guildMemberAdd      welcomes new joiners and points them to the stir channel
 *
 * Required env vars (set in Railway → Variables):
 *   PTZ_PPC_WP_STIR_ENDPOINT     https://peppertidez.shop/wp-json/ppc/v1/discord-stir
 *   PTZ_PPC_WP_SECRET            same string set in wp-config.php PPC_DISCORD_STIR_SECRET
 *   PTZ_PPC_STIR_CHANNEL_ID      Discord channel ID where the stir button lives
 *   PTZ_PPC_WELCOME_CHANNEL_ID   (optional) channel for the auto-welcome message
 *
 * Wiring in index.js (one line, see bottom of this file):
 *   require('./discordStirButton')(client);
 */

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  SlashCommandBuilder, PermissionFlagsBits,
  EmbedBuilder,
} = require('discord.js');

const WP_ENDPOINT = process.env.PTZ_PPC_WP_STIR_ENDPOINT || '';
const WP_SECRET   = process.env.PTZ_PPC_WP_SECRET || '';
const STIR_CHAN   = process.env.PTZ_PPC_STIR_CHANNEL_ID || '';
const WELCOME_CH  = process.env.PTZ_PPC_WELCOME_CHANNEL_ID || '';

const BTN_ID    = 'ppc_stir_open';
const MODAL_ID  = 'ppc_stir_modal';
const EMAIL_ID  = 'ppc_stir_email';

// =========================================================================
// Public: slash command definition for registration
// =========================================================================
const stirCommand = new SlashCommandBuilder()
  .setName('poststir')
  .setDescription('[Admin] Post the Prize Cauldron stir button in this channel.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

// =========================================================================
// Factory — call this once from index.js with your client
// =========================================================================
module.exports = function registerStir(client) {

  // ---------- Slash command: /poststir ----------
  client.on('interactionCreate', async (i) => {
    if (!i.isChatInputCommand()) return;
    if (i.commandName !== 'poststir') return;
    try {
      await i.deferReply({ ephemeral: true });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(BTN_ID)
          .setLabel('🎃 Stir the Cauldron')
          .setStyle(ButtonStyle.Primary)
      );
      const embed = new EmbedBuilder()
        .setColor(0xff7a1a)
        .setTitle('🔮 The Prize Cauldron 🔮')
        .setDescription(
          "Haven't placed an order yet? Stir the cauldron right here.\n\n" +
          "Click below, drop your email, and the cauldron picks your prize. " +
          "When you place your first order with that email, your prize is already waiting."
        )
        .setFooter({ text: 'One stir per Discord account. One stir per email.' });
      await i.channel.send({ embeds: [embed], components: [row] });
      await i.editReply({ content: '✓ Stir button posted.' });
    } catch (err) {
      console.error('[ppc-stir] /poststir failed', err);
      try { await i.editReply({ content: '⚠️ ' + (err.message || 'failed') }); } catch (e) {}
    }
  });

  // ---------- Button → open email modal ----------
  client.on('interactionCreate', async (i) => {
    if (!i.isButton()) return;
    if (i.customId !== BTN_ID) return;
    try {
      const modal = new ModalBuilder()
        .setCustomId(MODAL_ID)
        .setTitle('🎃 Stir the Cauldron');
      const email = new TextInputBuilder()
        .setCustomId(EMAIL_ID)
        .setLabel('Email you\'ll order with')
        .setPlaceholder('you@example.com')
        .setStyle(TextInputStyle.Short)
        .setMinLength(5).setMaxLength(190).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(email));
      await i.showModal(modal);
    } catch (err) {
      console.error('[ppc-stir] modal open failed', err);
    }
  });

  // ---------- Modal submit → call WP, DM result ----------
  client.on('interactionCreate', async (i) => {
    if (!i.isModalSubmit()) return;
    if (i.customId !== MODAL_ID) return;
    await i.deferReply({ ephemeral: true });

    const email = (i.fields.getTextInputValue(EMAIL_ID) || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return i.editReply({ content: '⚠️ That email doesn\'t look valid. Try again.' });
    }

    let data;
    try {
      const res = await fetch(WP_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-PPC-Secret': WP_SECRET,
        },
        body: JSON.stringify({
          discord_user_id:  i.user.id,
          discord_username: i.user.tag,
          email,
        }),
      });
      data = await res.json();
      if (!res.ok || !data || data.ok === false) {
        const msg = (data && (data.error || data.message)) || `WP returned ${res.status}`;
        return i.editReply({ content: '⚠️ ' + msg });
      }
    } catch (err) {
      console.error('[ppc-stir] WP request failed', err);
      return i.editReply({ content: '⚠️ Couldn\'t reach the cauldron right now. Try again in a minute.' });
    }

    const prize = data.prize || {};
    const replay = !!data.replay;
    const lines = [];
    lines.push(replay
      ? '🔁 You already stirred once. Here\'s what the cauldron gave you:'
      : '🫧 **The cauldron bubbles...** and your prize appears:');
    lines.push('');
    lines.push(`**${prize.label}**`);
    if (prize.code)          lines.push(`Code: \`${prize.code}\`  (locked to ${email}, one use)`);
    if (prize.bonus_entries) lines.push(`+${prize.bonus_entries} giveaway entries added to your email.`);
    lines.push('');
    lines.push('Your prize is **tied to this email**. Place your first order with it and your prize applies automatically.');

    // Try to DM; fall back to ephemeral reply if DMs are closed.
    try {
      await i.user.send({ content: lines.join('\n') });
      await i.editReply({ content: '✓ Check your DMs — the cauldron sent you something.' });
    } catch (err) {
      await i.editReply({ content: lines.join('\n') });
    }
  });

  // ---------- Welcome new members ----------
  if (WELCOME_CH) {
    client.on('guildMemberAdd', async (member) => {
      try {
        const ch = await member.guild.channels.fetch(WELCOME_CH).catch(() => null);
        if (!ch || !ch.isTextBased()) return;
        const stirMention = STIR_CHAN ? `<#${STIR_CHAN}>` : 'the stir channel';
        await ch.send({
          content:
            `👻 Welcome, <@${member.id}>! Head to ${stirMention} and click **🎃 Stir the Cauldron** ` +
            `to grab your Halloween prize before you order. One stir per person.`,
        });
      } catch (err) {
        console.error('[ppc-stir] welcome failed', err);
      }
    });
  }

  console.log('[ppc-stir] module loaded');
};

// Export the slash command definition so index.js can push it into
// the array it registers on startup.
module.exports.stirCommand = stirCommand;
