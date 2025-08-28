// Ultra-minimal Discord bot for final diagnosis
console.log('Starting bot...');

// Load environment first
try {
    require('dotenv').config();
    console.log('Loaded .env file');
} catch (e) {
    console.log('No .env file found (production mode)');
}

// Check if we have Discord token
const TOKEN = process.env.DISCORD_TOKEN;
console.log('Token status:', TOKEN ? 'FOUND' : 'MISSING');

if (!TOKEN) {
    console.log('FATAL: No DISCORD_TOKEN found');
    process.exit(1);
}

// Try to import Discord.js
try {
    const { Client, GatewayIntentBits } = require('discord.js');
    console.log('Discord.js imported successfully');
    
    const client = new Client({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
    });

    client.once('ready', () => {
        console.log('BOT IS READY!');
    });

    client.login(TOKEN || process.env.DISCORD_TOKEN);
    console.log('Login attempt made');
    
} catch (error) {
    console.log('ERROR:', error.message);
}

// Simple HTTP server
const http = require('http');
const server = http.createServer((req, res) => {
    res.end('Bot running');
});

server.listen(process.env.PORT || 3000, () => {
    console.log('HTTP server started');
});

console.log('Script end reached');
