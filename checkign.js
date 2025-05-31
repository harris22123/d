const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ]
});

const ADMIN_ROLE_IDS = process.env.ADMIN_ROLE_IDS.split(',').map(id => id.trim());

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const args = message.content.trim().split(/\s+/);
    const command = args.shift().toLowerCase();

    if (command === '!checkign') {
        if (!message.member.roles.cache.some(role => ADMIN_ROLE_IDS.includes(role.id))) {
            return message.reply({
                content: '<:Cross:1372199098467352687> You do not have the required roles to use this command.',
                ephemeral: true
            });
        }

        const searchValue = args[0];
        if (!searchValue) {
            return message.reply({
                content: '<:Cross:1372199098467352687> Please provide an Epic Account ID or Epic Username!',
                ephemeral: true
            });
        }

        try {
            const rawData = fs.readFileSync('./verifiedUsers.json', 'utf8');
            const verifiedUsers = JSON.parse(rawData);

            const userData = verifiedUsers.find(user =>
                user.epicAccountId === searchValue || user.epicUsername?.toLowerCase() === searchValue.toLowerCase()
            );

            if (!userData) {
                return message.reply({
                    content: '<:Cross:1372199098467352687> No data found for this Epic Account.',
                    ephemeral: true
                });
            }

const discordUser = await client.users.fetch(userData.discordId).catch(() => null);

const embed = new EmbedBuilder()
    .setColor(userData.blocked ? 0xFF0000 : 0x00BFFF)
    .setTitle('🎮 Epic Account Lookup')
    .setThumbnail('https://cdn-icons-png.flaticon.com/512/3064/3064197.png')
    .addFields(
        { name: '🆔 Discord ID', value: `\`${userData.discordId}\``, inline: true },
        { name: '🏷️ Discord Username', value: discordUser ? `${discordUser.tag}` : 'Unknown / Left Server', inline: true },
        { name: '🎮 Epic Username', value: userData.epicUsername || 'N/A', inline: true },
        { name: '🧾 Epic Account ID', value: `\`${userData.epicAccountId || 'N/A'}\``, inline: true },
        { name: '📅 Verified At', value: new Date(userData.verifiedAt).toLocaleString(), inline: false },
    )
    .setFooter({ text: userData.blocked ? 'Status: 🚫 Blocked' : 'Status: ✅ Verified' })
    .setTimestamp();

            message.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error reading or parsing JSON:', error);
            message.reply({
                content: '<:Cross:1372199098467352687> An error occurred while fetching the Epic account data.',
                ephemeral: true
            });
        }
    }
});

// Login only if it's a standalone file
// client.login(process.env.TOKEN);


// Login only if it's a standalone file
client.login(process.env.TOKEN);
// client.login(process.env.TOKEN);
