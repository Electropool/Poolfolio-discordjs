const logger = require('../utils/logger');

module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    logger.success(`poolfolio is online! Logged in as ${client.user.tag}`);
    client.user.setPresence({
      activities: [{ name: '/portfolio | poolfolio', type: 3 }],
      status: 'online',
    });
  },
};
