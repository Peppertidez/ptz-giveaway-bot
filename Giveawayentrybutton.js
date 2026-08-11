// giveawayEntryButton.js
// PTZ giveaway — locked-channel entry button + popup form (modal) for discord.js v14
// Drop this file into your ptz-giveaway-bot repo, then wire it up (see WIRE-UP at the bottom).

const {
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
} = require('discord.js');

// ── CONFIG (set these as environment variables on Railway) ──────────────
const CONFIG = {
  entryChannelId:    process.env.PTZ_GW_ENTRY_CHANNEL_ID,   // your locked "giveaway-entry" channel ID
  adminLogChannelId: process.env.PTZ_GW_ADMIN_CHANNEL_ID,   // a private channel where entries get logged (backup)
  wpEndpoint:        process.env.PTZ_GW_WP_ENDPOINT,        // https://peppertidez.shop/wp-json/ptz/v1/gw-discord
  wpSecret:          process.env.PTZ_GW_WP_SECRET,          // shared secret — must match the WP snippet
  sweepwidgetUrl:    process.env.PTZ_GW_SWEEPWIDGET_URL,    // your SweepWidget live page link (step 2)
};

const BUTTON_ID = 'ptz_gw_open';
const MODAL_ID  = 'ptz_gw_modal';

// ── Post the entry message with the button (call this ONCE) ─────────────
async function postEntryMessage(client) {
  const channel = await client.channels.fetch(CONFIG.entryChannelId);

  const embed = new EmbedBuilder()
    .setTitle('🌶️ Peppertidez Giveaway — Enter Here')
    .setDescription(
      'Tap the button below to lock in your entry.\n\n' +
      '**Step 1:** Enter your info here (this counts as your base entry).\n' +
      '**Step 2:** You\'ll get a link to rack up bonus entries on TikTok — follow, repost, like, comment.\n\n' +
      'Good luck! 🍀'
    )
    .setColor(0x8B0000);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(BUTTON_ID)
      .setLabel('Enter Giveaway')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🎉')
  );

  await channel.send({ embeds: [embed], components: [row] });
}

// ── Handle the button click → open the popup form ───────────────────────
async function handleButton(interaction) {
  if (interaction.customId !== BUTTON_ID) return false;

  const modal = new ModalBuilder().setCustomId(MODAL_ID).setTitle('Giveaway Entry');

  const name = new TextInputBuilder()
    .setCustomId('name').setLabel('Your name')
    .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80);

  const email = new TextInputBuilder()
    .setCustomId('email').setLabel('Email (so we can reach you if you win)')
    .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(120);

  const tiktok = new TextInputBuilder()
    .setCustomId('tiktok').setLabel('Your TikTok @handle')
    .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(60);

  modal.addComponents(
    new ActionRowBuilder().addComponents(name),
    new ActionRowBuilder().addComponents(email),
    new ActionRowBuilder().addComponents(tiktok),
  );

  await interaction.showModal(modal);
  return true;
}

// ── Handle the popup form submit → save the entry ───────────────────────
async function handleModal(interaction) {
  if (interaction.customId !== MODAL_ID) return false;

  await interaction.deferReply({ ephemeral: true });

  const name   = interaction.fields.getTextInputValue('name').trim();
  const email  = interaction.fields.getTextInputValue('email').trim();
  const tiktok = interaction.fields.getTextInputValue('tiktok').trim();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    await interaction.editReply('That email doesn\'t look right — tap the button and try again.');
    return true;
  }

  const entry = {
    discord_id:  interaction.user.id,
    discord_tag: interaction.user.tag,
    name, email, tiktok,
    at: new Date().toISOString(),
  };

  // Save to WordPress (durable — survives Railway redeploys). Dedupes on discord_id.
  let saved = false;
  if (CONFIG.wpEndpoint) {
    try {
      const res = await fetch(CONFIG.wpEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-PTZ-Secret': CONFIG.wpSecret },
        body: JSON.stringify(entry),
      });
      saved = res.ok;
    } catch (e) {
      saved = false;
    }
  }

  // Backup: log to a private admin channel
  if (CONFIG.adminLogChannelId) {
    try {
      const log = await interaction.client.channels.fetch(CONFIG.adminLogChannelId);
      await log.send(
        `📥 **New entry** — ${name} | ${email} | ${tiktok} | <@${interaction.user.id}>` +
        (saved ? '' : ' ⚠️ WP save failed')
      );
    } catch (e) { /* ignore */ }
  }

  const step2 = CONFIG.sweepwidgetUrl
    ? `\n\n**Step 2 — bonus entries:** ${CONFIG.sweepwidgetUrl}`
    : '';

  await interaction.editReply(`✅ You're in, ${name}! Your entry is locked.${step2}`);
  return true;
}

module.exports = { postEntryMessage, handleButton, handleModal, BUTTON_ID, MODAL_ID };

/* ── WIRE-UP ───────────────────────────────────────────────────────────
   In your main bot file (where you create `client`), add:

     const { postEntryMessage, handleButton, handleModal } = require('./giveawayEntryButton');

     client.on('interactionCreate', async (interaction) => {
       if (interaction.isButton()      && await handleButton(interaction)) return;
       if (interaction.isModalSubmit() && await handleModal(interaction))  return;
       // ...your existing interaction handling below...
     });

   To POST the button message the first time, run this once (e.g. temporarily
   inside your 'ready' event, then remove it after it posts once):

     client.once('ready', async () => {
       await postEntryMessage(client);
     });

   RAILWAY ENV VARS to set:
     PTZ_GW_ENTRY_CHANNEL_ID   = (right-click the giveaway-entry channel → Copy Channel ID)
     PTZ_GW_ADMIN_CHANNEL_ID   = (a private channel ID for entry logs)
     PTZ_GW_WP_ENDPOINT        = https://peppertidez.shop/wp-json/ptz/v1/gw-discord
     PTZ_GW_WP_SECRET          = (a long random string — must match the WP snippet)
     PTZ_GW_SWEEPWIDGET_URL    = (your SweepWidget live page link)

   (Enable Developer Mode in Discord → User Settings → Advanced, to copy IDs.)
────────────────────────────────────────────────────────────────────────── */
