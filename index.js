require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => {
  console.log(`Peppertidez bot online as ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'entrycode') return;

  // Command only works inside the server. Running it here = proof they joined.
  if (!interaction.inGuild()) {
    return interaction.reply({
      content: 'Please run this inside the Peppertidez server to get your code.',
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true }); // only the user sees the reply

  try {
    const res = await fetch(`${process.env.WP_URL}/wp-json/ptz/v1/mint-code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PTZ-Secret': process.env.PTZ_SECRET,
      },
      body: JSON.stringify({
        discord_id: interaction.user.id,
        discord_username: interaction.user.username,
      }),
    });

    const data = await res.json();

    if (!data.ok) {
      return interaction.editReply(
        `Hmm, something went wrong (${data.msg || 'try again shortly'}).`
      );
    }

    const intro = data.new
      ? 'Here’s your giveaway entry code'
      : 'You already have a code — here it is again';

    return interaction.editReply(
      `🌶️ ${intro}:\n\n**\`${data.code}\`**\n\n` +
      `Head to the giveaway form at peppertidez.shop and paste it in to lock your entry. ` +
      `One entry per person — keep this code to yourself.`
    );
  } catch (err) {
    console.error(err);
    return interaction.editReply(
      'Network hiccup reaching the site. Give it a minute and try again.'
    );
  }
});

client.login(process.env.TOKEN);
