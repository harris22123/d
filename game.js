const { Client, EmbedBuilder, GatewayIntentBits } = require('discord.js');
const { getFortniteClient, manager } = require('./fnbrManager.js');
const { Friend } = require('fnbr');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

// Add this near the top of your file with other requires
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '')));

// Add this route to handle commands from the web panel
app.post('/command', async (req, res) => {
    const { command } = req.body;
    try {
        // Find the channel where you want to send the command
        const channel = client.channels.cache.get('1378406260428378165'); // Replace with your channel ID
        if (channel) {
            // Create a fake message object to trigger your existing command handlers
            const fakeMessage = {
                content: command,
                channel: channel,
                delete: () => Promise.resolve(),
                author: {
                    bot: false,
                    id: '922113203205464135' // Replace with your admin user ID
                }
            };
            
            // Emit a messageCreate event with the fake message
            client.emit('messageCreate', fakeMessage);
            res.status(200).json({ message: 'Command sent successfully' });
        } else {
            res.status(404).json({ error: 'Channel not found' });
        }
    } catch (error) {
        console.error('Error processing command:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Start the web server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Web panel running on port ${PORT}`);
});

// Your existing Discord bot code continues here...

const PARTY_SIZES = {
    '1': { name: 'Solo', size: 1 },
    '2': { name: 'Duo', size: 2 },
    '3': { name: 'Trio', size: 3 },
    '4': { name: 'Squad', size: 4 }
};

// Cosmetic constants
const DEFAULT_SKIN = 'CID_016_Athena_Commando_F';
const EMOTES = {
    ERROR: 'EID_RedCard',
    WAITING: 'EID_ChairTime',
    SETTING_CODE: 'EID_Texting'
};

// Map to store queued players and message information
const queuedPlayers = new Map();
// Set to store queued player IDs across all active queues
const queuedPlayerIds = new Set();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageReactions
    ]
});

// Add ready event handler
client.once('ready', () => {
    console.log('Discord bot is ready!');
});

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function isInUserParty(party, userId) {
    if (!party) return false;
    try {
        return party.members.some(member => member.id === userId);
    } catch {
        return false;
    }
}

async function getPartyMemberCount(party) {
    if (!party || !party.members) return 0;
    try {
        return Array.from(party.members.values()).length - 1;
    } catch (error) {
        console.error('Error counting party members:', error);
        return 0;
    }
}

async function setCustomMatchmakingKey(party, code, maxAttempts = 3) {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            if (party && party.me && party.me.isLeader) {
                await party.setCustomMatchmakingKey(code);
                return true;
            }
            await delay(1000);
        } catch (error) {
            console.error(`Attempt ${i + 1}/${maxAttempts} failed:`, error);
            if (i < maxAttempts - 1) await delay(1000);
        }
    }
    return false;
}

async function isPlayerInQueue(userId) {
    return queuedPlayerIds.has(userId);
}

async function addPlayerToQueue(userId) {
    if (!queuedPlayerIds.has(userId)) {
        queuedPlayerIds.add(userId);
        console.log(`Added user ${userId} to queue`); // Debug log
        return true;
    }
    return false;
}

async function removePlayerFromQueue(userId) {
    const removed = queuedPlayerIds.delete(userId);
    if (removed) {
        console.log(`Removed user ${userId} from queue`); // Debug log
    }
    return removed;
}

async function safeSetEmote(partyMember, emoteId) {
    try {
        if (partyMember && typeof partyMember.setEmote === 'function') {
            await partyMember.setEmote(emoteId);
            return true;
        }
    } catch (error) {
        console.log(`Failed to set emote: ${error.message}`);
        return false;
    }
    return false;
}

async function isPlayerInQueue(userId) {
    return queuedPlayerIds.has(userId);
}

async function addPlayerToQueue(userId) {
    queuedPlayerIds.add(userId);
}

async function removePlayerFromQueue(userId) {
    queuedPlayerIds.delete(userId);
}

