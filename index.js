const {
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, Events, Partials, REST, Routes
} = require('discord.js');
const fetch = require('node-fetch');
const { readFile, writeFile } = require('fs').promises;
require('dotenv').config();

const { manager: fnbrManager, getFortniteClient } = require('./fnbrManager');  // Updated import
const { handleVerificationProcess, handleDMVerification } = require('./verificationHandler');
const blockcommands = require('./block')
const querycommand = require('./query')
const checkigncommand = require('./checkign')
const game = require('./game')

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const VERIFY_ROLE_ID = process.env.VERIFY_ROLE_ID;

(async () => {
  try {
    // Initialize FNBR account manager
    await fnbrManager.loadAccounts();
    console.log('✅ FNBR Manager initialized successfully');

    // Login to Discord
    await client.login(TOKEN);

    // Register slash command
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
      await rest.put(Routes.applicationCommands(CLIENT_ID), {
        body: [{
          name: 'verify',
          description: 'Start the Fortnite username verification process'
        }]
      });
      console.log('✅ Slash command registered');
    } catch (err) {
      console.error('❌ Failed to register command:', err);
    }

    client.once('ready', () => {
      console.log(`✅ Logged in as ${client.user.tag}`);
      client.user.setActivity('@Kyro', { type: 2 });
    });

    // In your main bot file, modify the button interaction handler:
    client.on(Events.InteractionCreate, async interaction => {
      try {
        if (interaction.isChatInputCommand() && interaction.commandName === 'verify') {
          await handleVerificationProcess(interaction, client, VERIFY_ROLE_ID, fnbrManager);
        }

        if (interaction.isButton() && interaction.customId === 'start_verification') {
          // Check if user is blocked before proceeding
          try {
            const rawData = await readFile('./verifiedUsers.json', 'utf8');
            const verifiedUsers = JSON.parse(rawData);
            const userData = verifiedUsers.find(user => user.discordId === interaction.user.id);

            if (userData && userData.blocked) {
              return interaction.reply({
                content: '<:Cross:1372199098467352687> You are blocked from using this verification system.',
                ephemeral: true
              });
            }

            // If not blocked, proceed with original verification process
            const dmChannel = await interaction.user.createDM();
            
            const dmButton = new ButtonBuilder()
              .setLabel('Go to DMs')
              .setStyle(ButtonStyle.Link)
              .setURL(`https://discord.com/channels/@me/1371877470445502664`);

            const row = new ActionRowBuilder()
              .addComponents(dmButton);

            await interaction.reply({
              content: `${interaction.user}, check your DMs!`,
              components: [row],
              ephemeral: true
            });

            await handleDMVerification(interaction, client, VERIFY_ROLE_ID, fnbrManager, dmChannel);
          } catch (err) {
            if (!interaction.replied && !interaction.deferred) {
              await interaction.reply({
                content: '<:Cross:1372199098467352687> Please make sure your DMs are open.',
                ephemeral: true
              });
            }
            console.error('DM Verification Error:', err);
          }
        }
      } catch (error) {
        console.error('Interaction Error:', error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: '<:Cross:1372199098467352687> An error occurred.',
            ephemeral: true
          });
        }
      }
    });

  } catch (error) {
    console.error('❌ Failed to initialize:', error);
    process.exit(1);
  }
})();
