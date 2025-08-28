// Ultra-simple Discord bot for Render testing
require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');

console.log('🤖 Ultra-simple bot starting...');
console.log('📍 Node.js version:', process.version);
console.log('📍 Platform:', process.platform);

const TOKEN = process.env.DISCORD_TOKEN;
console.log('🔑 Token check:', TOKEN ? `Found (${TOKEN.length} chars)` : 'NOT FOUND');

if (!TOKEN) {
  console.error('❌ No Discord token!');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Log everything
client.on('ready', () => {
  console.log(`✅ Bot ready: ${client.user.tag}`);
  console.log(`📊 Guilds: ${client.guilds.cache.size}`);
  client.guilds.cache.forEach(guild => {
    console.log(`   - ${guild.name} (${guild.id})`);
  });
});

client.on('messageCreate', (message) => {
  console.log(`📨 Message: "${message.content}" from ${message.author.username} in ${message.guild?.name || 'DM'}`);
  
  if (message.author.bot) {
    console.log('   ↳ Ignoring bot message');
    return;
  }
  
  // Respond to ANY message that starts with !
  if (message.content.startsWith('!')) {
    console.log('   ↳ Command detected, responding...');
    message.reply(`✅ I heard: "${message.content}"`).then(() => {
      console.log('   ↳ Response sent successfully');
    }).catch(err => {
      console.error('   ↳ Failed to respond:', err.message);
    });
  }
});

client.on('error', error => {
  console.error('❌ Client error:', error);
});

client.on('warn', warning => {
  console.warn('⚠️ Warning:', warning);
});

// HTTP server
const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot status: ' + (client.isReady() ? 'Ready' : 'Not ready'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌐 HTTP server on port ${PORT}`);
});

console.log('� Logging in...');
client.login(TOKEN).then(() => {
  console.log('✅ Login successful');
}).catch(error => {
  console.error('❌ Login failed:', error);
});
