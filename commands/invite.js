const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('invite')
    .setDescription('Get an invite to our community server'),

  async execute(interaction) {
    await interaction.reply({
      content: "Join our community server for help and feedback:\nhttps://discord.gg/QbCcpKCZPF",
      ephemeral: true
    });
  },
};
