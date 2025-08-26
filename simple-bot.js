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
  ActionRowBuilder 
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

// Storage for user timezone setting (default to UTC)
let userTimezone = 'UTC';

// File paths for persistent storage
const ACTIVE_TIMERS_FILE = path.join(__dirname, 'active-timers.json');
const BOSS_DURATIONS_FILE = path.join(__dirname, 'boss-durations.json');

// Save active timers to file
function saveActiveTimers() {
  try {
    const timersToSave = {};
    for (const [bossName, timerData] of Object.entries(bossTimers)) {
      timersToSave[bossName] = {
        endTime: timerData.endTime,
        duration: timerData.duration
      };
    }
    fs.writeFileSync(ACTIVE_TIMERS_FILE, JSON.stringify(timersToSave, null, 2));
    fs.writeFileSync(BOSS_DURATIONS_FILE, JSON.stringify(bossDurations, null, 2));
    console.log('💾 Active timers saved to file');
  } catch (error) {
    console.error('❌ Error saving active timers:', error);
  }
}

// Load and restore active timers from file
function loadActiveTimers() {
  try {
    // Load boss durations
    if (fs.existsSync(BOSS_DURATIONS_FILE)) {
      const durationsData = fs.readFileSync(BOSS_DURATIONS_FILE, 'utf8');
      Object.assign(bossDurations, JSON.parse(durationsData));
    }

    // Load active timers
    if (fs.existsSync(ACTIVE_TIMERS_FILE)) {
      const data = fs.readFileSync(ACTIVE_TIMERS_FILE, 'utf8');
      const savedTimers = JSON.parse(data);
      
      let restoredCount = 0;
      for (const [bossName, timerData] of Object.entries(savedTimers)) {
        const timeRemaining = timerData.endTime - Date.now();
        
        if (timeRemaining > 0) {
          // Timer is still active, restore it
          bossTimers[bossName] = {
            timeout: setTimeout(() => {
              // Timer finished - boss is spawning
              console.log(`⚔️ ${bossName} is spawning now! (restored timer)`);
              delete bossTimers[bossName];
              saveActiveTimers();
            }, timeRemaining),
            endTime: timerData.endTime,
            duration: timerData.duration
          };
          restoredCount++;
        }
      }
      
      if (restoredCount > 0) {
        console.log(`✅ Restored ${restoredCount} active timer(s)`);
      }
    }
  } catch (error) {
    console.error('❌ Error loading active timers:', error);
  }
}

// Load active timers on startup
loadActiveTimers();

