const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  PermissionFlagsBits,
  ComponentType,
  ChannelType,
} = require('discord.js');

const db = require('../database/db');
const { buildSetupEmbed, buildErrorEmbed, buildSuccessEmbed } = require('../utils/embeds');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure the poolfolio portfolio system')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({
        embeds: [buildErrorEmbed('You need the **Manage Server** permission to use this command.')],
        ephemeral: true,
      });
    }

    await showSetupPanel(interaction, true);
  },
};

async function showSetupPanel(interaction, isFirst = false) {
  const guildId = interaction.guildId;
  const config = db.getGuildConfig(guildId);
  const fields = db.getFields(guildId);
  const roles = db.getWhitelistRoles(guildId);

  const embed = buildSetupEmbed(config, fields, roles);

  const mainRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('setup_channel')
      .setLabel('📌 Set Channel')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('setup_add_field')
      .setLabel('➕ Add Field')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('setup_remove_field')
      .setLabel('🗑️ Remove Field')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(fields.length === 0),
    new ButtonBuilder()
      .setCustomId('setup_roles')
      .setLabel('🔒 Whitelist Roles')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('setup_clear_fields')
      .setLabel('🔄 Clear All Fields')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(fields.length === 0)
  );

  const payload = { embeds: [embed], components: [mainRow], ephemeral: true };

  if (isFirst) {
    await interaction.reply(payload);
  } else {
    await interaction.editReply(payload);
  }

  const msg = await interaction.fetchReply();
  const collector = msg.createMessageComponentCollector({
    time: 300_000,
    filter: (i) => i.user.id === interaction.user.id,
  });

  collector.on('collect', async (btnInteraction) => {
    collector.stop();

    switch (btnInteraction.customId) {
      case 'setup_channel':
        await handleSetChannel(btnInteraction, interaction);
        break;
      case 'setup_add_field':
        await handleAddField(btnInteraction, interaction);
        break;
      case 'setup_remove_field':
        await handleRemoveField(btnInteraction, interaction);
        break;
      case 'setup_roles':
        await handleRoles(btnInteraction, interaction);
        break;
      case 'setup_clear_fields':
        await handleClearFields(btnInteraction, interaction);
        break;
    }
  });
}

async function handleSetChannel(btnInteraction, rootInteraction) {
  const row = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId('setup_channel_select')
      .setPlaceholder('Select the portfolio channel')
      .addChannelTypes(ChannelType.GuildText)
  );

  await btnInteraction.update({
    content: '**Select the channel to use as the portfolio channel:**',
    embeds: [],
    components: [row],
  });

  const msg = await btnInteraction.fetchReply();
  const selectCollector = msg.createMessageComponentCollector({
    componentType: ComponentType.ChannelSelect,
    time: 60_000,
    filter: (i) => i.user.id === rootInteraction.user.id,
  });

  selectCollector.on('collect', async (selectInteraction) => {
    selectCollector.stop();
    const channelId = selectInteraction.values[0];
    db.setGuildConfig(selectInteraction.guildId, channelId);

    // Try to post instruction message in channel
    try {
      const channel = await selectInteraction.client.channels.fetch(channelId);
      const { buildInstructionEmbed } = require('../utils/embeds');
      const config = db.getGuildConfig(selectInteraction.guildId);

      if (config.instruction_message_id) {
        const old = await channel.messages.fetch(config.instruction_message_id).catch(() => null);
        if (old) await old.delete().catch(() => {});
      }

      const instrMsg = await channel.send({ embeds: [buildInstructionEmbed()] });
      db.setInstructionMessageId(selectInteraction.guildId, instrMsg.id);
    } catch (e) {
      logger.warn('Could not post instruction message: ' + e.message);
    }

    await selectInteraction.update({
      content: `✅ Portfolio channel set to <#${channelId}>`,
      components: [],
    });
    setTimeout(() => showSetupPanel(rootInteraction), 1500);
  });

  selectCollector.on('end', async (_, reason) => {
    if (reason === 'time') {
      await showSetupPanel(rootInteraction);
    }
  });
}

