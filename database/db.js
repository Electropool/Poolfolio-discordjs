const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(path.join(dbDir, 'poolfolio.db'));

function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS guild_config (
      guild_id TEXT PRIMARY KEY,
      portfolio_channel_id TEXT,
      instruction_message_id TEXT,
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
function getGuildConfig(guildId) {
  return db.prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(guildId);
}

function setGuildConfig(guildId, channelId) {
  db.prepare(`
    INSERT INTO guild_config (guild_id, portfolio_channel_id, updated_at)
    VALUES (?, ?, strftime('%s','now'))
    ON CONFLICT(guild_id) DO UPDATE SET
      portfolio_channel_id = excluded.portfolio_channel_id,
      updated_at = excluded.updated_at
  `).run(guildId, channelId);
}

function setInstructionMessageId(guildId, messageId) {
  db.prepare(`
    UPDATE guild_config SET instruction_message_id = ?, updated_at = strftime('%s','now')
    WHERE guild_id = ?
  `).run(messageId, guildId);
}

// Fields
function getFields(guildId) {
  return db.prepare('SELECT * FROM fields WHERE guild_id = ? ORDER BY field_order ASC').all(guildId);
}

function addField(guildId, label, fieldKey, required, fieldType, fieldOrder) {
  db.prepare(`
    INSERT OR REPLACE INTO fields (guild_id, label, field_key, required, field_type, field_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(guildId, label, fieldKey, required ? 1 : 0, fieldType, fieldOrder);
}

function removeField(guildId, fieldKey) {
  db.prepare('DELETE FROM fields WHERE guild_id = ? AND field_key = ?').run(guildId, fieldKey);
}

function clearFields(guildId) {
  db.prepare('DELETE FROM fields WHERE guild_id = ?').run(guildId);
}

// Whitelist Roles
function getWhitelistRoles(guildId) {
  return db.prepare('SELECT role_id FROM whitelist_roles WHERE guild_id = ?').all(guildId).map(r => r.role_id);
}

function addWhitelistRole(guildId, roleId) {
  db.prepare('INSERT OR IGNORE INTO whitelist_roles (guild_id, role_id) VALUES (?, ?)').run(guildId, roleId);
}

function removeWhitelistRole(guildId, roleId) {
  db.prepare('DELETE FROM whitelist_roles WHERE guild_id = ? AND role_id = ?').run(guildId, roleId);
}

function clearWhitelistRoles(guildId) {
  db.prepare('DELETE FROM whitelist_roles WHERE guild_id = ?').run(guildId);
}

// Portfolios
function getPortfolio(guildId, userId) {
  return db.prepare('SELECT * FROM portfolios WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
}

function savePortfolio(guildId, userId, messageId, data) {
  db.prepare(`
    INSERT INTO portfolios (guild_id, user_id, message_id, data)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET
      message_id = excluded.message_id,
      data = excluded.data
  `).run(guildId, userId, messageId, JSON.stringify(data));
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
};
