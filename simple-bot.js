console.log('🚀 Starting Discord Timer Bot...');

// Check environment
console.log('Environment check:');
console.log('- Node version:', process.version);
console.log('- Platform:', process.platform);

// Bot token
const TOKEN = process.env.DISCORD_TOKEN;
console.log('- Token exists:', TOKEN ? 'YES' : 'NO');
console.log('- Token length:', TOKEN ? TOKEN.length : 0);

if (!TOKEN) {
  console.error('❌ DISCORD_TOKEN environment variable required!');
  console.error('All env vars:', Object.keys(process.env));
  process.exit(1);
}

const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', () => {
  console.log(`✅ Bot ready! Logged in as ${client.user.tag}`);
});

client.on('messageCreate', (message) => {
  if (message.author.bot) return;
  if (message.content === '!test') {
    message.channel.send('Bot is working! 🤖');
  }
});

// Keep alive for Render
const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is running!');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌐 HTTP server running on port ${PORT}`);
});

console.log('🔑 Logging into Discord...');
client.login(TOKEN).catch(error => {
  console.error('❌ Login failed:', error);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});

console.log('✨ Bot startup complete!');
