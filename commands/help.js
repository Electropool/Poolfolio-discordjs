const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('View the Poolfolio setup guide')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const adminRoles = await db.getAdminRoles(guildId);
    const isAuthorized = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) || 
                         interaction.member.roles.cache.some(role => adminRoles.includes(role.id));

    if (!isAuthorized) {
      return interaction.reply({
        content: '❌ You do not have permission to use the admin help command.',
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle('📌 Poolfolio Setup Guide')
      .setDescription('Follow these steps to configure your portfolio system correctly.')
      .addFields(
        { name: '1️⃣ Initial Channel Setup', value: 'Use `/setup` to select a category and create the portfolio channel. This also sets up initial permissions.' },
        { name: '2️⃣ Template Configuration', value: 'Use `/setup-portfolio` to define fields (labels, types, required) for one of the 3 slots (setup1, setup2, setup3).' },
        { name: '3️⃣ Activate Template', value: 'Go to your portfolio channel and use `/use-setup` to assign one of your configured templates to that channel.' },
        { name: '4️⃣ User Submission', value: 'Users can now use `/portfolio` to fill in the structured form. Their profile will be posted automatically.' },
        { name: '🛡️ Rules & Enforcement', value: '• No one (including admins) can send normal messages in the portfolio channel.\n• Only the bot\'s messages and `/portfolio` submissions are allowed.\n• Any other message is deleted instantly by the Failsafe Scanner.' }
      )
      .setFooter({ text: '🛠 Managed by Poolfolio bot' })
      .setColor(0x5865F2);

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
