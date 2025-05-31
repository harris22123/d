const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fetch = require('node-fetch');
const { Friend } = require('fnbr');
const { readFile, writeFile } = require('fs').promises;

async function handleVerificationProcess(interaction, client, VERIFY_ROLE_ID, fnbrManager) {
  try {
    const verifyEmbed = new EmbedBuilder()
      .setTitle('Link Fortnite')
      .setDescription('Please click on the raised hand below to link your Epic Account. You will receive a direct message with further instructions.')
      .setColor('#000000');

    const button = new ButtonBuilder()
      .setCustomId('start_verification')
      .setLabel('✋ Link Epic Account')
      .setStyle(ButtonStyle.Primary);

    await interaction.channel.send({
      embeds: [verifyEmbed],
      components: [new ActionRowBuilder().addComponents(button)]
    });

    await interaction.reply({
      content: 'Sent Verification Embed!',
      ephemeral: true
    });
  } catch (err) {
    console.error(err);
    await interaction.reply({
      content: '<:Cross:1372199098467352687> An error occurred.',
      ephemeral: true
    });
  }
}

async function handleDMVerification(interaction, client, VERIFY_ROLE_ID, fnbrManager, dmChannel) {
  try {
    // Check if user is already verified
    const jsonPath = './verifiedUsers.json';
    let users = [];
    try {
      users = JSON.parse(await readFile(jsonPath, 'utf8'));
    } catch (e) {
      users = [];
    }

    const existingUser = users.find(u => u.discordId === interaction.user.id);

    if (existingUser) {
      // Create unlink button
      const unlinkButton = new ButtonBuilder()
        .setCustomId('unlink_account')
        .setLabel('Unlink Account')
        .setStyle(ButtonStyle.Danger);

      const row = new ActionRowBuilder()
        .addComponents(unlinkButton);

      // Send already verified embed with unlink button
      await dmChannel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle('<:T_tickbox:1372198945140506725> You\'re already verified')
            .setDescription(`\`\`\`Name: ${existingUser.epicUsername}\nID: ${interaction.user.id}\`\`\``)
            .setColor('Green')
        ],
        components: [row]
      });

      // Add button collector for unlink
      const filter = i => i.customId === 'unlink_account' && i.user.id === interaction.user.id;
      const collector = dmChannel.createMessageComponentCollector({ filter, time: 60000 });

      collector.on('collect', async i => {
        // Remove user from verifiedUsers.json
        const updatedUsers = users.filter(u => u.discordId !== interaction.user.id);
        await writeFile(jsonPath, JSON.stringify(updatedUsers, null, 2));

        // Remove verified role if it exists
        try {
          const guild = await client.guilds.fetch(interaction.guildId);
          const member = await guild.members.fetch(interaction.user.id);
          if (member && VERIFY_ROLE_ID) {
            await member.roles.remove(VERIFY_ROLE_ID);
          }
        } catch (error) {
          console.error('Error removing role:', error);
        }

        await i.update({
          embeds: [
            new EmbedBuilder()
              .setTitle('<:T_tickbox:1372198945140506725> Account Unlinked')
              .setDescription('Your Epic Games account has been successfully unlinked.')
              .setColor('Green')
          ],
          components: []
        });
      });

      return; // Exit the function early
    }

    await dmChannel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle('Kyro Epic Verification')
          .setDescription(`
            We are now going to link your Epic Games Account to your Discord account. To complete the verification process, please follow the steps below.

            **Enter Epic Username**
            Please enter your Epic Games username below.`)
          .setColor('#000000')
          .setTimestamp()
          .setFooter({ text: 'You have 5 minutes to complete this step.' })
      ]
    });

    const filter = msg => msg.author.id === interaction.user.id;
    const collector = dmChannel.createMessageCollector({ filter, time: 5 * 60_000 });

    collector.on('collect', async msg => {
      const username = msg.content.trim();
      const encodedUsername = encodeURIComponent(username);

      const statusMsg = await dmChannel.send({
        embeds: [
          new EmbedBuilder()
            .setDescription(`<a:Loading:1371890341463982262> Processing \`${username}\``)
            .setColor('#000000')
        ]
      });

      try {
        const res = await fetch(`https://fortniteapi.io/v1/lookup?username=${encodedUsername}`, {
          headers: { Authorization: process.env.FORTNITE_API_KEY }
        });

        if (!res.ok) {
          throw new Error('Failed to verify username');
        }

        const data = await res.json();
        if (!data.result || !data.account_id) {
          await statusMsg.edit({
            embeds: [new EmbedBuilder().setDescription('❌ Invalid Username. Try again.').setColor('Red')]
          });
          return;
        }

        collector.stop();

        const account = fnbrManager.getAvailableAccount();
        if (!account) {
          await dmChannel.send({
            embeds: [new EmbedBuilder().setDescription('❌ All verification bots are busy. Please try again later.').setColor('Red')]
          });
          return;
        }

        fnbrManager.markBusy(account, true);
        const fnbrBot = account.client;
        const randomCode = Math.floor(100000 + Math.random() * 900000).toString();

        await statusMsg.edit({
          embeds: [new EmbedBuilder().setDescription(`Processing for \`${username}\` completed successfully <:T_tickbox:1372198945140506725>`).setColor('Green')]
        });

        await handleFriendRequest(dmChannel, interaction, fnbrBot, randomCode, username, data, client, VERIFY_ROLE_ID, account, fnbrManager);

      } catch (error) {
        console.error('Verification error:', error);
        await statusMsg.edit({
          embeds: [new EmbedBuilder().setDescription('❌ An error occurred during verification.').setColor('Red')]
        });
      }
    });

    collector.on('end', (_, reason) => {
      if (reason === 'time') {
        dmChannel.send({
          embeds: [
            new EmbedBuilder()
              .setDescription('<:Cross:1372199098467352687> Verification process timed out. Please try again later.')
              .setColor('Red')
              .setTimestamp()
          ]
        });
      }
    });

  } catch (error) {
    console.error('DM Verification error:', error);
  }
}