// Message handler
client.on('messageCreate', async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  const content = message.content.trim();
  
  // Only process messages that start with !
  if (!content.startsWith('!')) return;

  const args = content.slice(1).split(' ');
  const command = args.shift().toLowerCase();

  try {
    // Help command
    if (command === 'commands') {
      const commands = [
        '`!boss <hours> <BossName>` - Start a timer for a boss',
        '`!set HH:MM [hours] <BossName>` - Set timer to specific time (24h format)',
        '`!update <hours> <BossName>` - Update an existing timer',
        '`!timer` - Show all active timers with reset buttons',
        '`!delete <BossName>` - Delete a specific timer',
        '`!status` - Show bot uptime and persistent timer status',
        '`!timezone <timezone>` - Set your timezone (e.g. Asia/Singapore)',
        '`!time` - Show current server time and your timezone',
        '`!commands` - Show this help message'
      ];
      
      return message.channel.send(`**Available Commands:**\n${commands.join('\n')}`);
    }

    // Set timezone command
    if (command === 'timezone') {
      const timezone = args.join(' ');
      
      if (!timezone) {
        return message.channel.send(`Current timezone: **${userTimezone}**\n\nTo set timezone: \`!timezone <timezone>\`\nExamples:\n- \`!timezone America/New_York\`\n- \`!timezone Europe/London\`\n- \`!timezone Asia/Tokyo\`\n- \`!timezone UTC\``);
      }
      
      try {
        // Test if timezone is valid
        new Date().toLocaleString('en-US', { timeZone: timezone });
        userTimezone = timezone;
        
        const now = new Date();
        const userTime = now.toLocaleString('en-US', { timeZone: userTimezone });
        
        return message.channel.send(`✅ Timezone set to **${userTimezone}**\nCurrent time in your timezone: ${userTime}`);
      } catch (error) {
        return message.channel.send(`❌ Invalid timezone: **${timezone}**\n\nPlease use a valid timezone like:\n- America/New_York\n- Europe/London\n- Asia/Tokyo\n- UTC`);
      }
    }

    // Debug time command
    if (command === 'time') {
      const now = new Date();
      const utc = now.toUTCString();
      const userTime = now.toLocaleString('en-US', { timeZone: userTimezone });
      const serverLocal = now.toLocaleString();
      
      return message.channel.send(`**Time Debug:**\n- Your Time (${userTimezone}): ${userTime}\n- Server UTC: ${utc}\n- Server Local: ${serverLocal}`);
    }

    // Boss timer command
    if (command === 'boss') {
      const hours = parseFloat(args[0]);
      const bossName = args.slice(1).join(' ');
      
      if (isNaN(hours) || hours <= 0) {
        return message.channel.send('Please provide valid hours. Format: `!boss <hours> <BossName>`');
      }
      
      if (!bossName) {
        return message.channel.send('Please provide a boss name. Format: `!boss <hours> <BossName>`');
      }
      
      startBossTimer(message, bossName, hours);
    }

    // Display all active timers
    if (command === 'timer') {
      if (Object.keys(bossTimers).length === 0) {
        return message.channel.send('No active boss timers.');
      }
      displayTimers(message);
    }

    // Show bot status and persistence info
    if (command === 'status') {
      const uptime = process.uptime();
      const uptimeHours = Math.floor(uptime / 3600);
      const uptimeMinutes = Math.floor((uptime % 3600) / 60);
      const uptimeSeconds = Math.floor(uptime % 60);
      
      const activeTimerCount = Object.keys(bossTimers).length;
      const savedDurationCount = Object.keys(bossDurations).length;
      
      const statusInfo = [
        `**Bot Status:**`,
        `⏱️ Uptime: ${uptimeHours}h ${uptimeMinutes}m ${uptimeSeconds}s`,
        `🔄 Active Timers: ${activeTimerCount}`,
        `💾 Saved Durations: ${savedDurationCount}`,
        `🌐 Timezone: ${userTimezone}`,
        `🗄️ Persistent Storage: ✅ Enabled`,
        ``,
        `*Timers will survive bot restarts and redeploys!*`
      ];
      
      return message.channel.send(statusInfo.join('\n'));
    }

    // Set timer based on respawn time
    if (command === 'set') {
      const timeString = args[0];
      let respawnHours = parseFloat(args[1]);
      let bossName;
      
      // Check if second argument is hours or part of boss name
      if (!isNaN(respawnHours) && respawnHours > 0) {
        // Format: !set HH:MM <hours> <BossName>
        bossName = args.slice(2).join(' ') || 'Boss';
      } else {
        // Format: !set HH:MM <BossName>
        respawnHours = null;
        bossName = args.slice(1).join(' ') || 'Boss';
      }

      if (!timeString || !timeString.includes(':')) {
        return message.channel.send('Format: `!set HH:MM [hours] BossName` (24-hour time for respawn, optional hours for respawn duration)');
      }

      const [hourStr, minuteStr] = timeString.split(':');
      const hour = parseInt(hourStr);
      const minute = parseInt(minuteStr);

      if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        return message.channel.send('Invalid time. Use 24-hour format: `HH:MM`');
      }

      // Set the respawn time directly in user's timezone
      const now = new Date();
      
      // Get current time in user's timezone
      const nowInUserTz = new Date(now.toLocaleString('en-US', { timeZone: userTimezone }));
      
      // Create target time in user's timezone
      const targetTime = new Date(nowInUserTz);
      targetTime.setHours(hour, minute, 0, 0);
      
      // If the time is in the past in user's timezone, assume it's for tomorrow
      if (targetTime.getTime() <= nowInUserTz.getTime()) {
        targetTime.setDate(targetTime.getDate() + 1);
      }
      
      // Calculate the difference and add it to current UTC time
      const timeDifference = targetTime.getTime() - nowInUserTz.getTime();
      const endTime = Date.now() + timeDifference;
      
      // Use provided hours for future respawns, or calculate current duration for this specific countdown
      const storedDuration = respawnHours || Math.ceil((endTime - Date.now()) / 3600000);
      
      // Store the duration for future use (when boss is killed)
      if (respawnHours) {
        storeDuration(bossName, respawnHours);
      }
      
      // Clear existing timer if present
      if (bossTimers[bossName]) {
        clearTimeout(bossTimers[bossName].timeout);
      }
      
      // Set up timer that shows "Boss Killed" button when it expires
      bossTimers[bossName] = {
        timeout: setTimeout(() => {
          // Create "Boss Killed" button for when boss spawns
          const killedButton = new ButtonBuilder()
            .setCustomId(`killed:${bossName}`)
            .setLabel(`Boss Killed`)
            .setStyle(ButtonStyle.Success);
          const killedRow = new ActionRowBuilder().addComponents(killedButton);
          
          message.channel.send({ 
            content: `⚔️ **${bossName}** is spawning now!`, 
            components: [killedRow] 
          });
          delete bossTimers[bossName];
        }, endTime - Date.now()),
        endTime: endTime,
        duration: storedDuration // Store the duration that will be used when killed
      };

      const durationText = respawnHours ? ` (${respawnHours}h respawn timer saved for next kill)` : '';
      
      // Create reset button for the spawn timer
      const resetButton = new ButtonBuilder()
        .setCustomId(`reset:${bossName}`)
        .setLabel(`Reset ${bossName}`)
        .setStyle(ButtonStyle.Primary);
      const resetRow = new ActionRowBuilder().addComponents(resetButton);
      
      const userTimeString = new Date(endTime).toLocaleString('en-US', { timeZone: userTimezone });
      
      return message.channel.send({
        content: `⏳ **${bossName}** timer set to spawn at ${timeString} in your timezone (${userTimeString})${durationText}`,
        components: [resetRow]
      });
    }

    // Update a boss timer duration
    if (command === 'update') {
      const hours = parseFloat(args[0]);
      const bossName = args.slice(1).join(' ');
      
      if (isNaN(hours) || hours <= 0) {
        return message.channel.send('Please provide a valid number of hours. Format: `!update <hours> <bossName>`');
      }
      
      if (!bossName) {
        return message.channel.send('Please provide a boss name. Format: `!update <hours> <bossName>`');
      }
      
      if (!bossTimers[bossName]) {
        return message.channel.send(`No active timer for **${bossName}**. Use \`!boss\` to start a new timer.`);
      }
      
      // Calculate new end time based on current time and new duration
      const newEndTime = Date.now() + (hours * 3600000);
      
      // Clear the existing timeout
      clearTimeout(bossTimers[bossName].timeout);
      
      // Update the timer with new duration and end time
      bossTimers[bossName] = {
        timeout: setTimeout(() => {
          // Create "Boss Killed" button for when boss spawns
          const killedButton = new ButtonBuilder()
            .setCustomId(`killed:${bossName}`)
            .setLabel(`Boss Killed`)
            .setStyle(ButtonStyle.Success);
          const killedRow = new ActionRowBuilder().addComponents(killedButton);
          
          message.channel.send({ 
            content: `⚔️ **${bossName}** is spawning now!`, 
            components: [killedRow] 
          });
          delete bossTimers[bossName];
        }, hours * 3600000),
        endTime: newEndTime,
        duration: hours
      };
      
      // Store the new duration for future use
      storeDuration(bossName, hours);
      
      const respawnTime = new Date(newEndTime).toLocaleString();
      
      // Create reset button
      const button = new ButtonBuilder()
        .setCustomId(`reset:${bossName}`)
        .setLabel(`Reset ${bossName}`)
        .setStyle(ButtonStyle.Primary);
      const row = new ActionRowBuilder().addComponents(button);
      
      return message.channel.send({ 
        content: `🔄 **${bossName}** timer updated to ${hours} hours. New respawn time: ${respawnTime}`, 
        components: [row] 
      });
    }

    // Delete a boss timer
    if (command === 'delete') {
      const bossName = args.join(' ');
      
      if (!bossTimers[bossName]) {
        return message.channel.send(`No active timer for **${bossName}**.`);
      }
      
      clearTimeout(bossTimers[bossName].timeout);
      delete bossTimers[bossName];
      saveActiveTimers(); // Save state after deletion
      return message.channel.send(`🗑️ Timer for **${bossName}** has been deleted.`);
    }

  } catch (err) {
    console.error(`Error executing command ${command}:`, err);
    message.channel.send("⚠️ An error occurred while running this command.");
  }
});

