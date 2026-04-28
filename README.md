# poolfolio — Discord.js (Node.js)

A structured portfolio/profile system for Discord servers with multi-template support. Users submit their profiles via interactive slash commands, and the bot enforces strict channel formatting rules.

---

## 📁 Project Structure

```
poolfolio-discordjs/
├── commands/
│   ├── portfolio.js       # /portfolio command
│   ├── setup.js           # /setup command
│   ├── setup-portfolio.js # /setup-portfolio (Template config)
│   └── use-setup.js       # /use-setup (Assign template)
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
   - Bot Permissions: `Send Messages`, `Manage Messages`, `Embed Links`, `Read Message History`, `View Channels`, `Manage Channels`, `Manage Roles`
7. Copy the generated URL and open it in your browser to invite the bot

---

## ⚙️ Environment Variables

Create a `.env` file in the project root (copy from `.env.example`):

```env
BOT_TOKEN=your_bot_token_here
CLIENT_ID=your_application_client_id
GUILD_ID=your_guild_id_for_dev   # Optional: omit for global commands
```

---

## 🚀 Commands Overview

### ⚙️ Administrative Commands

| Command | Description |
|---|---|
| `/setup` | Guided setup for channel creation and admin permissions. |
| `/setup-portfolio` | Configure fields for one of the 3 templates (`setup1`, `setup2`, `setup3`). |
| `/use-setup` | Assign a specific configured template to the portfolio channel. |

### 📝 User Commands

| Command | Description |
|---|---|
| `/portfolio` | Create or update your portfolio using the active template. |

---

## 📘 Template System Details

Each server can maintain **3 independent templates** (`setup1`, `setup2`, `setup3`).

### 🛠️ Setting up a Template (`/setup-portfolio`)
1. Run `/setup-portfolio`.
2. Select a template slot (e.g., `setup1`).
3. Follow the modal flow to add fields:
   - **Label**: The name of the field (max 100 characters).
   - **Type**: `text` or `number`.
   - **Required**: `yes` or `no`.
4. Add up to **10 fields** per template.
5. Click **Save Template** to finish.

### 🔌 Activating a Template (`/use-setup`)
1. Go to the portfolio channel.
2. Run `/use-setup`.
3. Select the template you want to use for that channel.
4. If the template is valid, the channel is now linked to those fields.

---

## 📝 Using /portfolio

1. Run `/portfolio`.
2. The bot detects the active template for the channel.
3. Fill in the fields via sequential modals (5 fields at a time).
4. **Validation**:
   - `number` fields only accept numeric digits (max 20).
   - `text` fields accept all characters.
   - If any required field is empty or validation fails, the process cancels.
5. Success: Your portfolio is posted with bold labels. Labels without values (optional fields) are hidden.

---

## 🔁 Message Order Logic

The bot automatically maintains:
1. All [User Portfolios]
2. One [Bot Instruction Message] always at the bottom.

When a user submits a portfolio:
- Their old portfolio is deleted.
- The instruction message is deleted.
- The new portfolio is sent.
- A new instruction message is sent.

---

## 🔐 Permissions & Rules

- **Manage Server** or defined **Admin Roles** can configure the bot.
- **Whitelisted Roles** are the only ones allowed to post in the portfolio channel.
- Any unauthorized message in the portfolio channel is instantly deleted.

---


---

## 🐛 Troubleshooting

### Interaction Failed / Command Freezes
- Ensure the bot has **Administrator** or **Manage Guild** permissions.
- Check the console for `[INTERACTION ERROR]`. This usually happens if the database is locked or the interaction timed out.
- If `/setup-portfolio` freezes, restart the bot to clear any hung collectors.

### Setup Not Saving
- If `/use-setup` says "not configured", ensure you clicked **Save & Finish** at the end of the `/setup-portfolio` loop.
- Check if `poolfolio.db` has write permissions in the file system.

### Messages Not Deleting
- The bot needs **Manage Messages** permission in the portfolio channel.
- A **Failsafe Scanner** runs every 3 seconds to clean any missed messages. If messages persist, check if the user is in a **Whitelisted Role**.

### Bot Not Starting
- Ensure `BOT_TOKEN` and `CLIENT_ID` are correct in `.env`.
- Run `npm install` to ensure all dependencies like `sqlite3` are correctly installed.

---
