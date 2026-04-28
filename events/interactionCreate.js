const logger = require('../utils/logger');
const { buildErrorEmbed } = require('../utils/embeds');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) {
      logger.warn(`Unknown command: ${interaction.commandName}`);
      return;
    }

    try {
      await command.execute(interaction);
      logger.info(`Command /${interaction.commandName} used by ${interaction.user.tag} in guild ${interaction.guildId}`);
    } catch (err) {
      logger.error(`Error executing command /${interaction.commandName}`, err);

      const errorPayload = {
        embeds: [buildErrorEmbed('An unexpected error occurred while processing your command.')],
        ephemeral: true,
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorPayload).catch(() => {});
      } else {
        await interaction.reply(errorPayload).catch(() => {});
      }
    }
  },
};
