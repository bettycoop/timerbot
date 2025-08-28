// Load environment variables
require('dotenv').config();

// Import required modules
const fs = require('fs');
const path = require('path');

// Environment validation
console.log('🔍 Checking environment variables...');
const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
  console.error('❌ DISCORD_TOKEN is not found in environment variables');
  console.error('Please set the DISCORD_TOKEN environment variable');
  process.exit(1);
}

console.log('✅ DISCORD_TOKEN found');

// Import Discord.js components
const { 
  Client, 
  GatewayIntentBits, 
  ButtonBuilder, 
  ButtonStyle, 
  ActionRowBuilder,
  EmbedBuilder
} = require('discord.js');

// Create Discord client with required intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Command prefix
const PREFIX = '!';

// Storage for boss information and active timers
const bossData = {};
const activeTimers = {};

// Storage for update channel settings
let updateChannel = null;

// Default timezone GMT+8
const TIMEZONE = 'Asia/Shanghai';

// File paths for persistent storage
const BOSS_DATA_FILE = path.join(__dirname, 'boss-data.json');
const ACTIVE_TIMERS_FILE = path.join(__dirname, 'active-timers.json');
const UPDATE_CHANNEL_FILE = path.join(__dirname, 'update-channel.json');

// Persistent storage functions
function saveBossData() {
  try {
    fs.writeFileSync(BOSS_DATA_FILE, JSON.stringify(bossData, null, 2));
    console.log('✅ Boss data saved');
  } catch (error) {
    console.error('❌ Error saving boss data:', error);
  }
}

function loadBossData() {
  try {
    if (fs.existsSync(BOSS_DATA_FILE)) {
      const data = fs.readFileSync(BOSS_DATA_FILE, 'utf8');
      Object.assign(bossData, JSON.parse(data));
      console.log(`✅ Loaded ${Object.keys(bossData).length} boss entries`);
    }
  } catch (error) {
    console.error('❌ Error loading boss data:', error);
  }
}

function saveActiveTimers() {
  try {
    const timersToSave = {};
    Object.keys(activeTimers).forEach(bossName => {
      const timer = activeTimers[bossName];
      timersToSave[bossName] = {
        spawnTime: timer.spawnTime,
        channelId: timer.channelId,
        guildId: timer.guildId,
        killedBy: timer.killedBy || null
      };
    });
    fs.writeFileSync(ACTIVE_TIMERS_FILE, JSON.stringify(timersToSave, null, 2));
    console.log('✅ Active timers saved');
  } catch (error) {
    console.error('❌ Error saving active timers:', error);
  }
}

function loadActiveTimers() {
  try {
    if (fs.existsSync(ACTIVE_TIMERS_FILE)) {
      const savedTimers = JSON.parse(fs.readFileSync(ACTIVE_TIMERS_FILE, 'utf8'));
      
      Object.keys(savedTimers).forEach(bossName => {
        const timerData = savedTimers[bossName];
        const timeLeft = timerData.spawnTime - Date.now();
        
        if (timeLeft > 0 && bossData[bossName]) {
          // Restore active timer
          startBossTimer(bossName, timeLeft, timerData.channelId, timerData.guildId, timerData.killedBy);
        }
      });
      
      console.log(`✅ Loaded ${Object.keys(savedTimers).length} active timers`);
    }
  } catch (error) {
    console.error('❌ Error loading active timers:', error);
  }
}

function saveUpdateChannel() {
  try {
    const channelData = updateChannel ? { channelId: updateChannel.id, guildId: updateChannel.guild.id } : null;
    fs.writeFileSync(UPDATE_CHANNEL_FILE, JSON.stringify(channelData, null, 2));
    console.log('✅ Update channel saved');
  } catch (error) {
    console.error('❌ Error saving update channel:', error);
  }
}

function loadUpdateChannel() {
  try {
    if (fs.existsSync(UPDATE_CHANNEL_FILE)) {
      const channelData = JSON.parse(fs.readFileSync(UPDATE_CHANNEL_FILE, 'utf8'));
      if (channelData && channelData.channelId) {
        client.channels.fetch(channelData.channelId).then(channel => {
          updateChannel = channel;
          console.log(`✅ Update channel loaded: #${channel.name}`);
        }).catch(error => {
          console.error('❌ Error fetching saved update channel:', error);
        });
      }
    }
  } catch (error) {
    console.error('❌ Error loading update channel:', error);
  }
}

