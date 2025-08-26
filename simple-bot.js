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

// Storage for active boss timers
const bossTimers = {};

// Storage for boss duration settings (remembered across kills)
const bossDurations = {};

// Storage for user timezone setting (default to GMT+8)
let userTimezone = 'Asia/Shanghai';

// Storage for channel settings
let timerChannel = null;

// File paths for persistent storage
const ACTIVE_TIMERS_FILE = path.join(__dirname, 'active-timers.json');
const BOSS_DURATIONS_FILE = path.join(__dirname, 'boss-durations.json');
const TIMEZONE_FILE = path.join(__dirname, 'user-timezone.json');
const CHANNEL_FILE = path.join(__dirname, 'timer-channel.json');

// Persistent storage functions
function saveActiveTimers() {
  try {
    const timersToSave = {};
    Object.keys(bossTimers).forEach(bossName => {
      const timer = bossTimers[bossName];
      timersToSave[bossName] = {
        endTime: timer.endTime,
        duration: timer.duration,
        channelId: timer.channelId,
        guildId: timer.guildId
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
      const now = Date.now();
      
      Object.keys(savedTimers).forEach(bossName => {
        const savedTimer = savedTimers[bossName];
        if (savedTimer.endTime > now) {
          // Timer is still active, recreate it
          const timeLeft = savedTimer.endTime - now;
          
          bossTimers[bossName] = {
            timer: setTimeout(() => {
              handleTimerExpiry(bossName, savedTimer);
            }, timeLeft),
            endTime: savedTimer.endTime,
            duration: savedTimer.duration,
            channelId: savedTimer.channelId,
            guildId: savedTimer.guildId
          };
          
          // Set up alert timers
          setupAlertTimers(bossName, savedTimer.endTime, savedTimer.channelId, savedTimer.guildId);
          
          console.log(`✅ Restored timer for ${bossName} (${Math.round(timeLeft / 60000)} minutes left)`);
        }
      });
      
      console.log(`✅ Loaded ${Object.keys(bossTimers).length} active timers`);
    }
  } catch (error) {
    console.error('❌ Error loading active timers:', error);
  }
}

function saveBossDurations() {
  try {
    fs.writeFileSync(BOSS_DURATIONS_FILE, JSON.stringify(bossDurations, null, 2));
    console.log('✅ Boss durations saved');
  } catch (error) {
    console.error('❌ Error saving boss durations:', error);
  }
}

function loadBossDurations() {
  try {
    if (fs.existsSync(BOSS_DURATIONS_FILE)) {
      const savedDurations = JSON.parse(fs.readFileSync(BOSS_DURATIONS_FILE, 'utf8'));
      Object.assign(bossDurations, savedDurations);
      console.log(`✅ Loaded ${Object.keys(bossDurations).length} boss duration settings`);
    }
  } catch (error) {
    console.error('❌ Error loading boss durations:', error);
  }
}

function saveTimezone() {
  try {
    fs.writeFileSync(TIMEZONE_FILE, JSON.stringify({ timezone: userTimezone }, null, 2));
    console.log('✅ Timezone saved');
  } catch (error) {
    console.error('❌ Error saving timezone:', error);
  }
}

function loadTimezone() {
  try {
    if (fs.existsSync(TIMEZONE_FILE)) {
      const savedTimezone = JSON.parse(fs.readFileSync(TIMEZONE_FILE, 'utf8'));
      userTimezone = savedTimezone.timezone || 'Asia/Shanghai';
      console.log(`✅ Loaded timezone: ${userTimezone}`);
    }
  } catch (error) {
    console.error('❌ Error loading timezone:', error);
  }
}

function saveTimerChannel() {
  try {
    const channelData = timerChannel ? { channelId: timerChannel.id, guildId: timerChannel.guild.id } : null;
    fs.writeFileSync(CHANNEL_FILE, JSON.stringify(channelData, null, 2));
    console.log('✅ Timer channel saved');
  } catch (error) {
    console.error('❌ Error saving timer channel:', error);
  }
}

function loadTimerChannel() {
  try {
    if (fs.existsSync(CHANNEL_FILE)) {
      const channelData = JSON.parse(fs.readFileSync(CHANNEL_FILE, 'utf8'));
      if (channelData && channelData.channelId) {
        client.channels.fetch(channelData.channelId).then(channel => {
          timerChannel = channel;
          console.log(`✅ Timer channel loaded: #${channel.name}`);
        }).catch(error => {
          console.error('❌ Error fetching saved timer channel:', error);
        });
      }
    }
  } catch (error) {
    console.error('❌ Error loading timer channel:', error);
  }
}

// Alert system functions
function setupAlertTimers(bossName, endTime, channelId, guildId) {
  const now = Date.now();
  const timeLeft = endTime - now;
  
  // 15 minute alert
  const fifteenMinAlert = timeLeft - (15 * 60 * 1000);
  if (fifteenMinAlert > 0) {
    setTimeout(() => {
      sendAlert(bossName, '15 minutes', channelId, guildId);
    }, fifteenMinAlert);
  }
  
  // 5 minute alert
  const fiveMinAlert = timeLeft - (5 * 60 * 1000);
  if (fiveMinAlert > 0) {
    setTimeout(() => {
      sendAlert(bossName, '5 minutes', channelId, guildId);
    }, fiveMinAlert);
  }
}

function sendAlert(bossName, timeLeft, channelId, guildId) {
  try {
    const channel = client.channels.cache.get(channelId);
    if (channel) {
      const embed = new EmbedBuilder()
        .setColor('#FF6B6B')
        .setTitle('🚨 Boss Timer Alert!')
        .setDescription(`**${bossName}** will respawn in **${timeLeft}**!`)
        .setTimestamp()
        .setFooter({ text: 'Boss Timer Bot' });
      
      channel.send({ content: '@everyone', embeds: [embed] });
    }
  } catch (error) {
    console.error('Error sending alert:', error);
  }
}

function handleTimerExpiry(bossName, timerData) {
  try {
    const channel = client.channels.cache.get(timerData.channelId);
    if (channel) {
      const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('⚔️ Boss Spawned!')
        .setDescription(`**${bossName}** has spawned!`)
        .setTimestamp()
        .setFooter({ text: 'Boss Timer Bot' });
      
      const killedButton = new ButtonBuilder()
        .setCustomId(`killed:${bossName}`)
        .setLabel(`${bossName} Killed`)
        .setStyle(ButtonStyle.Success);
      const killedRow = new ActionRowBuilder().addComponents(killedButton);
      
      channel.send({ 
        content: '@everyone', 
        embeds: [embed], 
        components: [killedRow] 
      });
    }
    
    // Clean up the timer from storage
    delete bossTimers[bossName];
    saveActiveTimers();
  } catch (error) {
    console.error('Error in timer expiry:', error);
    delete bossTimers[bossName];
    saveActiveTimers();
  }
}

// Timer display functions
function getTimerEmbed() {
  const embed = new EmbedBuilder()
    .setColor('#0099FF')
    .setTitle('🕐 Active Boss Timers')
    .setTimestamp()
    .setFooter({ text: 'Boss Timer Bot' });

  if (Object.keys(bossTimers).length === 0) {
    embed.setDescription('No active timers');
    return embed;
  }

  const now = Date.now();
  let description = '';

  Object.keys(bossTimers).forEach(bossName => {
    const timer = bossTimers[bossName];
    const timeLeft = timer.endTime - now;
    
    if (timeLeft > 0) {
      const hours = Math.floor(timeLeft / (1000 * 60 * 60));
      const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
      
      const respawnTime = new Date(timer.endTime).toLocaleString('en-US', { timeZone: userTimezone });
      
      description += `**${bossName}**\n`;
      description += `⏰ ${hours}h ${minutes}m ${seconds}s\n`;
      description += `📅 Respawn: ${respawnTime}\n\n`;
    }
  });

  if (description === '') {
    embed.setDescription('No active timers');
  } else {
    embed.setDescription(description);
  }

  return embed;
}

// Hourly update system
function startHourlyUpdates() {
  setInterval(() => {
    if (timerChannel && Object.keys(bossTimers).length > 0) {
      const embed = getTimerEmbed();
      embed.setTitle('🔄 Hourly Timer Update');
      timerChannel.send({ embeds: [embed] });
    }
  }, 60 * 60 * 1000); // Every hour
}

// Boss timer creation function
function startBossTimer(context, bossName, hours, isReset = false, cooldownDuration = null) {
  try {
    const endTime = Date.now() + (hours * 60 * 60 * 1000);

    // Clear existing timer if any
    if (bossTimers[bossName]) {
      clearTimeout(bossTimers[bossName].timer);
    }

    // Store cooldown duration preference (only if provided)
    if (cooldownDuration !== null) {
      bossDurations[bossName] = cooldownDuration;
      saveBossDurations();
    }

    // Create new timer
    bossTimers[bossName] = {
      timer: setTimeout(() => {
        handleTimerExpiry(bossName, {
          channelId: context.channelId || context.channel.id,
          guildId: context.guildId || context.guild.id
        });
      }, hours * 60 * 60 * 1000),
      endTime: endTime,
      duration: hours,
      channelId: context.channelId || context.channel.id,
      guildId: context.guildId || context.guild.id
    };

    // Set up alert timers
    setupAlertTimers(bossName, endTime, context.channelId || context.channel.id, context.guildId || context.guild.id);

    // Save the new timer state
    saveActiveTimers();

    const userTimeString = new Date(endTime).toLocaleString('en-US', { timeZone: userTimezone });
    
    // Create reset button
    const button = new ButtonBuilder()
      .setCustomId(`reset:${bossName}`)
      .setLabel(`Reset ${bossName}`)
      .setStyle(ButtonStyle.Primary);
    const row = new ActionRowBuilder().addComponents(button);

    // Display cooldown duration if available, otherwise show time remaining
    const displayDuration = cooldownDuration || hours;
    const durationText = cooldownDuration ? `${cooldownDuration}h cooldown` : `${hours.toFixed(1)}h remaining`;

    const embed = new EmbedBuilder()
      .setColor(isReset ? '#FFA500' : '#00FF00')
      .setTitle(isReset ? '🔄 Timer Reset' : '⏳ Timer Started')
      .setDescription(`**${bossName}** timer set - ${durationText}`)
      .addFields(
        { name: 'Respawn Time', value: userTimeString, inline: true },
        { name: 'Time Until Respawn', value: `${hours.toFixed(1)} hours`, inline: true }
      )
      .setTimestamp()
      .setFooter({ text: 'Boss Timer Bot' });

    // Send response based on context type
    if (context.reply && !context.replied) {
      context.reply({ embeds: [embed], components: [row] });
    } else if (context.followUp && context.replied) {
      context.followUp({ embeds: [embed], components: [row] });
    } else {
      context.channel.send({ embeds: [embed], components: [row] });
    }
  } catch (error) {
    console.error('Error in startBossTimer:', error);
  }
}

// Message handler
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith('!')) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  try {
    // !commands - Show available commands
    if (command === 'commands') {
      const embed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle('📋 Available Commands')
        .setDescription([
          '`!timer` - Check active timers manually',
          '`!set [boss name] [hours from now]` - Set a timer (hours from current time)',
          '`!update [boss name] [respawn time]` - Update timer information',
          '`!delete [boss name]` - Delete a specific timer',
          '`!commands` - Show this command guide',
          '`!setchannel` - Set channel for hourly updates',
          '`!timezone <timezone>` - Set your timezone',
          '`!status` - Show bot status'
        ].join('\n'))
        .addFields(
          { 
            name: 'Examples', 
            value: [
              '`!set Dragon 2` - Set Dragon to respawn in 2 hours from now',
              '`!set Venatus 10` - Set Venatus to respawn in 10 hours from now',
              '`!update Dragon 17:00` - Update Dragon respawn time to 17:00',
              '`!delete Dragon` - Remove Dragon timer'
            ].join('\n')
          }
        )
        .setTimestamp()
        .setFooter({ text: 'Boss Timer Bot' });
      
      return message.channel.send({ embeds: [embed] });
    }

    // !timer - Check timers manually
    if (command === 'timer') {
      const embed = getTimerEmbed();
      return message.channel.send({ embeds: [embed] });
    }

    // !set - Set timer with format [boss name] [hours from now]
    if (command === 'set') {
      if (args.length < 2) {
        return message.channel.send('Format: `!set [boss name] [hours from now]`\nExample: `!set Dragon 2`');
      }

      const bossName = args[0];
      const hoursFromNow = parseFloat(args[1]);

      if (isNaN(hoursFromNow) || hoursFromNow <= 0) {
        return message.channel.send('Please provide a valid number of hours (e.g., 2, 2.5, 10).');
      }

      // Simply use the hours from now as the timer duration
      startBossTimer(message, bossName, hoursFromNow, false, hoursFromNow);
      return;
    }

    // !update - Update timer information
    if (command === 'update') {
      if (args.length < 2) {
        return message.channel.send('Format: `!update [boss name] [respawn time]`\nExample: `!update Dragon 17:00`');
      }

      const bossName = args[0];
      const respawnTimeInput = args[1];

      if (!bossTimers[bossName]) {
        return message.channel.send(`No active timer found for ${bossName}. Use \`!set\` to create a new timer.`);
      }

      // Parse respawn time (HH:MM format)
      const timeMatch = respawnTimeInput.match(/^(\d{1,2}):(\d{2})$/);
      if (!timeMatch) {
        return message.channel.send('Please use HH:MM format for respawn time (e.g., 17:00)');
      }

      const hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2]);

      if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        return message.channel.send('Please provide a valid time in 24-hour format (00:00 to 23:59)');
      }

      // Calculate when the timer should end using user's timezone
      const now = new Date();
      
      // Get current time in user's timezone for comparison
      const nowInUserTZ = new Date(now.toLocaleString('en-US', { timeZone: userTimezone }));
      
      // Create respawn time in user's timezone (today)
      const todayStr = now.toLocaleDateString('en-CA', { timeZone: userTimezone }); // YYYY-MM-DD format
      const respawnTime = new Date(`${todayStr}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`);
      
      // If the respawn time is in the past, assume it's tomorrow
      if (respawnTime <= nowInUserTZ) {
        respawnTime.setDate(respawnTime.getDate() + 1);
      }
      
      // Calculate time until respawn
      const respawnTimeUTC = new Date(respawnTime.getTime() - (respawnTime.getTimezoneOffset() * 60000));
      const timeUntilRespawn = (respawnTimeUTC.getTime() - Date.now()) / (1000 * 60 * 60);

      if (timeUntilRespawn <= 0) {
        return message.channel.send(`${bossName} respawn time has already passed! Please check your time.\nRespawn: ${respawnTime.toLocaleString('en-US', { timeZone: userTimezone })}\nCurrent: ${now.toLocaleString('en-US', { timeZone: userTimezone })}`);
      }

      startBossTimer(message, bossName, timeUntilRespawn, true);
      return;
    }

    // !delete - Delete a specific timer
    if (command === 'delete') {
      if (args.length === 0) {
        return message.channel.send('Format: `!delete [boss name]`\nExample: `!delete Dragon`');
      }

      const bossName = args[0];

      if (!bossTimers[bossName]) {
        return message.channel.send(`No active timer found for ${bossName}.`);
      }

      clearTimeout(bossTimers[bossName].timer);
      delete bossTimers[bossName];
      saveActiveTimers();

      const embed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('🗑️ Timer Deleted')
        .setDescription(`Timer for **${bossName}** has been deleted.`)
        .setTimestamp()
        .setFooter({ text: 'Boss Timer Bot' });

      return message.channel.send({ embeds: [embed] });
    }

    // !setchannel - Set channel for hourly updates
    if (command === 'setchannel') {
      timerChannel = message.channel;
      saveTimerChannel();
      
      const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('✅ Channel Set')
        .setDescription(`This channel will now receive hourly timer updates.`)
        .setTimestamp()
        .setFooter({ text: 'Boss Timer Bot' });

      return message.channel.send({ embeds: [embed] });
    }

    // !timezone - Set timezone
    if (command === 'timezone') {
      const timezone = args.join(' ');
      
      if (!timezone) {
        return message.channel.send(`Current timezone: **${userTimezone}**\n\nTo set timezone: \`!timezone <timezone>\`\nExamples:\n- \`!timezone America/New_York\`\n- \`!timezone Europe/London\`\n- \`!timezone Asia/Tokyo\`\n- \`!timezone UTC\``);
      }
      
      try {
        // Test if timezone is valid
        new Date().toLocaleString('en-US', { timeZone: timezone });
        userTimezone = timezone;
        saveTimezone();
        
        const now = new Date();
        const userTime = now.toLocaleString('en-US', { timeZone: userTimezone });
        
        return message.channel.send(`✅ Timezone set to **${userTimezone}**\nCurrent time in your timezone: ${userTime}`);
      } catch (error) {
        return message.channel.send(`❌ Invalid timezone: **${timezone}**\n\nPlease use a valid timezone like:\n- America/New_York\n- Europe/London\n- Asia/Tokyo\n- UTC`);
      }
    }

    // !status - Show bot status
    if (command === 'status') {
      const uptime = process.uptime();
      const uptimeHours = Math.floor(uptime / 3600);
      const uptimeMinutes = Math.floor((uptime % 3600) / 60);
      const uptimeSeconds = Math.floor(uptime % 60);
      
      const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('🤖 Bot Status')
        .addFields(
          { name: 'Status', value: '✅ Online', inline: true },
          { name: 'Uptime', value: `${uptimeHours}h ${uptimeMinutes}m ${uptimeSeconds}s`, inline: true },
          { name: 'Active Timers', value: Object.keys(bossTimers).length.toString(), inline: true },
          { name: 'Timezone', value: userTimezone, inline: true },
          { name: 'Update Channel', value: timerChannel ? `#${timerChannel.name}` : 'Not set', inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'Boss Timer Bot' });

      return message.channel.send({ embeds: [embed] });
    }

  } catch (error) {
    console.error('Error handling message:', error);
    message.channel.send('❌ An error occurred while processing your command. Please try again.');
  }
});

