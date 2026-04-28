require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const requiredEnv = ['BOT_TOKEN', 'CLIENT_ID'];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`[ERROR] Missing environment variable: ${key}`);
    process.exit(1);
  }
}

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.data) {
    commands.push(command.data.toJSON());
    console.log(`[DEPLOY] Loaded: /${command.data.name}`);
  }
}

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

(async () => {
  try {
    console.log(`[DEPLOY] Registering ${commands.length} slash command(s)...`);

    if (process.env.GUILD_ID) {
      // Guild-specific (instant)
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands }
      );
      console.log(`[DEPLOY] ✅ Registered to guild: ${process.env.GUILD_ID}`);
    } else {
      // Global (up to 1 hour propagation)
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands }
      );
      console.log('[DEPLOY] ✅ Registered globally (may take up to 1 hour).');
    }
  } catch (err) {
    console.error('[DEPLOY] ❌ Failed to register commands:', err);
    process.exit(1);
  }
})();