// Button interaction handler
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  
  try {
    const [action, bossName] = interaction.customId.split(':');

    if (action === 'reset') {
      if (!bossTimers[bossName]) {
        return interaction.reply({ 
          content: `No active timer for **${bossName}**.`, 
          ephemeral: true 
        });
      }
      
      clearTimeout(bossTimers[bossName].timeout);
      
      // Reply first, then start the timer
      await interaction.reply({
        content: `🔄 **${bossName}** timer reset by ${interaction.user.username}!`
      });
      
      // Start the timer after replying
      startBossTimer(interaction, bossName, bossTimers[bossName].duration, true);
    }
    
    if (action === 'killed') {
      // Check if interaction has already been replied to (prevent double-clicking)
      if (interaction.replied || interaction.deferred) {
        return;
      }
      
      // Get the stored duration for this boss (either from bossDurations or from current timer)
      let duration = getStoredDuration(bossName);
      
      // If no stored duration, check if there's a current timer with duration info
      if (!duration && bossTimers[bossName]) {
        duration = bossTimers[bossName].duration;
      }
      
      // Default to 2 hours if no duration is found
      if (!duration) {
        duration = 2;
      }
      
      // Reply first to prevent double-clicking
      await interaction.reply({
        content: `💀 **${bossName}** killed by ${interaction.user.username}! Timer restarted for ${duration} hours.`
      });
      
      // Start new timer for the killed boss
      startBossTimer(interaction, bossName, duration);
    }
  } catch (error) {
    console.error('Error in button interaction:', error);
    
    // Only reply if we haven't already replied
    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: '⚠️ An error occurred while processing this button.',
          ephemeral: true
        });
      } catch (replyError) {
        console.error('Error sending error reply:', replyError);
      }
    }
  }
});

