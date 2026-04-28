const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

let db;

async function initializeDatabase() {
  db = await open({
    filename: path.join(dbDir, 'poolfolio.db'),
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS guild_config (
      guild_id TEXT PRIMARY KEY,
      portfolio_channel_id TEXT,
      instruction_message_id TEXT,
      admin_roles TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      updated_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      label TEXT NOT NULL,
      field_key TEXT NOT NULL,
      required INTEGER NOT NULL DEFAULT 1,
      field_type TEXT NOT NULL DEFAULT 'text',
      field_order INTEGER NOT NULL DEFAULT 0,
      UNIQUE(guild_id, field_key)
    );

    CREATE TABLE IF NOT EXISTS whitelist_roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      UNIQUE(guild_id, role_id)
    );

    CREATE TABLE IF NOT EXISTS portfolios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      message_id TEXT,
      data TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      UNIQUE(guild_id, user_id)
    );
  `);

  console.log('[DB] Database initialized.');
}

// Guild Config
async function getGuildConfig(guildId) {
  return await db.get('SELECT * FROM guild_config WHERE guild_id = ?', guildId);
}

async function setGuildConfig(guildId, channelId) {
  await db.run(`
    INSERT INTO guild_config (guild_id, portfolio_channel_id, updated_at)
    VALUES (?, ?, strftime('%s','now'))
    ON CONFLICT(guild_id) DO UPDATE SET
      portfolio_channel_id = excluded.portfolio_channel_id,
      updated_at = excluded.updated_at
  `, guildId, channelId);
}

async function setInstructionMessageId(guildId, messageId) {
  await db.run(`
    UPDATE guild_config SET instruction_message_id = ?, updated_at = strftime('%s','now')
    WHERE guild_id = ?
  `, messageId, guildId);
}

async function setAdminRoles(guildId, roleIds) {
  await db.run(`
    UPDATE guild_config SET admin_roles = ?, updated_at = strftime('%s','now')
    WHERE guild_id = ?
  `, JSON.stringify(roleIds), guildId);
}

async function getAdminRoles(guildId) {
  const config = await getGuildConfig(guildId);
  return config?.admin_roles ? JSON.parse(config.admin_roles) : [];
}

// Fields
async function getFields(guildId) {
  return await db.all('SELECT * FROM fields WHERE guild_id = ? ORDER BY field_order ASC', guildId);
}

async function addField(guildId, label, fieldKey, required, fieldType, fieldOrder) {
  await db.run(`
    INSERT OR REPLACE INTO fields (guild_id, label, field_key, required, field_type, field_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `, guildId, label, fieldKey, required ? 1 : 0, fieldType, fieldOrder);
}

async function removeField(guildId, fieldKey) {
  await db.run('DELETE FROM fields WHERE guild_id = ? AND field_key = ?', guildId, fieldKey);
}

async function clearFields(guildId) {
  await db.run('DELETE FROM fields WHERE guild_id = ?', guildId);
}

// Whitelist Roles
async function getWhitelistRoles(guildId) {
  const rows = await db.all('SELECT role_id FROM whitelist_roles WHERE guild_id = ?', guildId);
  return rows.map(r => r.role_id);
}

async function addWhitelistRole(guildId, roleId) {
  await db.run('INSERT OR IGNORE INTO whitelist_roles (guild_id, role_id) VALUES (?, ?)', guildId, roleId);
}

async function removeWhitelistRole(guildId, roleId) {
  await db.run('DELETE FROM whitelist_roles WHERE guild_id = ? AND role_id = ?', guildId, roleId);
}

async function clearWhitelistRoles(guildId) {
  await db.run('DELETE FROM whitelist_roles WHERE guild_id = ?', guildId);
}

// Portfolios
async function getPortfolio(guildId, userId) {
  return await db.get('SELECT * FROM portfolios WHERE guild_id = ? AND user_id = ?', guildId, userId);
}

async function savePortfolio(guildId, userId, messageId, data) {
  await db.run(`
    INSERT INTO portfolios (guild_id, user_id, message_id, data)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET
      message_id = excluded.message_id,
      data = excluded.data
  `, guildId, userId, messageId, JSON.stringify(data));
}

module.exports = {
  initializeDatabase,
  getGuildConfig,
  setGuildConfig,
  setInstructionMessageId,
  getFields,
  addField,
  removeField,
  clearFields,
  getWhitelistRoles,
  addWhitelistRole,
  removeWhitelistRole,
  clearWhitelistRoles,
  getPortfolio,
  savePortfolio,
  setAdminRoles,
  getAdminRoles,
};
