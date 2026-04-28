require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const { initializeDatabase } = require('./database/db');
const logger = require('./utils/logger');

// Validate env
const requiredEnv = ['BOT_TOKEN', 'CLIENT_ID'];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    logger.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

// Init DB
(async () => {
  await initializeDatabase();
})();

// Create client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Message, Partials.Channel],
});

client.commands = new Collection();

// Load commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.data && command.execute) {
    client.commands.set(command.data.name, command);
    logger.info(`Loaded command: /${command.data.name}`);
  }
}

// Load events
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'));
for (const file of eventFiles) {
  const event = require(path.join(eventsPath, file));
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
  logger.info(`Loaded event: ${event.name}`);
}

// Handle unhandled rejections
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled promise rejection:', err);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', err);
});

// Login
client.login(process.env.BOT_TOKEN).then(() => {
  // Failsafe Scanner: Every 3 seconds
  setInterval(async () => {
    try {
      const guilds = client.guilds.cache;
      for (const [guildId, guild] of guilds) {
        const config = await db.getGuildConfig(guildId);
        if (!config || !config.portfolio_channel_id) continue;

        const channel = await guild.channels.fetch(config.portfolio_channel_id).catch(() => null);
        if (!channel) continue;

        const messages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
        if (!messages) continue;

        for (const [msgId, msg] of messages) {
          // Absolute Rule: Only THIS bot's messages allowed
          if (msg.author.id !== client.user.id) {
            await msg.delete().catch(() => {});
          }
        }
      }
    } catch (err) {
      // Quietly log scanner errors to avoid console spam
      // console.error('[SCANNER ERROR]', err.message);
    }
  }, 3000);
}).catch(err => {
  logger.error('Failed to login to Discord:', err);
  process.exit(1);
});
