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
  EmbedBuilder,
  OverwriteType
} = require('discord.js');

const db = require('../database/db');
const { buildSetupEmbed, buildErrorEmbed, buildSuccessEmbed } = require('../utils/embeds');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure the Poolfolio portfolio system')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const adminRoles = await db.getAdminRoles(guildId);
    const member = interaction.member;

    const isAuthorized = member.permissions.has(PermissionFlagsBits.ManageGuild) || 
                       member.roles.cache.some(role => adminRoles.includes(role.id));

    if (!isAuthorized) {
      return interaction.reply({
        embeds: [buildErrorEmbed('You do not have permission to configure the bot. You need **Manage Server** permission or an **Admin Role** set via `/setup`.')],
        ephemeral: true,
      });
    }

    // Permission Check (Bot)
    const botMember = interaction.guild.members.me;
    if (!botMember.permissions.has([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles])) {
      return interaction.reply({
        embeds: [buildErrorEmbed('I am missing required permissions: **Manage Channels** and **Manage Roles**. Please grant them and try again.')],
        ephemeral: true,
      });
    }

    await startGuidedSetup(interaction);
  },
};

async function startGuidedSetup(interaction) {
  let setupData = {
    categoryId: null,
    channelName: 'portfolio',
    whitelistRoles: [],
    adminRoles: []
  };

  // Step 1: Select Category
  const categoryRow = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId('setup_step1_category')
      .setPlaceholder('Select a Category for the portfolio channel')
      .addChannelTypes(ChannelType.GuildCategory)
  );

  const step1Embed = new EmbedBuilder()
    .setTitle('⚙️ Poolfolio Setup — Step 1/4')
    .setDescription('Please select the **Category** where you want the portfolio channel to be created.')
    .setColor(0x5865F2);

  const response = await interaction.reply({
    embeds: [step1Embed],
    components: [categoryRow],
    ephemeral: true
  });

  const collector = response.createMessageComponentCollector({ time: 120_000 });

  collector.on('collect', async (i) => {
    if (i.customId === 'setup_step1_category') {
      setupData.categoryId = i.values[0];
      await step2(i, setupData);
    } else if (i.customId === 'setup_step2_name') {
      await handleStep2Modal(i, setupData);
    } else if (i.customId === 'setup_step3_whitelist') {
      setupData.whitelistRoles = i.values;
      await step4(i, setupData);
    } else if (i.customId === 'setup_step4_admin') {
      setupData.adminRoles = i.values;
      collector.stop();
      await finalizeSetup(i, setupData);
    }
  });
}

async function step2(interaction, setupData) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('setup_step2_name')
      .setLabel('Set Channel Name')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('setup_step2_skip')
      .setLabel('Use Default ("portfolio")')
      .setStyle(ButtonStyle.Secondary)
  );

  const embed = new EmbedBuilder()
    .setTitle('⚙️ Poolfolio Setup — Step 2/4')
    .setDescription(`Category selected: <#${setupData.categoryId}>\n\nNow, choose a name for your portfolio channel.`)
    .setColor(0x5865F2);

  const msg = await interaction.update({ embeds: [embed], components: [row] });

  const filter = (i) => i.user.id === interaction.user.id;
  const btnCollector = interaction.channel.createMessageComponentCollector({ filter, time: 60_000, componentType: ComponentType.Button });

  btnCollector.on('collect', async (i) => {
    btnCollector.stop();
    if (i.customId === 'setup_step2_name') {
      const modal = new ModalBuilder()
        .setCustomId('setup_name_modal')
        .setTitle('Channel Name');
      
      const input = new TextInputBuilder()
        .setCustomId('channel_name_input')
        .setLabel('Enter channel name')
        .setValue('portfolio')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await i.showModal(modal);

      const modalSubmit = await i.awaitModalSubmit({ time: 60_000 }).catch(() => null);
      if (modalSubmit) {
        setupData.channelName = modalSubmit.fields.getTextInputValue('channel_name_input');
        await step3(modalSubmit, setupData);
      }
    } else {
      await step3(i, setupData);
    }
  });
}

