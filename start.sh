#!/bin/bash
echo "Starting Poolfolio Discord.js bot with PM2..."
pm2 start ecosystem.config.js
pm2 save
echo "Bot started."