/**
 * Get stored duration for a boss
 * @param {string} bossName - Name of the boss
 * @returns {number|null} - Duration in hours or null if not found
 */
function getStoredDuration(bossName) {
  return bossDurations[bossName] || null;
}

/**
 * Store duration for a boss
 * @param {string} bossName - Name of the boss
 * @param {number} hours - Duration in hours
 */
function storeDuration(bossName, hours) {
  bossDurations[bossName] = hours;
}

/**
 * Display all active boss timers with reset buttons
 * @param {Object} context - Message or interaction context
 */
function displayTimers(context) {
  let reply = '**Active Boss Timers:**\n';
  let buttons = [];

  for (const [boss, data] of Object.entries(bossTimers)) {
    const timeLeft = Math.ceil((data.endTime - Date.now()) / 60000);
    const hrsLeft = Math.floor(timeLeft / 60);
    const minsLeft = timeLeft % 60;
    const respawnTime = new Date(data.endTime).toLocaleString('en-US', { timeZone: userTimezone });

    reply += `- **${boss}**: ${hrsLeft}h ${minsLeft}m left (Respawn at ${respawnTime} ${userTimezone})\n`;

    const button = new ButtonBuilder()
      .setCustomId(`reset:${boss}`)
      .setLabel(`Reset ${boss}`)
      .setStyle(ButtonStyle.Primary);

    buttons.push(button);
  }

  // Discord allows max 5 components per action row and max 5 action rows
  // So we can have at most 25 buttons total, but let's limit to 5 buttons per message
  if (buttons.length > 5) {
    // If more than 5 timers, send message without buttons but with a note
    reply += `\n*Too many active timers to show reset buttons. Use \`!delete <bossName>\` to remove timers.*`;
    context.channel.send({ content: reply });
  } else {
    // Create action rows (max 5 buttons per row)
    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) {
      const row = new ActionRowBuilder().addComponents(buttons.slice(i, i + 5));
      rows.push(row);
    }
    context.channel.send({ content: reply, components: rows });
  }
}