async function step3(interaction, setupData) {
  const row = new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId('setup_step3_whitelist')
      .setPlaceholder('Select Whitelist Roles (can post portfolios)')
      .setMinValues(1)
      .setMaxValues(10)
  );

  const embed = new EmbedBuilder()
    .setTitle('⚙️ Poolfolio Setup — Step 3/4')
    .setDescription(`Channel Name: **${setupData.channelName}**\n\nSelect the roles that are allowed to submit portfolios.`)
    .setColor(0x5865F2);

  await interaction.update({ embeds: [embed], components: [row] });
}

async function step4(interaction, setupData) {
  const row = new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId('setup_step4_admin')
      .setPlaceholder('Select Admin Roles (can manage bot)')
      .setMinValues(1)
      .setMaxValues(10)
  );

  const embed = new EmbedBuilder()
    .setTitle('⚙️ Poolfolio Setup — Step 4/4')
    .setDescription(`Whitelisted roles: ${setupData.whitelistRoles.map(id => `<@&${id}>`).join(', ')}\n\nFinally, select the roles that can configure the bot.`)
    .setColor(0x5865F2);

  await interaction.update({ embeds: [embed], components: [row] });
}

async function finalizeSetup(interaction, setupData) {
  await interaction.deferUpdate();

  try {
    const guild = interaction.guild;
    
    // 1. Create Channel
    const permissionOverwrites = [
      {
        id: guild.id, // @everyone
        deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions],
      },
      {
        id: guild.members.me.id, // Bot
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageRoles
        ],
      }
    ];

    for (const roleId of setupData.whitelistRoles) {
      permissionOverwrites.push({
        id: roleId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
      });
    }

    const channel = await guild.channels.create({
      name: setupData.channelName,
      type: ChannelType.GuildText,
      parent: setupData.categoryId,
      permissionOverwrites: permissionOverwrites
    });

    // 2. Save to DB
    await db.setGuildConfig(guild.id, channel.id);
    await db.clearWhitelistRoles(guild.id);
    for (const roleId of setupData.whitelistRoles) {
      await db.addWhitelistRole(guild.id, roleId);
    }
    await db.setAdminRoles(guild.id, setupData.adminRoles);

    // 3. Post Guide Message
    const guideEmbed = new EmbedBuilder()
      .setTitle('📌 Portfolio Channel Guide')
      .setDescription(
        '• This channel is for structured portfolios only\n' +
        '• Use `/portfolio` to submit your profile\n' +
        '• Messages outside format will be deleted\n' +
        '• Required fields must be filled\n' +
        '• Follow format rules\n\n' +
        '🛠 Managed by Poolfolio bot'
      )
      .setColor(0x00FF00);

    const instrMsg = await channel.send({ embeds: [guideEmbed] });
    await db.setInstructionMessageId(guild.id, instrMsg.id);

    // 4. Final Success message
    await interaction.editReply({
      content: `✅ **Setup Complete!**\n\nChannel created: <#${channel.id}>\nWhitelisted roles: ${setupData.whitelistRoles.map(id => `<@&${id}>`).join(', ')}\nAdmin roles: ${setupData.adminRoles.map(id => `<@&${id}>`).join(', ')}`,
      embeds: [],
      components: []
    });

    // Role Position Warning
    const botRole = guild.members.me.roles.highest;
    const maxWhitelistRole = guild.roles.cache.filter(r => setupData.whitelistRoles.includes(r.id)).sort((a, b) => b.position - a.position).first();
    
    if (maxWhitelistRole && botRole.position <= maxWhitelistRole.position) {
      logger.warn(`Bot role is below some whitelisted roles in guild ${guild.id}. Channel permissions might not work as expected.`);
      await interaction.followup({ content: '⚠️ **Warning:** My highest role is below some of the whitelisted roles. I may not be able to manage their permissions correctly.', ephemeral: true });
    }

  } catch (error) {
    logger.error('Setup failed', error);
    await interaction.editReply({
      embeds: [buildErrorEmbed(`Setup failed: ${error.message}`)],
      components: []
    });
  }
}