async function handleAddField(btnInteraction, rootInteraction) {
  const modal = new ModalBuilder()
    .setCustomId('setup_add_field_modal')
    .setTitle('Add Portfolio Field');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('field_label')
        .setLabel('Field Label (e.g. Name, Age, Country)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(50)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('field_type')
        .setLabel('Field Type: "text" or "number"')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('text')
        .setMaxLength(10)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('field_required')
        .setLabel('Required? "yes" or "no"')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('yes')
        .setMaxLength(3)
    )
  );

  await btnInteraction.showModal(modal);

  const modalSubmit = await btnInteraction
    .awaitModalSubmit({ time: 120_000, filter: (m) => m.user.id === rootInteraction.user.id })
    .catch(() => null);

  if (!modalSubmit) return showSetupPanel(rootInteraction);

  const label = modalSubmit.fields.getTextInputValue('field_label').trim();
  const rawType = modalSubmit.fields.getTextInputValue('field_type').trim().toLowerCase();
  const rawRequired = modalSubmit.fields.getTextInputValue('field_required').trim().toLowerCase();

  const fieldType = ['text', 'number'].includes(rawType) ? rawType : 'text';
  const required = rawRequired === 'yes' || rawRequired === 'y' || rawRequired === 'true';
  const fieldKey = label.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 50);

  const existingFields = db.getFields(rootInteraction.guildId);
  const order = existingFields.length > 0 ? Math.max(...existingFields.map(f => f.field_order)) + 1 : 0;

  db.addField(rootInteraction.guildId, label, fieldKey, required, fieldType, order);

  await modalSubmit.update({
    content: `✅ Field **${label}** added (type: \`${fieldType}\`, ${required ? 'required' : 'optional'})`,
    embeds: [],
    components: [],
  });

  setTimeout(() => showSetupPanel(rootInteraction), 1500);
  logger.info(`Field "${label}" added for guild ${rootInteraction.guildId}`);
}

async function handleRemoveField(btnInteraction, rootInteraction) {
  const fields = db.getFields(rootInteraction.guildId);
  if (fields.length === 0) {
    await btnInteraction.update({ content: 'No fields to remove.', embeds: [], components: [] });
    return setTimeout(() => showSetupPanel(rootInteraction), 1500);
  }

  const options = fields.slice(0, 25).map(f => ({
    label: f.label,
    value: f.field_key,
    description: `Type: ${f.field_type} | ${f.required ? 'Required' : 'Optional'}`,
  }));

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('setup_remove_field_select')
      .setPlaceholder('Select a field to remove')
      .addOptions(options)
  );

  await btnInteraction.update({
    content: '**Select the field you want to remove:**',
    embeds: [],
    components: [row],
  });

  const msg = await btnInteraction.fetchReply();
  const selectCollector = msg.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    time: 60_000,
    filter: (i) => i.user.id === rootInteraction.user.id,
  });

  selectCollector.on('collect', async (selectInteraction) => {
    selectCollector.stop();
    const fieldKey = selectInteraction.values[0];
    const field = fields.find(f => f.field_key === fieldKey);
    db.removeField(rootInteraction.guildId, fieldKey);

    await selectInteraction.update({
      content: `🗑️ Field **${field?.label || fieldKey}** removed.`,
      components: [],
    });
    setTimeout(() => showSetupPanel(rootInteraction), 1500);
  });
}

async function handleRoles(btnInteraction, rootInteraction) {
  const row = new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId('setup_role_select')
      .setPlaceholder('Select roles to whitelist')
      .setMinValues(1)
      .setMaxValues(10)
  );

  const clearRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('setup_clear_roles')
      .setLabel('🗑️ Clear All Whitelisted Roles')
      .setStyle(ButtonStyle.Danger)
  );

  await btnInteraction.update({
    content: '**Select roles to whitelist** (they can post in the portfolio channel without deletion):\n\nOr clear all existing whitelisted roles.',
    embeds: [],
    components: [row, clearRow],
  });

  const msg = await btnInteraction.fetchReply();
  const collector = msg.createMessageComponentCollector({
    time: 60_000,
    filter: (i) => i.user.id === rootInteraction.user.id,
  });

  collector.on('collect', async (i) => {
    collector.stop();

    if (i.customId === 'setup_clear_roles') {
      db.clearWhitelistRoles(rootInteraction.guildId);
      await i.update({ content: '🗑️ All whitelisted roles cleared.', components: [] });
      return setTimeout(() => showSetupPanel(rootInteraction), 1500);
    }

    if (i.customId === 'setup_role_select') {
      const guildId = rootInteraction.guildId;
      db.clearWhitelistRoles(guildId);
      for (const roleId of i.values) {
        db.addWhitelistRole(guildId, roleId);
      }
      await i.update({
        content: `✅ Whitelisted roles updated: ${i.values.map(r => `<@&${r}>`).join(', ')}`,
        components: [],
      });
      setTimeout(() => showSetupPanel(rootInteraction), 1500);
    }
  });
}

async function handleClearFields(btnInteraction, rootInteraction) {
  db.clearFields(rootInteraction.guildId);
  await btnInteraction.update({
    content: '🔄 All portfolio fields cleared.',
    embeds: [],
    components: [],
  });
  setTimeout(() => showSetupPanel(rootInteraction), 1500);
}
