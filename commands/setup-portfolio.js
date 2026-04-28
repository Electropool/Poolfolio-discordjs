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
          .setPlaceholder('Select a template to configure')
          .addOptions([
            { label: 'Setup 1', value: 'setup1' },
            { label: 'Setup 2', value: 'setup2' },
            { label: 'Setup 3', value: 'setup3' },
          ])
      );

      const embed = new EmbedBuilder()
        .setTitle('📋 Portfolio Template Configuration')
        .setDescription('Select one of the 3 templates to begin.')
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
          // Fix: Immediately defer to prevent freeze
          await i.deferUpdate();
          const setupName = i.values[0];
          const setup = await db.getOrCreateSetup(guildId, setupName);
          await startFieldLoop(i, setup);
        }
      });

    } catch (err) {
      console.error('[INTERACTION ERROR] /setup-portfolio:', err);
    }
  },
};

async function startFieldLoop(interaction, setup, fields = []) {
  const askLabel = async (prevInteraction) => {
    // Since we are in a loop, we need to show a button that triggers the modal
    // Because modals can't be shown directly after another modal or a select that wasn't an immediate response
    // Wait, actually, if we just deferUpdate above, we can show a modal from the next button click.

    const embed = new EmbedBuilder()
      .setTitle(`📝 Configuring ${setup.name}`)
      .setDescription(`Fields added: **${fields.length}/10**\n\nClick the button below to add a field.`)
      .setColor(0x5865F2);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('add_field_btn')
        .setLabel('Add Field')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('save_template_btn')
        .setLabel('Save & Finish')
        .setStyle(ButtonStyle.Success)
        .setDisabled(fields.length === 0)
    );

    const msg = await prevInteraction.editReply({
      embeds: [embed],
      components: [row]
    });

    const collector = msg.createMessageComponentCollector({ time: 60_000 });

    collector.on('collect', async (i) => {
      collector.stop();
      if (i.customId === 'add_field_btn') {
        const modal = new ModalBuilder()
          .setCustomId('field_label_modal')
          .setTitle('New Field Label');
        
        const labelInput = new TextInputBuilder()
          .setCustomId('field_label_input')
          .setLabel('Enter the field label (e.g. NAME)')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(labelInput));
        await i.showModal(modal);

        const submitted = await i.awaitModalSubmit({ time: 60_000 }).catch(() => null);
        if (submitted) {
          await submitted.deferUpdate(); // Prevent freeze
          const label = submitted.fields.getTextInputValue('field_label_input');
          await askType(submitted, setup, fields, label);
        }
      } else if (i.customId === 'save_template_btn') {
        await i.deferUpdate();
        await saveTemplate(i, setup, fields);
      }
    });
  };

  const askType = async (prevInteraction, setup, fields, label) => {
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('field_type_select')
        .setPlaceholder(`Select type for "${label}"`)
        .addOptions([
          { label: 'Text', value: 'text' },
          { label: 'Number', value: 'number' },
        ])
    );

    await prevInteraction.editReply({
      content: `Step 2: Select type for **${label}**`,
      components: [row],
      embeds: []
    });

    const i = await prevInteraction.channel.awaitMessageComponent({ 
      filter: (m) => m.user.id === prevInteraction.user.id,
      time: 60_000 
    }).catch(() => null);

    if (i) {
      await i.deferUpdate();
      const type = i.values[0];
      await askRequired(i, setup, fields, label, type);
    }
  };

  const askRequired = async (prevInteraction, setup, fields, label, type) => {
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('field_req_select')
        .setPlaceholder(`Is "${label}" required?`)
        .addOptions([
          { label: 'Required', value: 'yes' },
          { label: 'Optional', value: 'no' },
        ])
    );

    await prevInteraction.editReply({
      content: `Step 3: Is **${label}** required?`,
      components: [row]
    });

    const i = await prevInteraction.channel.awaitMessageComponent({ 
      filter: (m) => m.user.id === prevInteraction.user.id,
      time: 60_000 
    }).catch(() => null);

    if (i) {
      await i.deferUpdate();
      const required = i.values[0] === 'yes';
      fields.push({ label, type, required });
      
      if (fields.length >= 10) {
        await saveTemplate(i, setup, fields);
      } else {
        await askLabel(i);
      }
    }
  };

  await askLabel(interaction);
}

async function saveTemplate(interaction, setup, fields) {
  try {
    await db.clearFields(setup.id);
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      await db.addField(setup.id, f.label, f.type, f.required, i);
    }

    await interaction.editReply({
      content: `✅ Template **${setup.name}** saved successfully with ${fields.length} fields.`,
      embeds: [],
      components: []
    });
  } catch (err) {
    console.error('[DB ERROR] Failed to save template:', err);
    await interaction.editReply({ content: '❌ Database error. Failed to save template.', components: [] });
  }
}