async function sendAlreadyInQueueMessage(user) {
    try {
        const alreadyInQueueEmbed = new EmbedBuilder()
            .setDescription("You're already in the queue!")
            .setColor('#ff0000');
        const dmMessage = await user.send({ embeds: [alreadyInQueueEmbed] });
        setTimeout(() => dmMessage.delete().catch(console.error), 5000);
    } catch (error) {
        console.error('Could not send DM to user:', error);
    }
}
async function handlePartyOperations(fortniteClient, userData, user, accountData, account, gameMode, matchCode) {
    try {
        console.log(`Starting ${PARTY_SIZES[gameMode].name} party operations for user: ${userData.epicUsername} with bot: ${accountData.displayName}`);
        
        // Wait for party to be created if it doesn't exist
        if (!fortniteClient.party) {
            console.log('No party exists, creating one...');
            try {
                await fortniteClient.party.create();
                await delay(2000); // Wait for party to be fully created
            } catch (error) {
                console.log('Error creating party, will try to join user party directly');
            }
        }

        // Set default skin when starting operations
        try {
            if (fortniteClient.party && fortniteClient.party.me) {
                await fortniteClient.party.me.setOutfit(DEFAULT_SKIN);
            }
        } catch (error) {
            console.log('Could not set outfit, continuing...');
        }

        const friend = new Friend(fortniteClient, { id: userData.epicAccountId });
        const added1 = new EmbedBuilder()
            .setTitle(`Good news!`)
            .setDescription(`You have been chosen to participate in the match.

You have 60 seconds for each of these steps:

1. Accept friend request from ${accountData.displayName}.
2. Once you have it added as friend, invite ${accountData.displayName} to your party.
--> If your party is on friends only or public, it will join without invite.
3. Promote ${accountData.displayName} to party leader.
4. Once the bot left your party, ready up immediately.

**NOTE:** It's not sufficient to only invite the bot - you must add it as friend before inviting it!
`)
            .setTimestamp();

        try {
            await friend.addFriend();
            console.log(`Sent friend request to: ${userData.epicUsername} from bot: ${accountData.displayName}`);
            await user.send({ embeds: [added1] });

            const invitePromise = new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    fortniteClient.removeAllListeners('party:invite');
                    reject(new Error('Invite timeout'));
                }, 30000);

                fortniteClient.on('party:invite', async (invitation) => {
                    if (invitation.sender.id === userData.epicAccountId) {
                        clearTimeout(timeout);
                        try {
                            await invitation.accept();
                            console.log(`Accepted party invite from ${userData.epicUsername}`);
                            resolve();
                        } catch (error) {
                            console.error('Error accepting invite:', error);
                            reject(error);
                        }
                    }
                });
            });

            try {
                await invitePromise;
                // Set chair emote immediately after joining party
                await delay(1000); // Small delay to ensure party join is complete
                if (fortniteClient.party?.me) {
                    await safeSetEmote(fortniteClient.party.me, EMOTES.WAITING);
                    console.log('Set initial waiting emote');
                }
            } catch (error) {
                console.error('Party invite error:', error);
                await safeSetEmote(fortniteClient.party?.me, EMOTES.ERROR);
                await delay(2000);
                manager.markBusy(account, false);
                removePlayerFromQueue(userData.discordId);
                return;
            }

            let joinAttempts = 0;
            const maxAttempts = 60;

            while (joinAttempts < maxAttempts) {
                if (fortniteClient.party && await isInUserParty(fortniteClient.party, userData.epicAccountId)) {
                    if (fortniteClient.party.me && fortniteClient.party.me.isLeader) {
                        console.log(`Bot ${accountData.displayName} received party leader`);
                        await safeSetEmote(fortniteClient.party.me, EMOTES.SETTING_CODE);
                        
                        await delay(2000);
                        
                        const currentPartySize = await getPartyMemberCount(fortniteClient.party);
                        const expectedSize = PARTY_SIZES[gameMode].size;
                        
                        console.log(`Current party size (excluding bot): ${currentPartySize}, Expected: ${expectedSize}`);

                        const invalidpeople = new EmbedBuilder()
                            .setTitle('Invalid Party Size')
                            .setDescription(`Invalid party size! You need ${expectedSize} players. Current size ${currentPartySize}`)
                            .setColor('#ff0000')
                            .setTimestamp();
                        
                        if (currentPartySize !== expectedSize) {
                            console.log(`Invalid party size: ${currentPartySize}, expected: ${expectedSize}`);
                            await safeSetEmote(fortniteClient.party.me, EMOTES.ERROR);
                            await delay(2000);
                            try {
                                if (fortniteClient.party) {
                                    await fortniteClient.party.leave();
                                }
                                await friend.remove();
                                await user.send({ embeds: [invalidpeople] });
                                manager.markBusy(account, false);
                                removePlayerFromQueue(userData.discordId);
                                return;
                            } catch (error) {
                                console.error('Error during cleanup:', error);
                            }
                            return;
                        }
                        
                        if (await isInUserParty(fortniteClient.party, userData.epicAccountId)) {
                            console.log(`Bot ${accountData.displayName} attempting to set custom matchmaking code...`);
                            
                            if (await setCustomMatchmakingKey(fortniteClient.party, matchCode)) {
                                console.log(`Bot ${accountData.displayName} successfully set custom matchmaking code to: ${matchCode}`);
                                
                                await delay(2000);
                                
                                try {
                                    if (fortniteClient.party) {
                                        await fortniteClient.party.leave();
                                        console.log(`Bot ${accountData.displayName} successfully left party`);
                                    }
                                } catch (leaveError) {
                                    console.log(`Bot ${accountData.displayName} party already disbanded or left`);
                                }
                                
                                try {
                                    await friend.remove();
                                    console.log(`Bot ${accountData.displayName} removed friend: ${userData.epicUsername}`);
                                } catch (friendRemoveError) {
                                    console.error(`Bot ${accountData.displayName} error removing friend:`, friendRemoveError);
                                }

                                const started1 = new EmbedBuilder()
                                    .setTitle('Perfect!')
                                    .setDescription(`
Your code is now set. Please ready up **now!**

**Zone Rules**
• You may fight until there are **80** players remaining.
• Re-start fighting when **5th Zone APPEARS** or Storm surge **APPEARS**
• Do **NOT** fight when the count goes up from 80 after a reboot.
• In event of a storm surge, you may kill if necessary.`)
                                    .setColor('Green')
                                    .setTimestamp();
                                
                                await user.send({ embeds: [started1] });
                                manager.markBusy(account, false);
                                removePlayerFromQueue(userData.discordId);
                                return;
                            } else {
                                console.log(`Bot ${accountData.displayName} failed to set custom matchmaking code`);
                                await safeSetEmote(fortniteClient.party.me, EMOTES.ERROR);
                                await delay(2000);
                                manager.markBusy(account, false);
                                removePlayerFromQueue(userData.discordId);
                                return;
                            }
                        }
                    }
                }
                
                await delay(1000);
                joinAttempts++;
                
                if (joinAttempts % 10 === 0) {
                    console.log(`Bot ${accountData.displayName} waiting for party/leader status... Attempt ${joinAttempts}/${maxAttempts}`);
                }
            }

            console.log(`Bot ${accountData.displayName} operation timed out, cleaning up...`);
            await safeSetEmote(fortniteClient.party?.me, EMOTES.ERROR);
            await delay(2000);
            try {
                if (fortniteClient.party) {
                    await fortniteClient.party.leave();
                }
            } catch (error) {
                console.log(`Bot ${accountData.displayName} party already disbanded or left`);
            }
            
            try {
                await friend.remove();
                console.log(`Bot ${accountData.displayName} removed friend: ${userData.epicUsername}`);
            } catch (friendRemoveError) {
                console.error(`Bot ${accountData.displayName} error removing friend:`, friendRemoveError);
            }
            
            manager.markBusy(account, false);
            removePlayerFromQueue(userData.discordId);

        } catch (error) {
            console.error(`Bot ${accountData.displayName} error in party operations:`, error);
            
            await safeSetEmote(fortniteClient.party?.me, EMOTES.ERROR);
            await delay(2000);
            
            try {
                if (fortniteClient.party) {
                    await fortniteClient.party.leave();
                }
            } catch (error) {
                console.log(`Bot ${accountData.displayName} party already disbanded or left`);
            }
            
            try {
                await friend.remove();
            } catch (friendRemoveError) {
                console.error(`Bot ${accountData.displayName} error removing friend:`, friendRemoveError);
            }
            manager.markBusy(account, false);
            removePlayerFromQueue(userData.discordId);
        }
    } catch (error) {
        console.error(`Bot ${accountData.displayName} error in party operations:`, error);
        
        await safeSetEmote(fortniteClient.party?.me, EMOTES.ERROR);
        await delay(2000);
        
        try {
            if (fortniteClient.party) {
                await fortniteClient.party.leave();
            }
        } catch (error) {
            console.log(`Bot ${accountData.displayName} party already disbanded or left`);
        }
        manager.markBusy(account, false);
        removePlayerFromQueue(userData.discordId);
    }
}
// Initialize currentMatchCode
let currentMatchCode = null;