/**
 * Start or reset a boss timer
 * @param {Object} context - Message or interaction context
 * @param {string} bossName - Name of the boss
 * @param {number} hours - Duration in hours
 * @param {boolean} isReset - Whether this is a reset operation
 * @param {number|null} customEndTime - Custom end time in milliseconds
 */
function startBossTimer(context, bossName, hours, isReset = false, customEndTime = null) {
  try {
    // Validate inputs
    if (!bossName || typeof bossName !== 'string') {
      console.error('Invalid boss name:', bossName);
      return;
    }
    
    if (!hours || isNaN(hours) || hours <= 0) {
      console.error('Invalid hours:', hours);
      return;
    }
    
    const endTime = customEndTime || (Date.now() + hours * 3600000);
    
    // Store the duration for future use
    storeDuration(bossName, hours);
    
    // Clear existing timer if present
    if (bossTimers[bossName]) {
      clearTimeout(bossTimers[bossName].timeout);
    }
    
    // Set up new timer
    bossTimers[bossName] = {
      timeout: setTimeout(() => {
        try {
          // Create "Boss Killed" button for when boss spawns
          const killedButton = new ButtonBuilder()
            .setCustomId(`killed:${bossName}`)
            .setLabel(`Boss Killed`)
            .setStyle(ButtonStyle.Success);
          const killedRow = new ActionRowBuilder().addComponents(killedButton);
          
          context.channel.send({ 
            content: `⚔️ **${bossName}** is spawning now!`, 
            components: [killedRow] 
          });
          
          // Clean up the timer from storage
          delete bossTimers[bossName];
          saveActiveTimers(); // Save state after timer expires
        } catch (error) {
          console.error('Error in timer callback:', error);
          // Still clean up the timer even if there's an error
          delete bossTimers[bossName];
          saveActiveTimers(); // Save state even on error
        }
      }, endTime - Date.now()),
      endTime: endTime,
      duration: hours
    };

    // Save the new timer state
    saveActiveTimers();

    const userTimeString = new Date(endTime).toLocaleString('en-US', { timeZone: userTimezone });
    
    // Create reset button
    const button = new ButtonBuilder()
      .setCustomId(`reset:${bossName}`)
      .setLabel(`Reset ${bossName}`)
      .setStyle(ButtonStyle.Primary);
    const row = new ActionRowBuilder().addComponents(button);

    // Prepare message content
    const msgContent = isReset
      ? `🔄 Timer for **${bossName}** reset for ${hours} hours (Respawn at ${userTimeString}).`
      : `⏳ Timer started for **${bossName}** (${hours} hours). Respawn at ${userTimeString}.`;

    // Send response based on context type
    if (context.reply && !context.replied) {
      context.reply({ content: msgContent, components: [row] });
    } else if (context.followUp && context.replied) {
      context.followUp({ content: msgContent, components: [row] });
    } else {
      context.channel.send({ content: msgContent, components: [row] });
    }
  } catch (error) {
    console.error('Error in startBossTimer:', error);
  }
}

// Bot ready event
client.once('ready', () => {
  console.log(`✅ Bot is ready! Logged in as ${client.user.tag}`);
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
