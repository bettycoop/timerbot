// Discord Boss Timer Bot - Production Ready for Render
console.log('🚀 Starting Discord Boss Timer Bot...');

// Load environment variables
try {
  require('dotenv').config();
  console.log('📁 Environment loaded');
} catch (e) {
  console.log('📁 Production mode (no .env file)');
}

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
  console.error('❌ DISCORD_TOKEN not found');
  process.exit(1);
}

const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const http = require('http');

// Global variables
let bossList = [];
let channelId = null;
let isReady = false;

// File paths
const BOSS_FILE = 'bosses.json';
const CHANNEL_FILE = 'channel.json';

// Load data
function loadData() {
  try {
    if (fs.existsSync(BOSS_FILE)) {
      bossList = JSON.parse(fs.readFileSync(BOSS_FILE, 'utf8'));
      console.log(`📋 Loaded ${bossList.length} bosses`);
    }
    if (fs.existsSync(CHANNEL_FILE)) {
      const data = JSON.parse(fs.readFileSync(CHANNEL_FILE, 'utf8'));
      channelId = data.channelId;
      console.log(`📺 Channel set to: ${channelId}`);
    }
  } catch (error) {
    console.error('❌ Error loading data:', error.message);
  }
}

// Save data
function saveData() {
  try {
    fs.writeFileSync(BOSS_FILE, JSON.stringify(bossList, null, 2));
    fs.writeFileSync(CHANNEL_FILE, JSON.stringify({ channelId }, null, 2));
  } catch (error) {
    console.error('❌ Error saving data:', error.message);
  }
}

// Create Discord client
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// Bot ready event
client.once('ready', () => {
  isReady = true;
  console.log(`✅ Bot ready! Logged in as ${client.user.tag}`);
  loadData();
  checkBossTimers(); // Start checking timers
});

// Message handler
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith('!')) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  try {
    switch (command) {
      case 'input':
        await handleInput(message, args);
        break;
      case 'cooldown':
        await handleCooldown(message);
        break;
      case 'list':
        await handleList(message);
        break;
      case 'delete':
        await handleDelete(message, args);
        break;
      case 'setchannel':
        await handleSetChannel(message);
        break;
      case 'commands':
        await handleCommands(message);
        break;
      default:
        if (command) {
          await message.reply('❓ Unknown command. Use `!commands` to see available commands.');
        }
    }
  } catch (error) {
    console.error('❌ Command error:', error.message);
    await message.reply('❌ An error occurred while processing your command.');
  }
});

