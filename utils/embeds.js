const { EmbedBuilder } = require('discord.js');

const BRAND_COLOR = 0x5865F2;
const ERROR_COLOR = 0xED4245;
const SUCCESS_COLOR = 0x57F287;
const WARNING_COLOR = 0xFEE75C;

function buildPortfolioEmbed(user, fields, data) {
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setAuthor({
      name: user.displayName || user.username,
      iconURL: user.displayAvatarURL({ dynamic: true }),
    })
    .setTitle('📋 Portfolio')
    .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
    .setTimestamp()
    .setFooter({ text: 'poolfolio • Portfolio System' });

  for (const field of fields) {
    const value = data[field.field_key];
    if (value !== undefined && value !== null && value !== '') {
      embed.addFields({
        name: field.label,
        value: String(value),
        inline: true,
      });
    }
  }

  return embed;
}

function buildInstructionEmbed() {
  return new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle('📝 Create Your Portfolio')
    .setDescription(
      '**Use `/portfolio` to submit your portfolio**\n\n' +
      'This channel is reserved for portfolio entries only. All non-portfolio messages will be automatically removed.'
    )
    .setTimestamp()
    .setFooter({ text: 'poolfolio • Portfolio System' });
}

function buildErrorEmbed(message) {
  return new EmbedBuilder()
    .setColor(ERROR_COLOR)
    .setTitle('❌ Error')
    .setDescription(message)
    .setTimestamp();
}

function buildSuccessEmbed(message) {
  return new EmbedBuilder()
    .setColor(SUCCESS_COLOR)
    .setTitle('✅ Success')
    .setDescription(message)
    .setTimestamp();
}

function buildWarningEmbed(message) {
  return new EmbedBuilder()
    .setColor(WARNING_COLOR)
    .setTitle('⚠️ Warning')
    .setDescription(message)
    .setTimestamp();
}

function buildSetupEmbed(config, fields, roles) {
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle('⚙️ poolfolio Setup')
    .setDescription('Configure your portfolio system below.')
    .setTimestamp()
    .setFooter({ text: 'poolfolio • Setup Panel' });

  embed.addFields({
    name: '📌 Portfolio Channel',
    value: config?.portfolio_channel_id ? `<#${config.portfolio_channel_id}>` : '`Not set`',
    inline: false,
  });

  const fieldList = fields.length > 0
    ? fields.map((f, i) => `\`${i + 1}.\` **${f.label}** — \`${f.field_type}\` ${f.required ? '*(required)*' : '*(optional)*'}`).join('\n')
    : '`No fields configured`';

  embed.addFields({ name: '📋 Fields', value: fieldList, inline: false });

  const roleList = roles.length > 0
    ? roles.map(r => `<@&${r}>`).join(', ')
    : '`No whitelisted roles`';

  embed.addFields({ name: '🔒 Whitelisted Roles', value: roleList, inline: false });

  return embed;
}

module.exports = {
  buildPortfolioEmbed,
  buildInstructionEmbed,
  buildErrorEmbed,
  buildSuccessEmbed,
  buildWarningEmbed,
  buildSetupEmbed,
};
