# poolfolio — Discord.js (Node.js)

A structured portfolio/profile system for Discord servers. Users submit their profiles via interactive slash commands, and the bot enforces strict channel formatting rules.

---

## 📁 Project Structure

```
poolfolio-discordjs/
├── commands/
│   ├── portfolio.js       # /portfolio command
│   └── setup.js           # /setup command
├── events/
│   ├── ready.js
│   ├── interactionCreate.js
│   └── messageCreate.js
├── database/
│   └── db.js              # SQLite database layer
├── utils/
│   ├── logger.js
│   ├── embeds.js
│   └── validation.js
├── index.js               # Entry point
├── deploy-commands.js     # Slash command registration
├── ecosystem.config.js    # PM2 config
├── .env.example
└── package.json
```

---

## 🤖 Creating a Discord Bot

1. Go to [https://discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application** → Name it `poolfolio`
3. Go to **Bot** tab → Click **Add Bot**
4. Under **Privileged Gateway Intents**, enable:
   - ✅ **SERVER MEMBERS INTENT**
   - ✅ **MESSAGE CONTENT INTENT**
5. Click **Reset Token** to generate your token — **copy it now**
6. Go to **OAuth2 → URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Send Messages`, `Manage Messages`, `Embed Links`, `Read Message History`, `View Channels`
7. Copy the generated URL and open it in your browser to invite the bot

---

## 🔑 Required Bot Intents

| Intent | Required |
|---|---|
| GUILDS | ✅ |
| GUILD_MESSAGES | ✅ |
| MESSAGE_CONTENT | ✅ (Privileged) |
| GUILD_MEMBERS | ✅ (Privileged) |

---

## ⚙️ Environment Variables

Create a `.env` file in the project root (copy from `.env.example`):

```env
BOT_TOKEN=your_bot_token_here
CLIENT_ID=your_application_client_id
GUILD_ID=your_guild_id_for_dev   # Optional: omit for global commands
```

**Where to find these values:**
- `BOT_TOKEN` → Discord Developer Portal → Bot → Token
- `CLIENT_ID` → Discord Developer Portal → General Information → Application ID
- `GUILD_ID` → Right-click your server in Discord → Copy Server ID (Developer Mode must be on)

---

## 📦 Installing Dependencies

Requires **Node.js 18+** and **npm**.

```bash
# Clone or download the project
cd poolfolio-discordjs

# Install dependencies
npm install
```

---

## 🚀 Running the Bot

### Step 1: Register Slash Commands

```bash
npm run deploy
```

> If `GUILD_ID` is set, commands register instantly for that guild.  
> Without `GUILD_ID`, global commands take up to 1 hour to propagate.

### Step 2: Start the Bot

```bash
npm start
```

---

## 🖥️ Hosting — Local Machine

```bash
# Install dependencies
npm install

# Configure .env
cp .env.example .env
# Edit .env with your values

# Deploy commands
npm run deploy

# Run bot
npm start
```

To keep it running in the background on Linux/macOS:
```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

---

## ☁️ Hosting — Oracle Cloud VPS (Ubuntu)

### 1. Connect to your VPS
```bash
ssh ubuntu@<your-vps-ip>
```

### 2. Install Node.js 20
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version   # Should be v20.x.x
```

### 3. Install PM2
```bash
sudo npm install -g pm2
```

### 4. Upload your project
```bash
# On your local machine:
scp -r ./poolfolio-discordjs ubuntu@<your-vps-ip>:~/

# Or clone from GitHub:
git clone https://github.com/yourusername/poolfolio-discordjs.git
```

### 5. Install dependencies and configure
```bash
cd ~/poolfolio-discordjs
npm install
cp .env.example .env
nano .env   # Fill in BOT_TOKEN, CLIENT_ID, GUILD_ID
```

### 6. Register commands
```bash
node deploy-commands.js
```

### 7. Start with PM2
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # Follow the printed instructions to enable startup on reboot
```

### 8. Useful PM2 commands
```bash
pm2 status              # View bot status
pm2 logs poolfolio     # View live logs
pm2 restart poolfolio  # Restart bot
pm2 stop poolfolio     # Stop bot
```

### 9. Open firewall (if needed)
```bash
sudo ufw allow ssh
sudo ufw enable
```

---

## 🛠️ Using /setup

> Requires **Manage Server** permission.

Run `/setup` to open the interactive setup panel. You'll see buttons for:

| Button | Action |
|---|---|
| 📌 Set Channel | Select the portfolio channel |
| ➕ Add Field | Add a new portfolio field |
| 🗑️ Remove Field | Remove an existing field |
| 🔒 Whitelist Roles | Set roles that bypass message deletion |
| 🔄 Clear All Fields | Remove all configured fields |

### Adding a Field
When you click **Add Field**, a modal will ask for:
- **Field Label** — Display name (e.g. `Name`, `Age`, `Country`)
- **Field Type** — `text` or `number`
- **Required** — `yes` or `no`

### Example Field Configuration
```
Name     | text   | required
Age      | number | required
Country  | text   | required
Language | text   | optional
Bio      | text   | optional
```

---

## 📝 Using /portfolio

1. Run `/portfolio` in any channel
2. Click **Start Portfolio**
3. Fill in each modal (up to 5 fields per modal page)
4. If you have more than 5 fields, click **Continue** between pages
5. After completing all fields, your portfolio is published to the portfolio channel

**Behavior:**
- If you already have a portfolio, it is replaced with your new one
- The instruction message is always kept at the bottom of the channel
- Non-portfolio messages in the portfolio channel are automatically deleted

---

## 🔒 Channel Control

- Only bot messages are allowed in the portfolio channel
- Any message from a user (not whitelisted) is instantly deleted
- The deleted user receives a DM explaining why

---

## ✅ Validation Rules

- `number` fields reject non-numeric input
- Required fields cannot be submitted empty
- Field values are limited to 500 characters

---

## 🐛 Troubleshooting

| Problem | Solution |
|---|---|
| Commands don't appear | Run `npm run deploy` and wait up to 1 hour for global commands |
| Bot can't delete messages | Ensure bot has `Manage Messages` permission in the portfolio channel |
| `MESSAGE_CONTENT` error | Enable the intent in Discord Developer Portal → Bot |
| Bot goes offline | Use PM2: `pm2 restart poolfolio` |