// Command handlers
async function handleInput(message, args) {
  if (args.length < 2) {
    return message.reply('❌ Usage: `!input [boss name] [time in minutes]`');
  }

  const bossName = args.slice(0, -1).join(' ');
  const minutes = parseInt(args[args.length - 1]);

  if (isNaN(minutes) || minutes <= 0) {
    return message.reply('❌ Please provide a valid time in minutes.');
  }

  const now = new Date();
  const respawnTime = new Date(now.getTime() + minutes * 60000);
  
  // Remove existing boss with same name
  bossList = bossList.filter(boss => boss.name.toLowerCase() !== bossName.toLowerCase());
  
  // Add new boss
  bossList.push({
    name: bossName,
    respawnTime: respawnTime.toISOString(),
    addedBy: message.author.username,
    addedAt: now.toISOString()
  });

  saveData();

  const embed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle('✅ Boss Timer Added')
    .addFields(
      { name: 'Boss', value: bossName, inline: true },
      { name: 'Respawn Time', value: `<t:${Math.floor(respawnTime.getTime() / 1000)}:F>`, inline: true },
      { name: 'Added by', value: message.author.username, inline: true }
    )
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

async function handleCooldown(message) {
  if (bossList.length === 0) {
    return message.reply('📭 No bosses in the cooldown list.');
  }

  const now = new Date();
  const activeBosses = bossList.filter(boss => new Date(boss.respawnTime) > now);

  if (activeBosses.length === 0) {
    return message.reply('🎉 All bosses are ready to spawn!');
  }

  activeBosses.sort((a, b) => new Date(a.respawnTime) - new Date(b.respawnTime));

  const embed = new EmbedBuilder()
    .setColor(0xff9900)
    .setTitle('⏰ Boss Cooldowns')
    .setTimestamp();

  activeBosses.forEach(boss => {
    const respawnTime = new Date(boss.respawnTime);
    const timeLeft = Math.ceil((respawnTime - now) / 60000);
    embed.addFields({
      name: boss.name,
      value: `<t:${Math.floor(respawnTime.getTime() / 1000)}:R> (${timeLeft}m)`,
      inline: true
    });
  });

  await message.reply({ embeds: [embed] });
}

async function handleList(message) {
  if (bossList.length === 0) {
    return message.reply('📭 No bosses in the list.');
  }

  const now = new Date();
  bossList.sort((a, b) => new Date(a.respawnTime) - new Date(b.respawnTime));

  const embed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle('📋 All Boss Timers')
    .setTimestamp();

  bossList.forEach((boss, index) => {
    const respawnTime = new Date(boss.respawnTime);
    const isReady = respawnTime <= now;
    const status = isReady ? '✅ READY' : '⏰ Cooling down';
    
    embed.addFields({
      name: `${index + 1}. ${boss.name}`,
      value: `${status}\n<t:${Math.floor(respawnTime.getTime() / 1000)}:F>`,
      inline: true
    });
  });

  await message.reply({ embeds: [embed] });
}

async function handleDelete(message, args) {
  if (args.length === 0) {
    return message.reply('❌ Usage: `!delete [boss name or number]`');
  }

  const identifier = args.join(' ');
  const index = parseInt(identifier) - 1;

  let removedBoss;
  if (!isNaN(index) && index >= 0 && index < bossList.length) {
    removedBoss = bossList.splice(index, 1)[0];
  } else {
    const bossIndex = bossList.findIndex(boss => 
      boss.name.toLowerCase() === identifier.toLowerCase()
    );
    if (bossIndex !== -1) {
      removedBoss = bossList.splice(bossIndex, 1)[0];
    }
  }

  if (!removedBoss) {
    return message.reply('❌ Boss not found. Use `!list` to see all bosses.');
  }

  saveData();

  const embed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle('🗑️ Boss Timer Removed')
    .addFields({ name: 'Boss', value: removedBoss.name })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

async function handleSetChannel(message) {
  channelId = message.channel.id;
  saveData();

  const embed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle('📺 Alert Channel Set')
    .setDescription(`Boss alerts will be sent to ${message.channel}`)
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

async function handleCommands(message) {
  const embed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle('🤖 Bot Commands')
    .addFields(
      { name: '!input [boss] [minutes]', value: 'Add a boss timer', inline: false },
      { name: '!cooldown', value: 'Show active cooldowns', inline: false },
      { name: '!list', value: 'Show all bosses (sorted by time)', inline: false },
      { name: '!delete [boss/number]', value: 'Remove a boss timer', inline: false },
      { name: '!setchannel', value: 'Set alert channel', inline: false },
      { name: '!commands', value: 'Show this help', inline: false }
    )
    .setFooter({ text: 'Timezone: Asia/Shanghai (GMT+8)' })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

// Timer checking function
async function checkBossTimers() {
  if (!isReady || !channelId) return;

  try {
    const now = new Date();
    const channel = await client.channels.fetch(channelId);

    for (let i = bossList.length - 1; i >= 0; i--) {
      const boss = bossList[i];
      const respawnTime = new Date(boss.respawnTime);
      const minutesLeft = Math.ceil((respawnTime - now) / 60000);

      // 15-minute warning
      if (minutesLeft === 15 && !boss.warned15) {
        boss.warned15 = true;
        saveData();

        const embed = new EmbedBuilder()
          .setColor(0xffaa00)
          .setTitle('⚠️ Boss Alert - 15 Minutes')
          .setDescription(`**${boss.name}** will respawn in 15 minutes!`)
          .addFields({ name: 'Respawn Time', value: `<t:${Math.floor(respawnTime.getTime() / 1000)}:F>` })
          .setTimestamp();

        await channel.send({ content: '@everyone', embeds: [embed] });
      }

      // Boss ready
      if (respawnTime <= now && !boss.notified) {
        boss.notified = true;
        saveData();

        const embed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle('🎉 Boss Ready!')
          .setDescription(`**${boss.name}** has respawned!`)
          .setTimestamp();

        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`kill_${i}`)
              .setLabel('Kill Boss')
              .setStyle(ButtonStyle.Success)
              .setEmoji('⚔️')
          );

        await channel.send({ content: '@everyone', embeds: [embed], components: [row] });
      }
    }
  } catch (error) {
    console.error('❌ Timer check error:', error.message);
  }

  // Check again in 1 minute
  setTimeout(checkBossTimers, 60000);
}

// Button interactions
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId.startsWith('kill_')) {
    const index = parseInt(interaction.customId.split('_')[1]);
    if (index >= 0 && index < bossList.length) {
      const boss = bossList.splice(index, 1)[0];
      saveData();

      const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('⚔️ Boss Killed')
        .setDescription(`**${boss.name}** has been killed by ${interaction.user.username}`)
        .setTimestamp();

      await interaction.update({ embeds: [embed], components: [] });
    }
  }
});

// HTTP server for Render
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'online',
    botReady: isReady,
    bosses: bossList.length,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  }));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌐 HTTP server running on port ${PORT}`);
});

// Keep-alive function for Render
function keepAlive() {
  if (process.env.RENDER_EXTERNAL_URL) {
    http.get(process.env.RENDER_EXTERNAL_URL, (res) => {
      console.log(`💓 Keep-alive ping: ${res.statusCode}`);
    }).on('error', (err) => {
      console.log('💓 Keep-alive error:', err.message);
    });
  }
}

// Send keep-alive ping every 14 minutes
setInterval(keepAlive, 14 * 60 * 1000);

// Error handlers
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('💥 Unhandled Rejection:', reason);
});

// Login
client.login(TOKEN);
console.log('🔐 Attempting Discord login...');