// Timer and alert functions
function startBossTimer(bossName, timeUntilSpawn, channelId, guildId, killedBy = null) {
  const spawnTime = Date.now() + timeUntilSpawn;
  
  // Clear existing timer if any
  if (activeTimers[bossName]) {
    clearTimeout(activeTimers[bossName].timer);
    if (activeTimers[bossName].alert15) clearTimeout(activeTimers[bossName].alert15);
  }
  
  // Create new timer
  activeTimers[bossName] = {
    timer: setTimeout(() => handleBossSpawn(bossName, channelId, guildId), timeUntilSpawn),
    spawnTime: spawnTime,
    channelId: channelId,
    guildId: guildId,
    killedBy: killedBy
  };
  
  // Set up 15-minute alert
  const fifteenMinAlert = timeUntilSpawn - (15 * 60 * 1000);
  if (fifteenMinAlert > 0) {
    activeTimers[bossName].alert15 = setTimeout(() => {
      send15MinAlert(bossName, channelId);
    }, fifteenMinAlert);
  }
  
  saveActiveTimers();
}

function send15MinAlert(bossName, channelId) {
  try {
    const channel = client.channels.cache.get(channelId);
    if (channel && bossData[bossName]) {
      const embed = new EmbedBuilder()
        .setColor('#FF6B6B')
        .setTitle('🚨 Boss Alert!')
        .setDescription(`**${bossName}** will spawn in **15 minutes**!`)
        .addFields(
          { name: 'Respawn Time', value: bossData[bossName].respawnTime, inline: true },
          { name: 'Cooldown', value: `${bossData[bossName].cooldown}h`, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'Boss Timer Bot' });
      
      channel.send({ content: '@everyone', embeds: [embed] });
    }
  } catch (error) {
    console.error('Error sending 15-min alert:', error);
  }
}

function handleBossSpawn(bossName, channelId, guildId) {
  try {
    const channel = client.channels.cache.get(channelId);
    if (channel && bossData[bossName]) {
      const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('⚔️ Boss Spawned!')
        .setDescription(`**${bossName}** has spawned!`)
        .addFields(
          { name: 'Respawn Time', value: bossData[bossName].respawnTime, inline: true },
          { name: 'Cooldown', value: `${bossData[bossName].cooldown}h`, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'Boss Timer Bot' });
      
      const killButton = new ButtonBuilder()
        .setCustomId(`kill:${bossName}`)
        .setLabel(`${bossName} Killed`)
        .setStyle(ButtonStyle.Danger);
      
      const row = new ActionRowBuilder().addComponents(killButton);
      
      channel.send({ 
        content: '@everyone', 
        embeds: [embed], 
        components: [row] 
      });
    }
    
    // Clean up the timer
    delete activeTimers[bossName];
    saveActiveTimers();
  } catch (error) {
    console.error('Error handling boss spawn:', error);
  }
}

// Generate boss list embed
function getBossListEmbed() {
  const embed = new EmbedBuilder()
    .setColor('#0099FF')
    .setTitle('👑 Boss Information')
    .setTimestamp()
    .setFooter({ text: 'Boss Timer Bot | GMT+8' });

  if (Object.keys(bossData).length === 0) {
    embed.setDescription('No bosses configured. Use `!input` to add bosses.');
    return embed;
  }

  const now = Date.now();
  
  // Create array of boss entries with calculated time left
  const bossEntries = Object.keys(bossData).map(bossName => {
    const boss = bossData[bossName];
    let timeLeft = 0;
    let isActive = false;
    
    if (activeTimers[bossName]) {
      timeLeft = activeTimers[bossName].spawnTime - now;
      isActive = timeLeft > 0;
    }
    
    return {
      name: bossName,
      boss: boss,
      timeLeft: timeLeft,
      isActive: isActive
    };
  });
  
  // Sort bosses: active timers first (by time left ascending), then inactive ones
  bossEntries.sort((a, b) => {
    // If both are active, sort by time left (shortest first)
    if (a.isActive && b.isActive) {
      return a.timeLeft - b.timeLeft;
    }
    // If only one is active, active comes first
    if (a.isActive && !b.isActive) return -1;
    if (!a.isActive && b.isActive) return 1;
    // If both are inactive, sort alphabetically
    return a.name.localeCompare(b.name);
  });

  let description = '';
  
  bossEntries.forEach(entry => {
    const { name: bossName, boss, timeLeft, isActive } = entry;
    
    description += `**${bossName}**\n`;
    description += `📅 Respawn Time: ${boss.respawnTime}\n`;
    description += `⏱️ Cooldown: ${boss.cooldown}h\n`;
    
    if (isActive) {
      const hours = Math.floor(timeLeft / (1000 * 60 * 60));
      const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
      
      description += `🔴 **ACTIVE**: ${hours}h ${minutes}m ${seconds}s until spawn\n`;
      const spawnTime = new Date(activeTimers[bossName].spawnTime).toLocaleString('en-US', { timeZone: TIMEZONE });
      description += `📍 Spawns at: ${spawnTime} (GMT+8)\n`;
      
      if (activeTimers[bossName].killedBy) {
        description += `⚔️ Last killed by: ${activeTimers[bossName].killedBy}\n`;
      }
    } else {
      description += `🟢 **AVAILABLE**: Ready to spawn\n`;
    }
    
    description += '\n';
  });

  embed.setDescription(description);
  return embed;
}

