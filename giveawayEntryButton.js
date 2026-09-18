// giveawayEntryButton.js
// PTZ giveaway — locked-channel entry buttons + popup forms (modals) for discord.js v14
//
// Supports MULTIPLE giveaways at once. Each "campaign" has its own button,
// its own popup, its own log channel, and its own SweepWidget link.
// Add more by dropping another entry in the CAMPAIGNS object below.
//
// The original giveaway keeps its exact button/modal IDs (ptz_gw_open /
// ptz_gw_modal), so the button already posted in Discord keeps working.

const {
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
} = require('discord.js');

// ── CAMPAIGNS ───────────────────────────────────────────────────────────
// One block per giveaway. `key` is used by the admin command to pick which
// button to post (see /postentry and /postmini in index.js).
const CAMPAIGNS = {
  // ── The main / current giveaway (unchanged IDs) ──
  main: {
    buttonId: 'ptz_gw_open',
    modalId:  'ptz_gw_modal',
    logTag:   'MAIN',
    entryChannelId: process.env.PTZ_GW_ENTRY_CHANNEL_ID,   // locked "giveaway-entry" channel
    logChannelId:   process.env.PTZ_GW_ADMIN_CHANNEL_ID,   // main log channel
    sweepwidgetUrl: process.env.PTZ_GW_SWEEPWIDGET_URL,    // main SweepWidget link
    embedTitle: '🌶️ Peppertidez Giveaway — Enter Here',
    embedBody:
      'Tap the button below to lock in your entry.\n\n' +
      '**Step 1:** Enter your info here (this counts as your base entry).\n' +
      '**Step 2:** You\'ll get a link to lock in your entry — just follow ' +
      'both our TikTok accounts: @peppertidez.labs and @peppertidez_backup.\n\n' +
      'Good luck! 🍀',
    buttonLabel: 'Enter Giveaway',
    buttonEmoji: '🎉',
  },

  // ── The Tech Talk mini giveaway (new) ──
  techtalk: {
    buttonId: 'ptz_tt_open',
    modalId:  'ptz_tt_modal',
    logTag:   'TECH TALK',
    // Posts in the SAME entry channel as the main giveaway:
    entryChannelId: process.env.PTZ_GW_ENTRY_CHANNEL_ID,
    // ...but logs to its OWN channel:
    logChannelId:   process.env.PTZ_TT_LOG_CHANNEL_ID,
    sweepwidgetUrl: process.env.PTZ_TT_SWEEPWIDGET_URL,
    embedTitle: '📣 Tech Talk Mini Giveaway — Enter Here',
    embedBody:
      'A quick bonus entry for the Tech Talk giveaway!\n\n' +
      '**Step 1:** Enter your info here.\n' +
      '**Step 2:** You\'ll get a link — complete the task there to lock in your entry.\n\n' +
      'Good luck! 🍀',
    buttonLabel: 'Enter Tech Talk Giveaway',
    buttonEmoji: '📣',
  },
};

// Quick lookups: which campaign owns a given button/modal ID.
const byButtonId = {};
const byModalId  = {};
for (const key of Object.keys(CAMPAIGNS)) {
  byButtonId[CAMPAIGNS[key].buttonId] = key;
  byModalId[CAMPAIGNS[key].modalId]   = key;
}

// ── Post an entry message with its button (call per campaign) ───────────
async function postEntryMessage(client, campaignKey = 'main') {
  const c = CAMPAIGNS[campaignKey];
  if (!c) throw new Error(`Unknown campaign: ${campaignKey}`);
  if (!c.entryChannelId) throw new Error(`No entry channel set for campaign: ${campaignKey}`);

  const channel = await client.channels.fetch(c.entryChannelId);

  const embed = new EmbedBuilder()
    .setTitle(c.embedTitle)
    .setDescription(c.embedBody)
    .setColor(0x8B0000);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(c.buttonId)
      .setLabel(c.buttonLabel)
      .setStyle(ButtonStyle.Success)
      .setEmoji(c.buttonEmoji)
  );

  await channel.send({ embeds: [embed], components: [row] });
}

// ── Button click → open that campaign's popup form ──────────────────────
async function handleButton(interaction) {
  const campaignKey = byButtonId[interaction.customId];
  if (!campaignKey) return false;
  const c = CAMPAIGNS[campaignKey];

  const modal = new ModalBuilder().setCustomId(c.modalId).setTitle('Giveaway Entry');

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

// ── Popup form submit → log the entry, hand out the SweepWidget link ────
async function handleModal(interaction) {
  const campaignKey = byModalId[interaction.customId];
  if (!campaignKey) return false;
  const c = CAMPAIGNS[campaignKey];

  await interaction.deferReply({ ephemeral: true });

  const name   = interaction.fields.getTextInputValue('name').trim();
  const email  = interaction.fields.getTextInputValue('email').trim();
  const tiktok = interaction.fields.getTextInputValue('tiktok').trim();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    await interaction.editReply('That email doesn\'t look right — tap the button and try again.');
    return true;
  }

  // Log to this campaign's channel, tagged so campaigns stay separable.
  if (c.logChannelId) {
    try {
      const log = await interaction.client.channels.fetch(c.logChannelId);
      await log.send(
        `📥 **[${c.logTag}] New entry** — ${name} | ${email} | ${tiktok} | <@${interaction.user.id}>`
      );
    } catch (e) {
      console.error(`[${campaignKey}] log failed:`, e);
    }
  }

  const step2 = c.sweepwidgetUrl
    ? `\n\n**Step 2 — lock in your entry:** ${c.sweepwidgetUrl}`
    : '';

  await interaction.editReply(`✅ You're in, ${name}! Your entry is locked.${step2}`);
  return true;
}

module.exports = { postEntryMessage, handleButton, handleModal, CAMPAIGNS };

/* ── WIRE-UP ───────────────────────────────────────────────────────────
   Already wired in index.js:
     - interactionCreate routes buttons → handleButton, modals → handleModal
     - /postentry posts the MAIN button
     - /postmini  posts the TECH TALK button

   RAILWAY ENV VARS:
     (existing — leave as-is)
     PTZ_GW_ENTRY_CHANNEL_ID   = giveaway-entry channel ID (both buttons post here)
     PTZ_GW_ADMIN_CHANNEL_ID   = main giveaway log channel ID
     PTZ_GW_SWEEPWIDGET_URL    = main SweepWidget link

     (new — add these two)
     PTZ_TT_LOG_CHANNEL_ID     = 1550292059343298611   (mini-giveaway log)
     PTZ_TT_SWEEPWIDGET_URL    = https://sweepwidget.com/c/102356-wbgk3zpy

   The old PTZ_GW_WP_ENDPOINT / PTZ_GW_WP_SECRET vars are no longer read —
   you can delete them (that's what removed the "WP save failed" flag).
────────────────────────────────────────────────────────────────────────── */
