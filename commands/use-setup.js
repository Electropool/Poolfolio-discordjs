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
    const guildId = interaction.guildId;
    const config = await db.getGuildConfig(guildId);
    
    if (!config || !config.portfolio_channel_id) {
      return interaction.reply({
        embeds: [buildErrorEmbed('Portfolio channel not set up. Use `/setup` first.')],
        ephemeral: true
      });
    }

    if (interaction.channelId !== config.portfolio_channel_id) {
      return interaction.reply({
        content: `This command can only be used in <#${config.portfolio_channel_id}>.`,
        ephemeral: true
      });
    }

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
        const setupKey = i.values[0];
        const fields = await db.getFields(guildId, setupKey);

        if (fields.length === 0) {
          return i.reply({
            content: `❌ Template **${setupKey}** is not configured. Use \`/setup-portfolio\` first.`,
            ephemeral: true
          });
        }

        await db.setActiveSetup(guildId, setupKey);
        await i.reply({
          content: `✅ Channel is now using template **${setupKey}**.`,
          ephemeral: true
        });
      }
    });
  },
};
