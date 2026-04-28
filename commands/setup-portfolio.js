const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  ComponentType,
  EmbedBuilder
} = require('discord.js');
const db = require('../database/db');
const { buildErrorEmbed, buildSuccessEmbed } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-portfolio')
    .setDescription('Configure portfolio templates (setup1, setup2, setup3)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const guildId = interaction.guildId;
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
        .setCustomId('setup_template_select')
        .setPlaceholder('Select a template to configure')
        .addOptions([
          { label: 'Setup 1', value: 'setup1' },
          { label: 'Setup 2', value: 'setup2' },
          { label: 'Setup 3', value: 'setup3' },
        ])
    );

    const embed = new EmbedBuilder()
      .setTitle('📋 Portfolio Template Configuration')
      .setDescription('Select one of the 3 templates to configure its fields.')
      .setColor(0x5865F2);

    const response = await interaction.reply({
      embeds: [embed],
      components: [selectRow],
      ephemeral: true
    });

    const collector = response.createMessageComponentCollector({ 
      componentType: ComponentType.StringSelect, 
      time: 60_000 
    });

    collector.on('collect', async (i) => {
      if (i.customId === 'setup_template_select') {
        const setupKey = i.values[0];
        await i.deferUpdate();
        await configureTemplateFields(interaction, setupKey);
      }
    });
  },
};

async function configureTemplateFields(interaction, setupKey) {
  const fields = [];
  const guildId = interaction.guildId;

  const askField = async (stepInteraction, fieldIndex) => {
    const modal = new ModalBuilder()
      .setCustomId(`field_modal_${fieldIndex}`)
      .setTitle(`Template ${setupKey} - Field ${fieldIndex + 1}`);

    const labelInput = new TextInputBuilder()
      .setCustomId('field_label')
      .setLabel('Field Label (e.g. NAME, AGE)')
      .setStyle(TextInputStyle.Short)
      .setMaxLength(100)
      .setRequired(true);

    const typeInput = new TextInputBuilder()
      .setCustomId('field_type')
      .setLabel('Field Type (text / number)')
      .setPlaceholder('text')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const requiredInput = new TextInputBuilder()
      .setCustomId('field_required')
      .setLabel('Required? (yes / no)')
      .setPlaceholder('yes')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(labelInput),
      new ActionRowBuilder().addComponents(typeInput),
      new ActionRowBuilder().addComponents(requiredInput)
    );

    await stepInteraction.showModal(modal);

    const submitted = await stepInteraction.awaitModalSubmit({ 
      time: 60_000, 
      filter: (m) => m.user.id === interaction.user.id 
    }).catch(() => null);

    if (!submitted) return;

    const label = submitted.fields.getTextInputValue('field_label').trim();
    const type = submitted.fields.getTextInputValue('field_type').trim().toLowerCase() === 'number' ? 'number' : 'text';
    const required = submitted.fields.getTextInputValue('field_required').trim().toLowerCase() === 'yes';

    fields.push({ label, type, required });

    if (fields.length >= 10) {
      await saveTemplate(submitted, setupKey, fields);
      return;
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('field_continue')
        .setLabel('Add Another Field')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('field_save')
        .setLabel('Save Template')
        .setStyle(ButtonStyle.Success)
    );

    const embed = new EmbedBuilder()
      .setTitle(`📋 Template ${setupKey} - ${fields.length} Fields`)
      .setDescription(fields.map((f, idx) => `${idx + 1}. **${f.label}** (${f.type}, ${f.required ? 'Req' : 'Opt'})`).join('\n'))
      .setColor(0x5865F2);

    const nextResponse = await submitted.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true
    });

    const nextCollector = nextResponse.createMessageComponentCollector({ 
      componentType: ComponentType.Button, 
      time: 60_000 
    });

    nextCollector.on('collect', async (btnI) => {
      nextCollector.stop();
      if (btnI.customId === 'field_continue') {
        await askField(btnI, fields.length);
      } else {
        await btnI.deferUpdate();
        await saveTemplate(btnI, setupKey, fields);
      }
    });
  };

  await askField(interaction, 0);
}

async function saveTemplate(interaction, setupKey, fields) {
  const guildId = interaction.guildId;
  await db.clearFields(guildId, setupKey);

  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    const fieldKey = f.label.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 50);
    await db.addField(guildId, setupKey, f.label, fieldKey, f.required, f.type, i);
  }

  await interaction.editReply({
    content: `✅ Template **${setupKey}** saved with ${fields.length} fields.`,
    embeds: [],
    components: []
  });
}