// Button interaction handler
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  try {
    const [action, bossName] = interaction.customId.split(':');

    if (action === 'reset') {
      const duration = bossDurations[bossName] || 1;
      await interaction.deferReply();
      startBossTimer(interaction, bossName, duration, true);
    } else if (action === 'killed') {
      const duration = bossDurations[bossName] || 1;
      await interaction.deferReply();
      startBossTimer(interaction, bossName, duration);
    }
  } catch (error) {
    console.error('Error handling button interaction:', error);
    if (!interaction.replied && !interaction.deferred) {
      interaction.reply({ content: '❌ An error occurred. Please try again.', ephemeral: true });
    }
  }
});

// Bot ready event
client.once('ready', () => {
  console.log(`✅ Bot is ready! Logged in as ${client.user.tag}`);
  
  // Load persistent data
  loadTimezone();
  loadBossDurations();
  loadActiveTimers();
  loadTimerChannel();
  
  // Start hourly updates
  startHourlyUpdates();
  
  console.log('🔄 All systems loaded and ready!');
});

// Login to Discord
console.log('🔑 Attempting to login to Discord...');
client.login(TOKEN).catch(error => {
  console.error('❌ Failed to login to Discord:', error.message);
  console.error('Full error:', error);
  process.exit(1);
});

console.log('🎯 Discord login initiated...');

// Keep the service alive on Render (for free tier)
const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Discord Timer Bot is running!');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌐 HTTP server running on port ${PORT}`);
});

// Error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

console.log('🚀 Starting Discord Timer Bot...');