async function handleFriendRequest(dmChannel, interaction, fnbrBot, randomCode, username, data, client, VERIFY_ROLE_ID, account, fnbrManager) {
  await dmChannel.send({
    embeds: [
      new EmbedBuilder()
        .setDescription(`**1. Friend Request**
Send a Fortnite Friend request to the username below.
\`\`\`${fnbrBot.user.self.displayName}\`\`\`
**2. Verification Code**
After the bot accepted you, please look for the 6 digit code that is displayed below the Fortnite account name in your friend list.
**3. Enter Code**
Please send the 6 digit code below to complete the verification process.`)
        .setColor('#000000')
        .setTimestamp()
        .setFooter({ text: 'You have 5 minutes to complete this step.' })
    ]
  });

  const friendRequestHandler = async (friendRequest) => {
    try {
      await friendRequest.accept();
      await fnbrBot.setStatus(randomCode, 'online');
    } catch (err) {
      console.error('Friend request error:', err);
    }
  };

  fnbrBot.on('friend:request', friendRequestHandler);

  const codeCollector = dmChannel.createMessageCollector({
    filter: m => m.author.id === interaction.user.id && m.content.trim() === randomCode,
    time: 5 * 60_000
  });

  codeCollector.on('collect', async () => {
    await completeVerification(interaction, client, VERIFY_ROLE_ID, username, data, dmChannel, fnbrBot);
    fnbrManager.markBusy(account, false);
    fnbrBot.removeListener('friend:request', friendRequestHandler);
    codeCollector.stop();
  });

  codeCollector.on('end', (_, reason) => {
    if (reason === 'time') {
      fnbrManager.markBusy(account, false);
      fnbrBot.removeListener('friend:request', friendRequestHandler);
      dmChannel.send({
        embeds: [
          new EmbedBuilder()
            .setDescription('<:Cross:1372199098467352687> Verification process timed out. Please try again later.')
            .setColor('Red')
            .setTimestamp()
        ]
      });
    }
  });
}

async function completeVerification(interaction, client, VERIFY_ROLE_ID, username, data, dmChannel, fnbrBot) {
  try {
    const guild = await client.guilds.fetch(interaction.guildId);
    const member = await guild.members.fetch(interaction.user.id);

    if (member && VERIFY_ROLE_ID) {
      await member.roles.add(VERIFY_ROLE_ID);
    }

    const finalEmbed = new EmbedBuilder()
      .setTitle('<:T_tickbox:1372198945140506725> Verification Complete')
      .setDescription(`\`\`\`Name: ${username}\nID: ${interaction.user.id}\`\`\``)
      .setColor('Green');

    await dmChannel.send({ embeds: [finalEmbed] });

    // Save to JSON
    const jsonPath = './verifiedUsers.json';
    let users = [];
    try {
      users = JSON.parse(await readFile(jsonPath));
    } catch (e) {
      users = [];
    }

    const existingIndex = users.findIndex(u => u.discordId === interaction.user.id);
    const newData = {
      discordId: interaction.user.id,
      epicUsername: username,
      epicAccountId: data.account_id,
      verifiedAt: new Date().toISOString()
    };

    if (existingIndex !== -1) users[existingIndex] = newData;
    else users.push(newData);

    await writeFile(jsonPath, JSON.stringify(users, null, 2));

    // Unfriend the user
    try {
      const friend = new Friend(fnbrBot, { id: data.account_id });
      await friend.remove();
      console.log(`✅ Successfully unfriended ${username}`);
    } catch (error) {
      console.error(`❌ Failed to unfriend ${username}:`, error);
    }

  } catch (error) {
    console.error('Error in completeVerification:', error);
  }
}

module.exports = { handleVerificationProcess, handleDMVerification };
