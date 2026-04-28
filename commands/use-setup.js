const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  PermissionFlagsBits,
  ComponentType
} = require('discord.js');
const db = require('../database/db');
const { buildErrorEmbed } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('use-setup')
    .setDescription('Assign a template to the portfolio channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    try {
      const guildId = interaction.guildId;
      const config = await db.getGuildConfig(guildId);
      
      if (!config || !config.portfolio_channel_id) {
        return interaction.reply({
          embeds: [buildErrorEmbed('Portfolio channel not set up. Use `/setup` first.')],
          ephemeral: true
        });
      }

      // Check permissions
      const adminRoles = await db.getAdminRoles(guildId);
      const isAuthorized = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) || 
                           interaction.member.roles.cache.some(role => adminRoles.includes(role.id));

      if (!isAuthorized) {
        return interaction.reply({
          embeds: [buildErrorEmbed('You do not have permission to use this command.')],
          ephemeral: true,
        });
      }

      const selectRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('use_setup_select')
          .setPlaceholder('Select a template to activate')
          .addOptions([
            { label: 'Setup 1', value: 'setup1' },
            { label: 'Setup 2', value: 'setup2' },
            { label: 'Setup 3', value: 'setup3' },
          ])
      );

      const response = await interaction.reply({
        content: 'Select a template to assign to this channel:',
        components: [selectRow],
        ephemeral: true
      });

      const collector = response.createMessageComponentCollector({ 
        componentType: ComponentType.StringSelect, 
        time: 60_000 
      });

      collector.on('collect', async (i) => {
        if (i.customId === 'use_setup_select') {
          await i.deferUpdate();
          const setupName = i.values[0];
          const setup = await db.getSetup(guildId, setupName);

          if (!setup) {
            return i.followUp({
              content: `❌ Template **${setupName}** is not configured. Please use \`/setup-portfolio\` first.`,
              ephemeral: true
            });
          }

          const fields = await db.getFields(setup.id);
          if (fields.length === 0) {
            return i.followUp({
              content: `❌ Template **${setupName}** is empty. Please use \`/setup-portfolio\` first.`,
              ephemeral: true
            });
          }

          await db.setActiveSetup(guildId, config.portfolio_channel_id, setup.id);
          await i.followUp({
            content: `✅ Channel is now using template **${setupName}**.`,
            ephemeral: true
          });
        }
      });

    } catch (err) {
      console.error('[INTERACTION ERROR] /use-setup:', err);
    }
  },
};
