const db = require('../database/db');
const logger = require('../utils/logger');

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    // Ignore bot messages
    if (message.author.bot) return;
    if (!message.guild) return;

    const guildId = message.guild.id;
    const config = await db.getGuildConfig(guildId);

    if (!config || !config.portfolio_channel_id) return;
    if (message.channel.id !== config.portfolio_channel_id) return;

    // Inside portfolio channel:
    // Any message NOT from: bot, slash command interaction, whitelisted roles -> MUST be deleted instantly

    // Check whitelist roles
    const whitelistRoles = await db.getWhitelistRoles(guildId);
    const member = message.member;

    if (member) {
      const hasWhitelistedRole = member.roles.cache.some(role => whitelistRoles.includes(role.id));
      if (hasWhitelistedRole) return;
    }

    // Delete the message
    try {
      await message.delete();
      logger.info(`Deleted unauthorized message from ${message.author.tag} in portfolio channel (guild: ${guildId})`);

      // DM the user
      const dmChannel = await message.author.createDM().catch(() => null);
      if (dmChannel) {
        await dmChannel.send(
          `❌ **Message Deleted**\nYour message in <#${config.portfolio_channel_id}> was removed because that channel only allows portfolio submissions via \`/portfolio\` or from whitelisted roles.`
        ).catch(() => {});
      }
    } catch (err) {
      logger.error(`Failed to delete message in portfolio channel`, err);
    }
  },
};
