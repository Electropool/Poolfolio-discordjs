const db = require('../database/db');

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    try {
      if (!message.guild) return;

      const guildId = message.guild.id;
      const config = await db.getGuildConfig(guildId);

      if (!config || !config.portfolio_channel_id) return;
      if (message.channel.id !== config.portfolio_channel_id) return;

      // RULE: Allow ONLY messages from THIS bot
      // Block users, other bots, and even whitelisted users (except for slash command usage)
      if (message.author.id === message.client.user.id) return;

      // Delete everything else instantly
      await message.delete().catch(() => {});
      
      // Notify unauthorized users (ignore other bots)
      if (!message.author.bot) {
        const dmChannel = await message.author.createDM().catch(() => null);
        if (dmChannel) {
          await dmChannel.send(
            `❌ **Strict Enforcement Active**\nOnly the bot is allowed to send messages in <#${config.portfolio_channel_id}>. Please use the \`/portfolio\` command to submit your profile.`
          ).catch(() => {});
        }
      }
    } catch (err) {
      // Quiet error handling for high-frequency events
    }
  },
};