client.on('messageCreate', async (message) => {
    // Ignore messages from bots
    if (message.author.bot) return;

    if (message.content.match(/^!s [1-4]$/)) {
        try {
            // Delete the command message
            await message.delete().catch(console.error);

            const gameMode = message.content.split(' ')[1];
            currentMatchCode = generateCode();

            const embed = new EmbedBuilder()
                .setTitle(`${PARTY_SIZES[gameMode].name} Matchmaking`)
                .setDescription(`
> **Please click :raised_hand: to sign up for the match.**
**Game Mode:**
${PARTY_SIZES[gameMode].name}

**Rules**
> **\`1.\` Zonerules:**
> * No fighting till reboots disabled or surge appears.
> * No looking for surge tags before fight time.

> **\`2.\` General Rules:**
> * No teamingsniping.
> * No Hacking in anyway shape or form.
> * No leaking codes to banned players.
> * No playing with banned players.
`)
                .setTimestamp()
                .setFooter({ text: 'Made with ❤ by @harrisfnbr1' });

            const sentEmbed = await message.channel.send({ embeds: [embed] });
            await sentEmbed.react('✋');

            // Store reactions for processing during dispatch
            const reactions = new Set();
            const collector = sentEmbed.createReactionCollector({ 
                filter: (reaction, user) => reaction.emoji.name === '✋' && !user.bot 
            });
            
            collector.on('collect', async (reaction, user) => {
                if (!await isPlayerInQueue(user.id)) {
                    reactions.add(user.id);
                    await addPlayerToQueue(user.id);
                    console.log(`Added ${user.tag} to queue`);
                } else {
                    await reaction.users.remove(user);
                    await sendAlreadyInQueueMessage(user);
                }
            });

            queuedPlayers.set(sentEmbed.id, {
                message: sentEmbed,
                gameMode: gameMode,
                channelId: message.channel.id,
                active: true,
                matchCode: currentMatchCode,
                reactions: reactions,
                originalMessage: sentEmbed
            });
        } catch (error) {
            console.error('Error in !s command:', error);
        }
    }

    if (message.content === '!d') {
        try {
            await message.delete().catch(console.error);

            const activeQueue = Array.from(queuedPlayers.values())
                .find(q => q.channelId === message.channel.id && q.active);

            if (!activeQueue) {
                const errorMessage = await message.channel.send({ 
                    embeds: [new EmbedBuilder()
                        .setDescription('No active queue found in this channel!')
                        .setColor('#ff0000')]
                });
                setTimeout(() => errorMessage.delete().catch(console.error), 5000);
                return;
            }

            // Remove reactions from the original !s message
            try {
                await activeQueue.message.reactions.removeAll();
            } catch (error) {
                console.error('Error removing reactions:', error);
            }

            const joinEmbed = new EmbedBuilder()
                .setTitle(`Dispatching`)
                .setDescription(`_ _
<a:alert:1378398710882504845> **Missed queue?** Click :raised_hand: below to sign up late.

<:none:1378398674987520082> **Already signed up?** Ignore this message.`);

            const newJoinMessage = await message.channel.send({ embeds: [joinEmbed] });
            await newJoinMessage.react('✋');

            const verifiedData = JSON.parse(fs.readFileSync('./verifiedUsers.json'));
            
            console.log(`Processing ${activeQueue.reactions.size} queued players`);
            
            for (const userId of activeQueue.reactions) {
                const userData = verifiedData.find(data => data.discordId === userId);
                if (userData && userData.epicUsername) {
                    const user = await client.users.fetch(userId);
                    try {
                        const { client: fortniteClient, accountData, account } = await getFortniteClient();
                        console.log(`Processing queued player: ${userData.epicUsername}`);
                        await handlePartyOperations(fortniteClient, userData, user, accountData, account, activeQueue.gameMode, activeQueue.matchCode);
                    } catch (err) {
                        console.error('Error processing queued player:', err);
                        removePlayerFromQueue(userId);
                    }
                }
            }

            const collector = newJoinMessage.createReactionCollector({
                filter: (reaction, user) => reaction.emoji.name === '✋' && !user.bot
            });

            collector.on('collect', async (reaction, user) => {
                if (!activeQueue.active) return;

                // Immediately check and remove reaction if already in queue
                const isQueued = await isPlayerInQueue(user.id);
                console.log(`User ${user.tag} queue status:`, isQueued); // Debug log

                if (isQueued) {
                    try {
                        await reaction.users.remove(user);
                        await sendAlreadyInQueueMessage(user);
                    } catch (err) {
                        console.error('Error handling queued user:', err);
                    }
                    return;
                }

                const userData = verifiedData.find(data => data.discordId === user.id);
                if (!userData || !userData.epicUsername) {
                    await reaction.users.remove(user);
                    return;
                }

                try {
                    // Add to queue before processing
                    await addPlayerToQueue(user.id);
                    activeQueue.reactions.add(user.id); // Add to active queue's reactions

                    const { client: fortniteClient, accountData, account } = await getFortniteClient();
                    console.log(`Processing immediate join: ${userData.epicUsername}`);
                    await handlePartyOperations(fortniteClient, userData, user, accountData, account, activeQueue.gameMode, activeQueue.matchCode);
                } catch (err) {
                    console.error('Error processing immediate join:', err);
                    removePlayerFromQueue(user.id);
                    activeQueue.reactions.delete(user.id); // Remove from active queue's reactions
                }
            });

            activeQueue.message = newJoinMessage;
        } catch (error) {
            console.error('Error in !d command:', error);
        }
    }
    if (message.content === '!c') {
    try {
        // Delete the command message
        await message.delete().catch(console.error);

        const activeQueue = Array.from(queuedPlayers.values())
            .find(q => q.channelId === message.channel.id && q.active);

        if (!activeQueue) {
            const errorMessage = await message.channel.send({ 
                embeds: [new EmbedBuilder()
                    .setDescription('No active queue found in this channel!')
                    .setColor('#ff0000')]
            });
            setTimeout(() => errorMessage.delete().catch(console.error), 5000);
            return;
        }

        // Create cancel embed
        const cancelEmbed = new EmbedBuilder()
            .setTitle(`Match Canceled`)
            .setDescription('# Game Canceled')
            .setColor('#ff0000')
            .setTimestamp()
            .setFooter({ text: 'Made with ❤ by @harrisfnbr1' });

        // Delete both the original !s message and the dispatch message if they exist
        try {
            if (activeQueue.originalMessage) {
                await activeQueue.originalMessage.delete().catch(console.error);
            }
            if (activeQueue.message && activeQueue.message.id !== activeQueue.originalMessage?.id) {
                await activeQueue.message.delete().catch(console.error);
            }
        } catch (error) {
            console.error('Failed to delete queue messages:', error);
        }

        // Send cancel message
        await message.channel.send({ embeds: [cancelEmbed] });

        // Clear all queued players
        for (const userId of activeQueue.reactions) {
            removePlayerFromQueue(userId);
        }

        // Deactivate the queue and clean up
        activeQueue.active = false;
        queuedPlayers.delete(activeQueue.message.id);
        currentMatchCode = null;

    } catch (error) {
        console.error('Error in !c command:', error);
        const errorMessage = await message.channel.send({ 
            embeds: [new EmbedBuilder()
                .setDescription('An error occurred while cancelling the match.')
                .setColor('#ff0000')]
        });
        setTimeout(() => errorMessage.delete().catch(console.error), 5000);
    }
}


    if (message.content === '!st') {
        try {
            await message.delete().catch(console.error);

            const activeQueue = Array.from(queuedPlayers.values())
                .find(q => q.channelId === message.channel.id && q.active);

            if (!activeQueue) {
                const errorMessage = await message.channel.send({ 
                    embeds: [new EmbedBuilder()
                        .setDescription('No active queue found in this channel!')]
                });
                setTimeout(() => errorMessage.delete().catch(console.error), 5000);
                return;
            }

            const startedEmbed = new EmbedBuilder()
                .setTitle(`${PARTY_SIZES[activeQueue.gameMode].name} Matchmaking`)
                .setDescription(`<:play:1378398535413927937> **Match Started!**
                    
**Resources:**
[Report A Player](https://discord.com/channels/1358074429208395958/1358080104202502256) • [Scrim Rules](https://discord.com/channels/1358074429208395958/1358085923664957663) • [Prize Registration](https://discord.com/channels/1358074429208395958/1358087239284035694) • [Ban Appeals](https://discord.gg/22MpUMPqd4)`)
                .setFooter({ text: 'Made with ❤ by @harrisfnbr1' });

            // Delete both the original !s message and the dispatch message
            try {
                if (activeQueue.originalMessage) {
                    await activeQueue.originalMessage.delete().catch(console.error);
                }
                if (activeQueue.message && activeQueue.message.id !== activeQueue.originalMessage?.id) {
                    await activeQueue.message.delete().catch(console.error);
                }
            } catch (error) {
                console.error('Failed to delete queue messages:', error);
            }

            const finalMessage = await message.channel.send({ embeds: [startedEmbed] });

            // Clear all queued players
            for (const userId of activeQueue.reactions) {
                removePlayerFromQueue(userId);
            }

            activeQueue.active = false;
            queuedPlayers.delete(activeQueue.message.id);
            currentMatchCode = null;

        } catch (error) {
            console.error('Error in !st command:', error);
            const errorMessage = await message.channel.send({ 
                embeds: [new EmbedBuilder()
                    .setDescription('An error occurred while closing the queue.')]
            });
            setTimeout(() => errorMessage.delete().catch(console.error), 5000);
        }
    }
});

// Start the bot
client.login(process.env.TOKEN);
