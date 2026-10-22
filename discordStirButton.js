/**
 * discordStirButton.js — Prize Cauldron Discord stir (v1.2)
 *
 * The bot no longer rolls the prize. It just creates a PENDING stir server-side
 * and DMs a login-gated cauldron URL. The user logs into peppertidez.shop, the
 * real cauldron page plays its full animation, and the prize is rolled + revealed
 * right there.
 *
 * Required env vars (Railway → Variables):
 *   PTZ_PPC_WP_STIR_ENDPOINT     https://peppertidez.shop/wp-json/ppc/v1/discord-stir
 *   PTZ_PPC_WP_SECRET            same string as wp-config.php PPC_DISCORD_STIR_SECRET
 *   PTZ_PPC_STIR_CHANNEL_ID      channel ID where the stir button lives
 *   PTZ_PPC_WELCOME_CHANNEL_ID   optional — channel for the auto-welcome message
 *
 * Wiring in index.js: already in place.
 *   const registerStir = require('./discordStirButton');
 *   // push 'poststir' into the slash command set
 *   registerStir(client);
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

const stirCommand = new SlashCommandBuilder()
  .setName('poststir')
  .setDescription('[Admin] Post the Prize Cauldron stir button in this channel.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

module.exports = function registerStir(client) {

  // ---------- /poststir ----------
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
          "Click below, drop your email, and we'll send you a link to the real cauldron.\n\n" +
          "Log in, stir it on the site, and your prize comes out — with the full animation + sound.\n\n" +
          "One stir per Discord account. One stir per email."
        );
      await i.channel.send({ embeds: [embed], components: [row] });
      await i.editReply({ content: '✓ Stir button posted.' });
    } catch (err) {
      console.error('[ppc-stir] /poststir failed', err);
      try { await i.editReply({ content: '⚠️ ' + (err.message || 'failed') }); } catch (e) {}
    }
  });

  // ---------- Button → email modal ----------
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

  // ---------- Modal → create pending stir on the site, DM the link ----------
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

    const url     = data.cauldron_url;
    const replay  = !!data.replay;
    const already = !!data.revealed;

    const lines = [];
    if (already) {
      lines.push('🔁 You\'ve already stirred and revealed your prize.');
      lines.push('');
      lines.push('Open it again here (log in if asked):');
    } else if (replay) {
      lines.push('🔁 Your cauldron is already queued up — stir it when you\'re ready.');
      lines.push('');
      lines.push('Log in and stir it here:');
    } else {
      lines.push('🫧 **Your cauldron is ready to stir.**');
      lines.push('');
      lines.push('Log in and open this link — the full cauldron page plays with sound + animation, then reveals your prize:');
    }
    lines.push(url);
    lines.push('');
    lines.push(`Prize is tied to **${email}** — order with that same email and your prize applies automatically.`);

    try {
      await i.user.send({ content: lines.join('\n') });
      await i.editReply({ content: '✓ Check your DMs — your cauldron link is waiting.' });
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
            `to claim your Halloween prize. One stir per person.`,
        });
      } catch (err) {
        console.error('[ppc-stir] welcome failed', err);
      }
    });
  }

  console.log('[ppc-stir] module loaded (v1.2 — link-to-cauldron flow)');
};

module.exports.stirCommand = stirCommand;
