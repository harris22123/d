const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const fs = require('fs').promises;
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

// Helper function to check if user has any of the required roles
function hasRequiredRole(member) {
    return ADMIN_ROLE_IDS.some(roleId => member.roles.cache.has(roleId));
}

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const args = message.content.trim().split(/\s+/);
    const command = args.shift().toLowerCase();

    if (command === '!block' || command === '!unblock') {
        if (!hasRequiredRole(message.member)) {
            return message.reply({
                content: '<:Cross:1372199098467352687> You do not have the required roles to use this command.',
                ephemeral: true
            });
        }

        const targetUser = message.mentions.users.first() || args[0];
        if (!targetUser) {
            return message.reply({
                content: '<:Cross:1372199098467352687> Please mention a user or provide their ID!',
                ephemeral: true
            });
        }

        const userId = targetUser.id || targetUser;

        try {
            const rawData = await fs.readFile('./verifiedUsers.json', 'utf8');
            let verifiedUsers = JSON.parse(rawData);

            const userIndex = verifiedUsers.findIndex(user => user.discordId === userId);
            if (userIndex === -1) {
                return message.reply({
                    content: '<:Cross:1372199098467352687> No data found for this user.',
                    ephemeral: true
                });
            }

            // Update blocked status
            verifiedUsers[userIndex] = {
                ...verifiedUsers[userIndex],
                blocked: command === '!block'
            };

            await fs.writeFile('./verifiedUsers.json', JSON.stringify(verifiedUsers, null, 2));

            const embed = new EmbedBuilder()
                .setColor(command === '!block' ? 0xFF0000 : 0x00FF00)
                .setTitle(command === '!block' ? 'User Blocked' : 'User Unblocked')
                .setDescription(`${command === '!block' ? 'Blocked' : 'Unblocked'} user with ID: ${userId}`);

            message.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error updating JSON:', error);
            message.reply({
                content: '<:Cross:1372199098467352687> An error occurred while processing the user.',
                ephemeral: true
            });
        }
    }
});

// Login
client.login(process.env.TOKEN);
