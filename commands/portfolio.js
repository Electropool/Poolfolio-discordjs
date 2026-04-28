const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ComponentType,
} = require('discord.js');

const db = require('../database/db');
const { buildPortfolioEmbed, buildErrorEmbed, buildInstructionEmbed } = require('../utils/embeds');
const { validateFieldValue, sanitizeValue } = require('../utils/validation');
const logger = require('../utils/logger');

const FIELDS_PER_MODAL = 5;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('portfolio')
    .setDescription('Create or update your portfolio profile'),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const config = await db.getGuildConfig(guildId);

    if (!config || !config.portfolio_channel_id) {
      return interaction.reply({
        embeds: [buildErrorEmbed('The portfolio system has not been set up yet. An admin must run `/setup` first.')],
        ephemeral: true,
      });
    }

    const fields = await db.getFields(guildId);
    if (fields.length === 0) {
      return interaction.reply({
        embeds: [buildErrorEmbed('No portfolio fields have been configured. An admin must add fields via `/setup`.')],
        ephemeral: true,
      });
    }

    // Collect data across modal pages
    const collectedData = {};
    const chunks = [];
    for (let i = 0; i < fields.length; i += FIELDS_PER_MODAL) {
      chunks.push(fields.slice(i, i + FIELDS_PER_MODAL));
    }

    // Show start button
    const startRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('portfolio_start')
        .setLabel('📝 Start Portfolio')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('portfolio_cancel')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      content: '### 📋 poolfolio — Portfolio Setup\nClick **Start Portfolio** to begin filling in your profile.',
      components: [startRow],
      ephemeral: true,
    });

    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 300_000,
    });

    let currentChunk = 0;

    collector.on('collect', async (btnInteraction) => {
      if (btnInteraction.user.id !== interaction.user.id) {
        return btnInteraction.reply({ content: 'This is not your portfolio form.', ephemeral: true });
      }

      if (btnInteraction.customId === 'portfolio_cancel') {
        collector.stop('cancelled');
        return btnInteraction.update({
          content: '❌ Portfolio creation cancelled.',
          components: [],
        });
      }

      if (btnInteraction.customId === 'portfolio_start' || btnInteraction.customId.startsWith('portfolio_next_')) {
        const chunk = chunks[currentChunk];
        const modal = buildModal(chunk, currentChunk, chunks.length);

        await btnInteraction.showModal(modal);

        const modalSubmit = await btnInteraction
          .awaitModalSubmit({ time: 300_000, filter: (m) => m.user.id === interaction.user.id })
          .catch(() => null);

        if (!modalSubmit) {
          collector.stop('timeout');
          return;
        }

        // Validate modal inputs
        let validationError = null;
        for (const field of chunk) {
          const rawValue = modalSubmit.fields.getTextInputValue(field.field_key) || '';
          if (field.required && rawValue.trim() === '') {
            validationError = `**${field.label}** is required and cannot be empty.`;
            break;
          }
          if (rawValue.trim() !== '') {
            const result = validateFieldValue(rawValue, field.field_type, field.label);
            if (!result.valid) {
              validationError = result.error;
              break;
            }
            collectedData[field.field_key] = sanitizeValue(rawValue, field.field_type);
          }
        }

        if (validationError) {
          await modalSubmit.reply({
            embeds: [buildErrorEmbed(validationError)],
            ephemeral: true,
          });
          return;
        }

        currentChunk++;

        if (currentChunk < chunks.length) {
          const nextRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`portfolio_next_${currentChunk}`)
              .setLabel(`➡️ Continue (${currentChunk + 1}/${chunks.length})`)
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId('portfolio_cancel')
              .setLabel('Cancel')
              .setStyle(ButtonStyle.Secondary)
          );

          await modalSubmit.update({
            content: `✅ Page ${currentChunk}/${chunks.length} complete! Click **Continue** for the next section.`,
            components: [nextRow],
          });
        } else {
          // All pages done — finalize
          collector.stop('complete');
          await modalSubmit.deferUpdate();
          await finalizePortfolio(interaction, guildId, config, fields, collectedData);
        }
      }
    });

    collector.on('end', async (_, reason) => {
      if (reason === 'time') {
        await interaction.editReply({
          content: '⏰ Portfolio creation timed out. Please run `/portfolio` again.',
          components: [],
        }).catch(() => {});
      }
    });
  },
};

function buildModal(fields, chunkIndex, totalChunks) {
  const modal = new ModalBuilder()
    .setCustomId(`portfolio_modal_${chunkIndex}`)
    .setTitle(`Portfolio — Page ${chunkIndex + 1}/${totalChunks}`);

  for (const field of fields) {
    const input = new TextInputBuilder()
      .setCustomId(field.field_key)
      .setLabel(field.label + (field.required ? ' *' : ' (optional)'))
      .setStyle(TextInputStyle.Short)
      .setRequired(field.required === 1)
      .setMaxLength(500);

    if (field.field_type === 'number') {
      input.setPlaceholder('Enter a number...');
    } else {
      input.setPlaceholder(`Enter your ${field.label.toLowerCase()}...`);
    }

    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }

  return modal;
}

async function finalizePortfolio(interaction, guildId, config, fields, data) {
  try {
    const channel = await interaction.client.channels.fetch(config.portfolio_channel_id).catch(() => null);
    if (!channel) {
      return interaction.editReply({
        content: '❌ Portfolio channel not found. Please ask an admin to reconfigure.',
        components: [],
      });
    }

    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => interaction.user);
    const embed = buildPortfolioEmbed(member, fields, data);

    // Delete old instruction message
    if (config.instruction_message_id) {
      const oldMsg = await channel.messages.fetch(config.instruction_message_id).catch(() => null);
      if (oldMsg) await oldMsg.delete().catch(() => {});
    }

    // Delete old portfolio message if exists
    const existing = await db.getPortfolio(guildId, interaction.user.id);
    if (existing?.message_id) {
      const oldPortfolio = await channel.messages.fetch(existing.message_id).catch(() => null);
      if (oldPortfolio) await oldPortfolio.delete().catch(() => {});
    }

    // Send new portfolio
    const portfolioMsg = await channel.send({
      content: `<@${interaction.user.id}>`,
      embeds: [embed],
    });

    await db.savePortfolio(guildId, interaction.user.id, portfolioMsg.id, data);

    // Send instruction message at bottom
    const instrMsg = await channel.send({ embeds: [buildInstructionEmbed()] });
    await db.setInstructionMessageId(guildId, instrMsg.id);

    await interaction.editReply({
      content: '✅ Your portfolio has been published!',
      components: [],
    });

    logger.success(`Portfolio submitted by ${interaction.user.tag} in guild ${guildId}`);
  } catch (err) {
    logger.error('Error finalizing portfolio', err);
    await interaction.editReply({
      content: '❌ An error occurred while publishing your portfolio. Please try again.',
      components: [],
    }).catch(() => {});
  }
}
