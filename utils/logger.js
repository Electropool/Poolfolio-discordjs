const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function timestamp() {
  return new Date().toISOString();
}

const logger = {
  info: (msg) => console.log(`${colors.cyan}[${timestamp()}] [INFO]${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}[${timestamp()}] [OK]${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}[${timestamp()}] [WARN]${colors.reset} ${msg}`),
  error: (msg, err) => {
    console.error(`${colors.red}[${timestamp()}] [ERROR]${colors.reset} ${msg}`);
    if (err) console.error(err);
  },
  debug: (msg) => {
    if (process.env.DEBUG === 'true') {
      console.log(`${colors.magenta}[${timestamp()}] [DEBUG]${colors.reset} ${msg}`);
    }
  },
};

module.exports = logger;
