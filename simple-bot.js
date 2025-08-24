// Load environment variables
require('dotenv').config();

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
        '`!commands` - Show this help message'
      ];
      
      return message.channel.send(`**Available Commands:**\n${commands.join('\n')}`);
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

      // Set the respawn time directly
      const respawnTime = new Date();
      respawnTime.setHours(hour, minute, 0, 0);
      
      // If the time is in the past, assume it's for tomorrow
      if (respawnTime.getTime() <= Date.now()) {
        respawnTime.setDate(respawnTime.getDate() + 1);
      }

      const endTime = respawnTime.getTime();
      
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
      
      return message.channel.send({
        content: `⏳ **${bossName}** timer set to spawn at ${timeString} (${new Date(endTime).toLocaleString()})${durationText}`,
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
    
    // Start new timer for the killed boss
    startBossTimer(interaction, bossName, duration);
    
    await interaction.reply({
      content: `💀 **${bossName}** killed by ${interaction.user.username}! Timer restarted for ${duration} hours.`
    });
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
    const respawnTime = new Date(data.endTime).toLocaleString();

    reply += `- **${boss}**: ${hrsLeft}h ${minsLeft}m left (Respawn at ${respawnTime})\n`;

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
      delete bossTimers[bossName];
    }, endTime - Date.now()),
    endTime: endTime,
    duration: hours
  };

  const respawnTime = new Date(endTime).toLocaleString();
  
  // Create reset button
  const button = new ButtonBuilder()
    .setCustomId(`reset:${bossName}`)
    .setLabel(`Reset ${bossName}`)
    .setStyle(ButtonStyle.Primary);
  const row = new ActionRowBuilder().addComponents(button);

  // Prepare message content
  const msgContent = isReset
    ? `🔄 Timer for **${bossName}** reset for ${hours} hours (Respawn at ${respawnTime}).`
    : `⏳ Timer started for **${bossName}** (${hours} hours). Respawn at ${respawnTime}.`;

  // Send response based on context type
  if (context.reply && !context.replied) {
    context.reply({ content: msgContent, components: [row] });
  } else if (context.followUp && context.replied) {
    context.followUp({ content: msgContent, components: [row] });
  } else {
    context.channel.send({ content: msgContent, components: [row] });
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
