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
console.log('🔍 Token length:', TOKEN.length);
console.log('🔍 Token starts with:', TOKEN.substring(0, 10) + '...');

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

// Storage for boss information and active timers
const bossData = {};
const activeTimers = {};

// Storage for update channel settings
let updateChannel = null;

// Default timezone UTC+8
const TIMEZONE = 'Asia/Shanghai';

// File paths for persistent storage
const BOSS_DATA_FILE = path.join(__dirname, 'boss-data.json');
const ACTIVE_TIMERS_FILE = path.join(__dirname, 'active-boss-timers.json');
const CHANNEL_FILE = path.join(__dirname, 'update-channel.json');

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
    fs.writeFileSync(CHANNEL_FILE, JSON.stringify(channelData, null, 2));
    console.log('✅ Update channel saved');
  } catch (error) {
    console.error('❌ Error saving update channel:', error);
  }
}

function loadUpdateChannel() {
  try {
    if (fs.existsSync(CHANNEL_FILE)) {
      const channelData = JSON.parse(fs.readFileSync(CHANNEL_FILE, 'utf8'));
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
    clearTimeout(activeTimers[bossName].alert15);
    clearTimeout(activeTimers[bossName].alert5);
  }
  
  // Create new timer
  activeTimers[bossName] = {
    timer: setTimeout(() => handleBossSpawn(bossName, channelId, guildId), timeUntilSpawn),
    spawnTime: spawnTime,
    channelId: channelId,
    guildId: guildId,
    killedBy: killedBy
  };
  
  // Set up alerts
  const fifteenMinAlert = timeUntilSpawn - (15 * 60 * 1000);
  const fiveMinAlert = timeUntilSpawn - (5 * 60 * 1000);
  
  if (fifteenMinAlert > 0) {
    activeTimers[bossName].alert15 = setTimeout(() => {
      sendAlert(bossName, '15 minutes', channelId);
    }, fifteenMinAlert);
  }
  
  if (fiveMinAlert > 0) {
    activeTimers[bossName].alert5 = setTimeout(() => {
      sendAlert(bossName, '5 minutes', channelId);
    }, fiveMinAlert);
  }
  
  saveActiveTimers();
}

function sendAlert(bossName, timeLeft, channelId) {
  try {
    const channel = client.channels.cache.get(channelId);
    if (channel && bossData[bossName]) {
      const embed = new EmbedBuilder()
        .setColor('#FF6B6B')
        .setTitle('🚨 Boss Alert!')
        .setDescription(`**${bossName}** will spawn in **${timeLeft}**!`)
        .addFields(
          { name: 'Respawn Time', value: bossData[bossName].respawnTime, inline: true },
          { name: 'Downtime', value: `${bossData[bossName].downtime}h`, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'Boss Timer Bot' });
      
      channel.send({ content: '@everyone', embeds: [embed] });
    }
  } catch (error) {
    console.error('Error sending alert:', error);
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
          { name: 'Downtime', value: `${bossData[bossName].downtime}h`, inline: true }
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

// Generate boss status embed
function getBossEmbed() {
  const embed = new EmbedBuilder()
    .setColor('#0099FF')
    .setTitle('👑 Boss Status')
    .setTimestamp()
    .setFooter({ text: 'Boss Timer Bot' });

  if (Object.keys(bossData).length === 0) {
    embed.setDescription('No bosses configured. Use `!setboss` to add bosses.');
    return embed;
  }

  let description = '';
  const now = Date.now();

  Object.keys(bossData).forEach(bossName => {
    const boss = bossData[bossName];
    description += `**${bossName}**\n`;
    description += `📅 Respawn Time: ${boss.respawnTime}\n`;
    description += `⏱️ Downtime: ${boss.downtime}h\n`;
    
    if (activeTimers[bossName]) {
      const timeLeft = activeTimers[bossName].spawnTime - now;
      if (timeLeft > 0) {
        const hours = Math.floor(timeLeft / (1000 * 60 * 60));
        const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
        
        description += `🔴 **ACTIVE**: ${hours}h ${minutes}m ${seconds}s until spawn\n`;
        const spawnTime = new Date(activeTimers[bossName].spawnTime).toLocaleString('en-US', { timeZone: TIMEZONE });
        description += `📍 Spawns at: ${spawnTime} (UTC+8)\n`;
        
        if (activeTimers[bossName].killedBy) {
          description += `⚔️ Last killed by: ${activeTimers[bossName].killedBy}\n`;
        }
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
      const embed = getBossEmbed();
      embed.setTitle('🔄 Hourly Boss Update');
      updateChannel.send({ embeds: [embed] });
    }
  }, 60 * 60 * 1000); // Every hour
}

// Message handler
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith('!')) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  try {
    // !setboss - Add boss information
    if (command === 'setboss') {
      if (args.length < 3) {
        return message.channel.send('Format: `!setboss [Boss name] [Respawn time] [Downtime hours]`\nExample: `!setboss Dragon 16:30 2`');
      }

      const bossName = args[0];
      const respawnTime = args[1];
      const downtime = parseFloat(args[2]);

      // Validate respawn time format
      const timeMatch = respawnTime.match(/^(\d{1,2}):(\d{2})$/);
      if (!timeMatch) {
        return message.channel.send('Please use HH:MM format for respawn time (e.g., 16:30)');
      }

      const hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2]);

      if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        return message.channel.send('Please provide a valid time in 24-hour format (00:00 to 23:59)');
      }

      if (isNaN(downtime) || downtime <= 0) {
        return message.channel.send('Please provide a valid downtime in hours (e.g., 2, 2.5, 10)');
      }

      // Store boss data
      bossData[bossName] = {
        respawnTime: respawnTime,
        downtime: downtime,
        addedBy: message.author.username,
        addedAt: new Date().toISOString()
      };

      saveBossData();

      const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('✅ Boss Added')
        .setDescription(`**${bossName}** has been configured`)
        .addFields(
          { name: 'Respawn Time', value: respawnTime, inline: true },
          { name: 'Downtime', value: `${downtime}h`, inline: true },
          { name: 'Added by', value: message.author.username, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'Boss Timer Bot' });

      return message.channel.send({ embeds: [embed] });
    }

    // !boss - Check all boss details
    if (command === 'boss') {
      const embed = getBossEmbed();
      return message.channel.send({ embeds: [embed] });
    }

    // !delete - Delete boss information
    if (command === 'delete') {
      if (args.length === 0) {
        return message.channel.send('Format: `!delete [Boss name]`\nExample: `!delete Dragon`');
      }

      const bossName = args[0];

      if (!bossData[bossName]) {
        return message.channel.send(`Boss **${bossName}** not found.`);
      }

      // Clear active timer if any
      if (activeTimers[bossName]) {
        clearTimeout(activeTimers[bossName].timer);
        if (activeTimers[bossName].alert15) clearTimeout(activeTimers[bossName].alert15);
        if (activeTimers[bossName].alert5) clearTimeout(activeTimers[bossName].alert5);
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

      return message.channel.send({ embeds: [embed] });
    }

    // !setchannel - Set channel for hourly updates
    if (command === 'setchannel') {
      updateChannel = message.channel;
      saveUpdateChannel();
      
      const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('✅ Update Channel Set')
        .setDescription(`Hourly boss updates will be sent to ${message.channel}`)
        .setTimestamp()
        .setFooter({ text: 'Boss Timer Bot' });
      
      return message.channel.send({ embeds: [embed] });
    }

  } catch (error) {
    console.error('Error processing command:', error);
    message.channel.send('An error occurred while processing your command.');
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
      const downtimeMs = boss.downtime * 60 * 60 * 1000;

      // Start new timer
      startBossTimer(bossName, downtimeMs, interaction.channelId, interaction.guildId, killedBy);

      const nextSpawnTime = new Date(Date.now() + downtimeMs).toLocaleString('en-US', { timeZone: TIMEZONE });

      const embed = new EmbedBuilder()
        .setColor('#FF6B6B')
        .setTitle('⚔️ Boss Killed!')
        .setDescription(`**${bossName}** has been killed!`)
        .addFields(
          { name: 'Killed by', value: killedBy, inline: true },
          { name: 'Next spawn', value: `${nextSpawnTime} (UTC+8)`, inline: true },
          { name: 'Downtime', value: `${boss.downtime}h`, inline: true }
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
    console.error('Error handling button interaction:', error);
    if (!interaction.replied) {
      interaction.reply({ content: 'An error occurred while processing the button click.', ephemeral: true });
    }
  }
});

// Bot ready event
client.once('ready', () => {
  console.log(`✅ Bot is ready! Logged in as ${client.user.tag}`);
  
  // Load persistent data
  loadBossData();
  loadActiveTimers();
  loadUpdateChannel();
  
  // Start hourly updates
  startHourlyUpdates();
  
  console.log('🔄 All systems loaded and ready!');
  console.log('📍 Timezone set to UTC+8 (Asia/Shanghai)');
});

// Error handling
client.on('error', error => {
  console.error('Discord client error:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Create HTTP server for Render.com
const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Boss Timer Bot is running!');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌐 HTTP server running on port ${PORT}`);
});

// Login to Discord
console.log('🔑 Attempting to login to Discord...');
client.login(TOKEN).catch(error => {
  console.error('❌ Failed to login to Discord:', error.message);
  console.error('Full error:', error);
  process.exit(1);
});
