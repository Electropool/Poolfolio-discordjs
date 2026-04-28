const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ComponentType,
  EmbedBuilder
} = require('discord.js');
const db = require('../database/db');
const { buildErrorEmbed, buildInstructionEmbed } = require('../utils/embeds');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('portfolio')
    .setDescription('Create or update your portfolio using the active template'),

  async execute(interaction) {
    try {
      const guildId = interaction.guildId;
      const config = await db.getGuildConfig(guildId);

      if (!config || !config.portfolio_channel_id) {
        return interaction.reply({
          embeds: [buildErrorEmbed('Portfolio channel not set up. Use `/setup` first.')],
          ephemeral: true,
        });
      }

      const activeSetup = await db.getSetupByChannelId(config.portfolio_channel_id);

      if (!activeSetup) {
        return interaction.reply({
          embeds: [buildErrorEmbed('No template is assigned to this channel. Use `/use-setup` first.')],
          ephemeral: true,
        });
      }

      const whitelistRoles = await db.getWhitelistRoles(guildId);
      const isWhitelisted = interaction.member.roles.cache.some(r => whitelistRoles.includes(r.id)) || 
                            interaction.member.permissions.has('ManageGuild');

      if (!isWhitelisted) {
        return interaction.reply({
          embeds: [buildErrorEmbed('Only whitelisted roles can submit portfolios.')],
          ephemeral: true
        });
      }

      const fields = await db.getFieldsBySetupId(activeSetup.id);
      if (fields.length === 0) {
        return interaction.reply({
          embeds: [buildErrorEmbed('The active template has no fields. Ask an admin to re-configure it.')],
          ephemeral: true,
        });
      }

      const collectedData = {};
      await runPortfolioFlow(interaction, fields, collectedData, 0);

    } catch (err) {
      console.error('[CRITICAL] /portfolio error:', err);
    }
  },
};

async function runPortfolioFlow(interaction, allFields, collectedData, startIndex) {
  const chunk = allFields.slice(startIndex, startIndex + 5);
  const isFirst = startIndex === 0;
  const isLast = startIndex + 5 >= allFields.length;

  const modal = new ModalBuilder()
    .setCustomId(`portfolio_modal_${startIndex}`)
    .setTitle(`Portfolio Setup (${startIndex + 1}-${Math.min(startIndex + 5, allFields.length)}/${allFields.length})`);

  for (const field of chunk) {
    const input = new TextInputBuilder()
      .setCustomId(`field_${field.id}`)
      .setLabel(field.label)
      .setPlaceholder(field.type === 'number' ? 'Numbers only' : 'Text only')
      .setStyle(TextInputStyle.Short)
      .setRequired(field.required === 1)
      .setMaxLength(field.type === 'number' ? 20 : 500);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }

  if (isFirst) {
    await interaction.showModal(modal);
  } else {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`next_part_${startIndex}`)
        .setLabel('Continue to Next Part')
        .setStyle(ButtonStyle.Primary)
    );
    const msg = await interaction.followUp({
      content: 'Ready for the next part?',
      components: [row],
      ephemeral: true
    });
    
    const btnI = await msg.awaitMessageComponent({ componentType: ComponentType.Button, time: 60_000 }).catch(() => null);
    if (!btnI) return;
    await btnI.showModal(modal);
    interaction = btnI;
  }

  const submitted = await interaction.awaitModalSubmit({ time: 300_000 }).catch(() => null);
  if (!submitted) return;

  // Validation
  for (const field of chunk) {
    const value = submitted.fields.getTextInputValue(`field_${field.id}`).trim();
    
    if (field.required === 1 && !value) {
      return submitted.reply({ content: '❌ Required field is empty.', ephemeral: true });
    }

    if (value) {
      if (field.type === 'number') {
        if (!/^\d+$/.test(value)) {
          return submitted.reply({ content: '❌ Invalid input: Numbers only allowed for this field.', ephemeral: true });
        }
      }
      collectedData[field.label] = value;
    }
  }

  if (isLast) {
    await submitted.deferReply({ ephemeral: true });
    await finalizePortfolio(submitted, allFields, collectedData);
  } else {
    await runPortfolioFlow(submitted, allFields, collectedData, startIndex + 5);
  }
}

async function finalizePortfolio(interaction, fields, data) {
  try {
    const guildId = interaction.guildId;
    const config = await db.getGuildConfig(guildId);
    const channel = await interaction.client.channels.fetch(config.portfolio_channel_id).catch(() => null);

    if (!channel) return interaction.editReply('❌ Channel not found.');

    const member = interaction.member;
    const embed = new EmbedBuilder()
      .setAuthor({ name: member.displayName, iconURL: member.displayAvatarURL() })
      .setTitle(`${interaction.user.tag}'s Portfolio`)
      .setColor(0x00FF00)
      .setTimestamp();

    let description = '';
    for (const field of fields) {
      const val = data[field.label];
      if (val) description += `**${field.label.toUpperCase()}:** ${val}\n`;
    }
    embed.setDescription(description || 'No data provided.');

    // Cleanup old messages
    if (config.instruction_message_id) {
      const oldInstr = await channel.messages.fetch(config.instruction_message_id).catch(() => null);
      if (oldInstr) await oldInstr.delete().catch(() => {});
    }

    const existing = await db.getPortfolio(guildId, interaction.user.id);
    if (existing?.message_id) {
      const oldPort = await channel.messages.fetch(existing.message_id).catch(() => null);
      if (oldPort) await oldPort.delete().catch(() => {});
    }

    // Send new
    const portMsg = await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embed] });
    await db.savePortfolio(guildId, interaction.user.id, portMsg.id, data);

    const { buildInstructionEmbed } = require('../utils/embeds');
    const newInstr = await channel.send({ embeds: [buildInstructionEmbed()] });
    await db.setInstructionMessageId(guildId, newInstr.id);

    await interaction.editReply('✅ Portfolio published!');
  } catch (err) {
    console.error('[CRITICAL] Finalize failed:', err);
    await interaction.editReply('❌ Error publishing.');
  }
}
