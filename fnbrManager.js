const { Client: FNBRClient } = require('fnbr');
const { readFile } = require('fs').promises;
const path = require('path');

class FNBRManager {
  constructor() {
    this.accounts = [];
    this.deviceAuthPath = path.join(__dirname, 'deviceAuth.json');
    this.currentIndex = 0;
  }

  async removeAllFriends(client) {
    try {
      console.log(`Attempting to remove friends from ${client.user.self.displayName}`);
      
      const friendManager = client.friend;
      
      if (friendManager && friendManager.list) {
        for (const [id, friend] of friendManager.list) {
          try {
            await friendManager.remove(id);
            console.log(`Removed friend: ${friend.displayName} from ${client.user.self.displayName}`);
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (error) {
            console.error(`Failed to remove friend ${id}:`, error);
          }
        }
      }

      if (friendManager && friendManager.pendingList) {
        for (const [id] of friendManager.pendingList) {
          try {
            await friendManager.remove(id);
            console.log(`Removed pending friend with ID ${id}`);
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (error) {
            console.error(`Failed to remove pending friend ${id}:`, error);
          }
        }
      }

      console.log(`Finished removing friends from ${client.user.self.displayName}`);
    } catch (error) {
      console.error('Error removing friends:', error);
    }
  }

  async loadAccounts() {
    try {
      const deviceAuthData = await readFile(this.deviceAuthPath, 'utf8');
      const accountCredentials = JSON.parse(deviceAuthData);

      if (!Array.isArray(accountCredentials)) {
        throw new Error('Device auth file should contain an array of credentials');
      }

      for (const credentials of accountCredentials) {
        try {
          const client = new FNBRClient({
            auth: { deviceAuth: credentials },
            defaultStatus: 'Playing Fortnite',
            createParty: true,
            keepAliveInterval: 30,
            defaultOutfit: 'CID_016_Athena_Commando_F'
          });

          client.on('ready', async () => {
            console.log(`✅ Fortnite client ready: ${client.user.self.displayName}`);
            await this.removeAllFriends(client);
          });

          client.on('error', (error) => {
            console.error(`❌ Fortnite client error for account ${credentials.accountId}:`, error);
          });

          await client.login();

          this.accounts.push({
            client,
            isBusy: false,
            accountId: credentials.accountId,
            displayName: client.user.self.displayName
          });

          console.log(`✅ Successfully loaded account ${credentials.accountId} (${client.user.self.displayName})`);
        } catch (error) {
          console.error(`❌ Failed to load account ${credentials.accountId}:`, error);
        }
      }

      if (this.accounts.length === 0) {
        throw new Error('No accounts were successfully loaded');
      }

      console.log(`✅ Successfully loaded ${this.accounts.length} FNBR accounts`);
    } catch (error) {
      console.error('❌ Failed to load FNBR accounts:', error);
      throw error;
    }
  }

  markBusy(account, busy) {
    if (account) {
      account.isBusy = busy;
      console.log(`Account ${account.accountId} (${account.displayName}) marked as ${busy ? 'busy' : 'available'}`);
    }
  }

  getAvailableAccount() {
    const availableAccount = this.accounts.find(account => !account.isBusy);
    if (availableAccount) {
      console.log(`Found available account: ${availableAccount.accountId} (${availableAccount.displayName})`);
      return availableAccount;
    }
    console.log('No available accounts found');
    return null;
  }
}

const manager = new FNBRManager();

async function getFortniteClient() {
  if (manager.accounts.length === 0) {
    await manager.loadAccounts();
  }

  const account = manager.getAvailableAccount();
  if (!account) {
    throw new Error('No available Fortnite accounts');
  }

  manager.markBusy(account, true);

  return {
    client: account.client,
    account: account,
    accountData: {
      accountId: account.accountId,
      displayName: account.displayName
    }
  };
}

module.exports = {
  manager,
  getFortniteClient
};
