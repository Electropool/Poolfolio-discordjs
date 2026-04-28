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

      // RULE: ANY message not from this bot -> delete
      // Even if from another bot -> delete
      if (message.author.id === message.client.user.id) return;

      // Allow whitelisted roles
      const whitelistRoles = await db.getWhitelistRoles(guildId);
      const member = message.member;
      if (member) {
        const hasWhitelistedRole = member.roles.cache.some(role => whitelistRoles.includes(role.id));
        if (hasWhitelistedRole) return;
      }

      // If it's a slash command interaction from this bot, Discord handles it differently, 
      // but usually the interaction response is from the bot. 
      // If a user tries to type something manually, delete it.

      await message.delete().catch(err => console.error('[MESSAGE DELETE ERROR]', err));
      
      // Notify user (ignore other bots)
      if (!message.author.bot) {
        const dmChannel = await message.author.createDM().catch(() => null);
        if (dmChannel) {
          await dmChannel.send(
            `❌ **Message Deleted**\nYour message in <#${config.portfolio_channel_id}> was removed. Only portfolio submissions via \`/portfolio\` are allowed.`
          ).catch(() => {});
        }
      }
    } catch (err) {
      console.error('[EVENT ERROR] messageCreate:', err);
    }
  },
};