// Hourly update system
function startHourlyUpdates() {
  setInterval(() => {
    if (updateChannel && (Object.keys(bossData).length > 0 || Object.keys(activeTimers).length > 0)) {
      const embed = getBossListEmbed();
      embed.setTitle('🔄 Hourly Boss Update');
      updateChannel.send({ embeds: [embed] });
    }
  }, 60 * 60 * 1000); // Every hour
}

// Message command handler
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  try {
    if (command === 'commands') {
      const embed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle('📋 Available Commands')
        .setDescription([
          '`!commands` - Show all available commands',
          '`!input [bossname] [respawntime]` - Add boss information',
          '`!cooldown [bossname] [cooldowntime]` - Set boss cooldown',
          '`!list` - Display all boss information',
          '`!delete [bossname]` - Delete specific boss',
          '`!setchannel` - Set channel for hourly updates'
        ].join('\n'))
        .addFields(
          { 
            name: 'Examples', 
            value: [
              '`!input Dragon 16:30` - Add Dragon, respawns at 16:30 today/tomorrow',
              '`!cooldown Dragon 8` - Set Dragon cooldown to 8 hours',
              '`!list` - Show all bosses'
            ].join('\n')
          }
        )
        .setTimestamp()
        .setFooter({ text: 'Boss Timer Bot | GMT+8' });

      await message.reply({ embeds: [embed] });
    }

    else if (command === 'input') {
      if (args.length < 2) {
        return message.reply('Usage: `!input [bossname] [respawntime]`\nExample: `!input Dragon 16:30`');
      }

      const bossName = args[0];
      const respawnTime = args[1];

      // Validate respawn time format
      const timeMatch = respawnTime.match(/^(\d{1,2}):(\d{2})$/);
      if (!timeMatch) {
        return message.reply('Please use HH:MM format for respawn time (e.g., 16:30)');
      }

      const hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2]);

      if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        return message.reply('Please provide a valid time in 24-hour format (00:00 to 23:59)');
      }

      // Check for duplicate boss name
      if (bossData[bossName]) {
        return message.reply(`Boss **${bossName}** already exists. Use \`!delete\` to remove it first.`);
      }

      // Calculate time left until respawn time
      const now = new Date();
      const currentTimeInGMT8 = new Date(now.toLocaleString("en-US", {timeZone: TIMEZONE}));
      
      // Create target time for today
      const targetTime = new Date(currentTimeInGMT8);
      targetTime.setHours(hours, minutes, 0, 0);
      
      // If target time has passed today, set it for tomorrow
      if (targetTime <= currentTimeInGMT8) {
        targetTime.setDate(targetTime.getDate() + 1);
      }
      
      // Calculate time difference in milliseconds
      const timeLeftMs = targetTime.getTime() - currentTimeInGMT8.getTime();
      const timeLeftHours = timeLeftMs / (1000 * 60 * 60);

      // Store boss data with default 24h cooldown
      bossData[bossName] = {
        respawnTime: respawnTime,
        cooldown: 24, // Default 24 hour cooldown
        addedBy: message.author.username,
        addedAt: new Date().toISOString()
      };

      saveBossData();

      // Start timer
      startBossTimer(bossName, timeLeftMs, message.channel.id, message.guild.id);

      const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('✅ Boss Added')
        .setDescription(`**${bossName}** has been configured`)
        .addFields(
          { name: 'Respawn Time', value: respawnTime + ' (GMT+8)', inline: true },
          { name: 'Time Left', value: `${timeLeftHours.toFixed(1)}h`, inline: true },
          { name: 'Next Spawn', value: targetTime.toLocaleString('en-US', { timeZone: TIMEZONE }), inline: true },
          { name: 'Added by', value: message.author.username, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'Boss Timer Bot' });

      await message.reply({ embeds: [embed] });
    }

    else if (command === 'cooldown') {
      if (args.length < 2) {
        return message.reply('Usage: `!cooldown [bossname] [cooldowntime]`\nExample: `!cooldown Dragon 8`');
      }

      const bossName = args[0];
      const cooldownTime = parseFloat(args[1]);

      if (!bossData[bossName]) {
        return message.reply(`Boss **${bossName}** not found. Use \`!input\` to add it first.`);
      }

      if (isNaN(cooldownTime) || cooldownTime <= 0) {
        return message.reply('Please provide a valid cooldown time in hours (e.g., 2, 8, 24)');
      }

      bossData[bossName].cooldown = cooldownTime;
      saveBossData();

      const embed = new EmbedBuilder()
        .setColor('#FFA500')
        .setTitle('⏱️ Cooldown Updated')
        .setDescription(`**${bossName}** cooldown set to **${cooldownTime}h**`)
        .setTimestamp()
        .setFooter({ text: 'Boss Timer Bot' });

      await message.reply({ embeds: [embed] });
    }

    else if (command === 'list') {
      const embed = getBossListEmbed();
      await message.reply({ embeds: [embed] });
    }

    else if (command === 'delete') {
      if (args.length < 1) {
        return message.reply('Usage: `!delete [bossname]`\nExample: `!delete Dragon`');
      }

      const bossName = args[0];

      if (!bossData[bossName]) {
        return message.reply(`Boss **${bossName}** not found.`);
      }

      // Clear active timer if any
      if (activeTimers[bossName]) {
        clearTimeout(activeTimers[bossName].timer);
        if (activeTimers[bossName].alert15) clearTimeout(activeTimers[bossName].alert15);
        delete activeTimers[bossName];
        saveActiveTimers();
      }

      delete bossData[bossName];
      saveBossData();

      const embed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('🗑️ Boss Deleted')
        .setDescription(`**${bossName}** has been removed from the boss list.`)
        .setTimestamp()
        .setFooter({ text: 'Boss Timer Bot' });

      await message.reply({ embeds: [embed] });
    }

    else if (command === 'setchannel') {
      updateChannel = message.channel;
      saveUpdateChannel();
      
      const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('✅ Update Channel Set')
        .setDescription(`Hourly boss updates will be sent to ${message.channel}`)
        .setTimestamp()
        .setFooter({ text: 'Boss Timer Bot' });
      
      await message.reply({ embeds: [embed] });
    }

  } catch (error) {
    console.error('Error processing command:', error);
    await message.reply('An error occurred while processing your command.');
  }
});

