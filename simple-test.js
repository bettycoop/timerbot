// Simple Discord Bot Test - Minimal Version
require('dotenv').config();

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

console.log('🚀 Starting simple test bot...');

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
  console.error('❌ No Discord token found!');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Simple ping command
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  
  console.log(`📨 Message received: "${message.content}" from ${message.author.username}`);
  
  if (message.content === '!ping') {
    console.log('🏓 Responding to ping command');
    await message.reply('🏓 Pong! Bot is working!');
  }
  
  if (message.content === '!test') {
    console.log('🧪 Responding to test command');
    const embed = new EmbedBuilder()
      .setTitle('✅ Bot Test')
      .setDescription('Bot is online and responding!')
      .setColor('#00FF00')
      .setTimestamp();
    
    await message.reply({ embeds: [embed] });
  }
});

client.once('ready', () => {
  console.log(`✅ Simple bot ready! Logged in as ${client.user.tag}`);
  console.log(`🌐 Connected to ${client.guilds.cache.size} servers`);
  console.log('🔧 Try these commands: !ping or !test');
});

client.on('error', error => {
  console.error('❌ Client error:', error);
});

// HTTP server for Render
const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Simple Discord Bot Test - Running!');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌐 HTTP server running on port ${PORT}`);
});

// Login
console.log('🔑 Logging in to Discord...');
client.login(TOKEN);
