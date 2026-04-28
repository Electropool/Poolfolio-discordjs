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
const { buildErrorEmbed } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-portfolio')
    .setDescription('Configure portfolio templates (setup1, setup2, setup3)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    try {
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
          .setPlaceholder('Select a template (setup1, setup2, setup3)')
          .addOptions([
            { label: 'Setup 1', value: 'setup1' },
            { label: 'Setup 2', value: 'setup2' },
            { label: 'Setup 3', value: 'setup3' },
          ])
      );

      const embed = new EmbedBuilder()
        .setTitle('📋 Portfolio Template Configuration')
        .setDescription('Select a template slot to configure your portfolio fields.')
        .setColor(0x5865F2);

      const response = await interaction.reply({
        embeds: [embed],
        components: [selectRow],
        ephemeral: true
      });

      const collector = response.createMessageComponentCollector({ 
        componentType: ComponentType.StringSelect, 
        time: 120_000 
      });

      collector.on('collect', async (i) => {
        if (i.customId === 'setup_template_select') {
          // ALWAYS deferUpdate first to stop loading state and allow follow-up interaction
          await i.deferUpdate();
          const setupName = i.values[0];
          const setup = await db.getOrCreateSetup(guildId, setupName);
          await startConfiguration(i, setup);
        }
      });

    } catch (err) {
      console.error('[CRITICAL] /setup-portfolio error:', err);
    }
  },
};

async function startConfiguration(interaction, setup) {
  const fields = [];

  const mainLoop = async (prevInteraction) => {
    const embed = new EmbedBuilder()
      .setTitle(`📝 Configuring: ${setup.name}`)
      .setDescription(`Fields defined: **${fields.length}/10**\n\nClick "Add Field" to continue or "Save" to finish.`)
      .setColor(0x5865F2);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('add_field_trigger')
        .setLabel('Add Field')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('save_setup_trigger')
        .setLabel('Save & Finish')
        .setStyle(ButtonStyle.Success)
        .setDisabled(fields.length === 0)
    );

    await prevInteraction.editReply({
      embeds: [embed],
      components: [row],
      content: null
    });

    const collector = (await prevInteraction.fetchReply()).createMessageComponentCollector({ 
      componentType: ComponentType.Button, 
      time: 60_000 
    });

    collector.on('collect', async (btnI) => {
      collector.stop();
      if (btnI.customId === 'add_field_trigger') {
        await handleFieldCreation(btnI, setup, fields, mainLoop);
      } else if (btnI.customId === 'save_setup_trigger') {
        await btnI.deferUpdate();
        await saveToDatabase(btnI, setup, fields);
      }
    });
  };

  await mainLoop(interaction);
}

async function handleFieldCreation(interaction, setup, fields, nextStep) {
  const modal = new ModalBuilder()
    .setCustomId('field_modal')
    .setTitle('Field Configuration - Step 1');

  const labelInput = new TextInputBuilder()
    .setCustomId('label_input')
    .setLabel('Enter Label (e.g. NAME)')
    .setStyle(TextInputStyle.Short)
    .setMaxLength(100)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(labelInput));
  await interaction.showModal(modal);

  const modalSubmit = await interaction.awaitModalSubmit({ time: 60_000 }).catch(() => null);
  if (!modalSubmit) return;

  await modalSubmit.deferUpdate();
  const label = modalSubmit.fields.getTextInputValue('label_input');

  // Step 2: Select Type
  const typeRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('type_select')
      .setPlaceholder('Select Field Type')
      .addOptions([
        { label: 'Text', value: 'text' },
        { label: 'Number', value: 'number' },
      ])
  );

  await modalSubmit.editReply({
    content: `Step 2: Select type for **${label}**`,
    components: [typeRow],
    embeds: []
  });

  const typeI = await modalSubmit.channel.awaitMessageComponent({ 
    filter: (m) => m.user.id === modalSubmit.user.id,
    time: 60_000 
  }).catch(() => null);

  if (!typeI) return;
  await typeI.deferUpdate();
  const type = typeI.values[0];

  // Step 3: Select Required
  const reqRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('req_select')
      .setPlaceholder('Is this field required?')
      .addOptions([
        { label: 'Required', value: '1' },
        { label: 'Optional', value: '0' },
      ])
  );

  await typeI.editReply({
    content: `Step 3: Is **${label}** required?`,
    components: [reqRow]
  });

  const reqI = await typeI.channel.awaitMessageComponent({ 
    filter: (m) => m.user.id === typeI.user.id,
    time: 60_000 
  }).catch(() => null);

  if (!reqI) return;
  await reqI.deferUpdate();
  const required = reqI.values[0] === '1';

  fields.push({ label, type, required });
  
  if (fields.length >= 10) {
    await saveToDatabase(reqI, setup, fields);
  } else {
    await nextStep(reqI);
  }
}

async function saveToDatabase(interaction, setup, fields) {
  try {
    await db.clearFieldsBySetupId(setup.id);
    for (const f of fields) {
      await db.addField(setup.id, f.label, f.type, f.required);
    }

    await interaction.editReply({
      content: `✅ Template **${setup.name}** has been saved with ${fields.length} fields.`,
      embeds: [],
      components: []
    });
  } catch (err) {
    console.error('[DB ERROR] Save failed:', err);
    await interaction.editReply({ content: '❌ Database error while saving setup.', components: [] });
  }
}