// Button interaction handler
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  try {
    if (interaction.customId.startsWith('kill:')) {
      const bossName = interaction.customId.substring(5);
      
      if (!bossData[bossName]) {
        return interaction.reply({ content: `Boss **${bossName}** not found in configuration.`, ephemeral: true });
      }

      const boss = bossData[bossName];
      const killedBy = interaction.user.username;
      const cooldownMs = boss.cooldown * 60 * 60 * 1000;

      // Start new timer
      startBossTimer(bossName, cooldownMs, interaction.channelId, interaction.guildId, killedBy);

      const nextSpawnTime = new Date(Date.now() + cooldownMs).toLocaleString('en-US', { timeZone: TIMEZONE });

      const embed = new EmbedBuilder()
        .setColor('#FF6B6B')
        .setTitle('⚔️ Boss Killed!')
        .setDescription(`**${bossName}** has been killed!`)
        .addFields(
          { name: 'Killed by', value: killedBy, inline: true },
          { name: 'Next spawn', value: `${nextSpawnTime} (GMT+8)`, inline: true },
          { name: 'Cooldown', value: `${boss.cooldown}h`, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'Boss Timer Bot' });

      await interaction.reply({ embeds: [embed] });

      // Disable the button
      const disabledButton = new ButtonBuilder()
        .setCustomId('disabled')
        .setLabel('Boss Killed')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true);

      const disabledRow = new ActionRowBuilder().addComponents(disabledButton);
      await interaction.editReply({ components: [disabledRow] });
    }
  } catch (error) {
    console.error('Error processing button interaction:', error);
    if (!interaction.replied) {
      await interaction.reply({ content: 'An error occurred while processing your interaction.', ephemeral: true });
    }
  }
});

// Bot ready event
client.once('ready', async () => {
  console.log(`✅ Bot is ready! Logged in as ${client.user.tag}`);
  console.log(`� Using prefix commands with: ${PREFIX}`);
  
  // Load persistent data
  loadBossData();
  loadActiveTimers();
  loadUpdateChannel();
  
  // Start hourly updates
  startHourlyUpdates();
  
  console.log('🔄 All systems loaded and ready!');
  console.log('📍 Timezone set to GMT+8 (Asia/Shanghai)');
});

// Error handling
client.on('error', error => {
  console.error('❌ Discord client error:', error);
});

client.on('shardError', error => {
  console.error('❌ A websocket connection encountered an error:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Create HTTP server for deployment
const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Discord Boss Timer Bot is running!');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌐 HTTP server running on port ${PORT}`);
});

// Login to Discord
console.log('🔑 Attempting to login to Discord...');
console.log('🌍 Environment:', {
  nodeVersion: process.version,
  platform: process.platform,
  env: process.env.NODE_ENV || 'development'
});

client.login(TOKEN).then(() => {
  console.log('✅ Discord login promise resolved');
}).catch(error => {
  console.error('❌ Failed to login to Discord:');
  console.error('Error type:', typeof error);
  console.error('Error name:', error.name);
  console.error('Error message:', error.message);
  console.error('Error code:', error.code);
  console.error('Stack trace:', error.stack);
  process.exit(1);
});