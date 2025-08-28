// Bulletproof Discord Bot for Render - Never Goes Offline
// Load .env only if it exists (for local development)
try {
  require('dotenv').config();
  console.log('📁 .env file loaded (local development)');
} catch (error) {
  console.log('� No .env file found (production environment)');
}

console.log('�🚀 Starting bulletproof bot...');

// Environment check with fallbacks
const TOKEN = process.env.DISCORD_TOKEN;
console.log('🔍 Environment check:');
console.log('  - NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('  - Platform:', process.platform);
console.log('  - Available env vars:', Object.keys(process.env).filter(k => k.includes('DISCORD')));

if (!TOKEN) {
  console.error('❌ DISCORD_TOKEN not found in environment variables');
  console.error('Available environment variables:');
  Object.keys(process.env).forEach(key => {
    console.error(`  - ${key}: ${key.includes('TOKEN') ? '[HIDDEN]' : process.env[key]}`);
  });
  process.exit(1);
}

console.log('✅ Token found:', TOKEN.substring(0, 10) + '...');

// Import Discord.js with error handling
let Client, GatewayIntentBits;
try {
  const discord = require('discord.js');
  Client = discord.Client;
  GatewayIntentBits = discord.GatewayIntentBits;
  console.log('✅ Discord.js imported successfully');
} catch (error) {
  console.error('❌ Failed to import discord.js:', error);
  process.exit(1);
}

// Create client with all necessary intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  // Additional options for stability
  presence: {
    status: 'online',
    activities: [{
      name: 'Boss Timers',
      type: 3 // Watching
    }]
  }
});

// Connection state tracking
let isReady = false;
let lastHeartbeat = Date.now();

// Keep alive mechanism
function keepAlive() {
  if (isReady) {
    lastHeartbeat = Date.now();
    console.log(`💓 Heartbeat: ${new Date().toISOString()} - Bot healthy`);
  }
}

// Send heartbeat every 30 seconds
setInterval(keepAlive, 30000);

// Discord event handlers
client.once('ready', () => {
  isReady = true;
  console.log(`✅ Bot ready: ${client.user.tag}`);
  console.log(`📊 Connected to ${client.guilds.cache.size} servers`);
  console.log(`🔗 Bot ID: ${client.user.id}`);
  keepAlive();
});

client.on('disconnect', () => {
  isReady = false;
  console.log('🔌 Bot disconnected');
});

client.on('reconnecting', () => {
  console.log('🔄 Bot reconnecting...');
});

client.on('resume', () => {
  isReady = true;
  console.log('▶️ Connection resumed');
  keepAlive();
});

client.on('error', error => {
  console.error('❌ Client error:', error.message);
});

client.on('warn', warning => {
  console.warn('⚠️ Discord warning:', warning);
});

// Simple command handler that responds to everything
client.on('messageCreate', (message) => {
  // Ignore bot messages
  if (message.author.bot) return;
  
  // Log all messages starting with !
  if (message.content.startsWith('!')) {
    console.log(`📨 Command received: "${message.content}" from ${message.author.username}`);
    
    // Respond to any command
    const response = `🤖 **Bot is ONLINE!** ✅\nReceived command: \`${message.content}\`\nTimestamp: ${new Date().toLocaleString()}`;
    
    message.reply(response).then(() => {
      console.log(`✅ Replied successfully to ${message.author.username}`);
    }).catch(err => {
      console.error(`❌ Failed to reply: ${err.message}`);
    });
  }
});

// HTTP health check server for Render
const http = require('http');
const server = http.createServer((req, res) => {
  const status = {
    status: 'running',
    botReady: isReady,
    timestamp: new Date().toISOString(),
    lastHeartbeat: new Date(lastHeartbeat).toISOString(),
    uptime: Math.floor(process.uptime()),
    memory: process.memoryUsage(),
    guilds: client.guilds?.cache?.size || 0
  };
  
  res.writeHead(200, { 
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(status, null, 2));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌐 Health check server running on port ${PORT}`);
});

// Global error handlers
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Promise Rejection:', reason);
});

// Login with retry
async function loginWithRetry() {
  let attempts = 0;
  const maxAttempts = 5;
  
  while (attempts < maxAttempts) {
    try {
      attempts++;
      console.log(`🔐 Login attempt ${attempts}/${maxAttempts}...`);
      
      await client.login(TOKEN);
      console.log('✅ Login successful!');
      return;
      
    } catch (error) {
      console.error(`❌ Login attempt ${attempts} failed:`, error.message);
      
      if (attempts < maxAttempts) {
        const delay = 5000 * attempts; // Increasing delay
        console.log(`⏳ Retrying in ${delay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.error('❌ All login attempts failed');
  process.exit(1);
}

// Start the bot
console.log('🚀 Initializing Discord bot...');
loginWithRetry();
