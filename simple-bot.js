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

const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Store active boss timers: { bossName: { timeout, endTime, duration } }
let bossTimers = {};

// Store boss respawn durations for reuse: { bossName: hours }
let bossDurations = {};

client.once('ready', () => {
  console.log(`✅ Bot ready! Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  
  const args = message.content.split(' ');
  const command = args.shift().toLowerCase();

  try {
    // Test command
    if (command === '!test') {
      return message.channel.send('Bot is working! 🤖');
    }

    // Display available commands
    if (command === '!commands') {
      return message.channel.send(`
**Available Commands**
- \`!boss <hours> <bossName>\` - Start a boss timer
- \`!timer\` - Show all active timers
- \`!delete <bossName>\` - Delete a boss timer
- \`!test\` - Test if bot is working
- \`!commands\` - Show this command list
      `);
    }

    // Start a new boss timer
    if (command === '!boss') {
      const hours = parseFloat(args[0]);
      const bossName = args.slice(1).join(' ') || 'Boss';
      
      if (isNaN(hours)) {
        return message.channel.send('Please provide a valid number of hours.');
      }
      
      startBossTimer(message, bossName, hours);
    }

    // Display all active timers
    if (command === '!timer') {
      if (Object.keys(bossTimers).length === 0) {
        return message.channel.send('No active boss timers.');
      }
      displayTimers(message);
    }

    // Delete a boss timer
    if (command === '!delete') {
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
    
    await interaction.reply({
      content: `🔄 **${bossName}** timer reset by ${interaction.user.username}!`
    });
    
    startBossTimer(interaction, bossName, bossTimers[bossName].duration, true);
  }
  
  if (action === 'killed') {
    const duration = bossDurations[bossName] || 2;
    
    startBossTimer(interaction, bossName, duration);
    
    await interaction.reply({
      content: `💀 **${bossName}** killed by ${interaction.user.username}! Timer restarted for ${duration} hours.`
    });
  }
});

/**
 * Display all active boss timers with reset buttons
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

  if (buttons.length > 5) {
    reply += `\n*Too many active timers to show reset buttons. Use \`!delete <bossName>\` to remove timers.*`;
    context.channel.send({ content: reply });
  } else {
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
 */
function startBossTimer(context, bossName, hours, isReset = false) {
  const endTime = Date.now() + hours * 3600000;
  
  bossDurations[bossName] = hours;
  
  if (bossTimers[bossName]) {
    clearTimeout(bossTimers[bossName].timeout);
  }
  
  bossTimers[bossName] = {
    timeout: setTimeout(() => {
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
    }, hours * 3600000),
    endTime: endTime,
    duration: hours
  };

  const respawnTime = new Date(endTime).toLocaleString();
  
  const button = new ButtonBuilder()
    .setCustomId(`reset:${bossName}`)
    .setLabel(`Reset ${bossName}`)
    .setStyle(ButtonStyle.Primary);
  const row = new ActionRowBuilder().addComponents(button);

  const msgContent = isReset
    ? `🔄 Timer for **${bossName}** reset for ${hours} hours (Respawn at ${respawnTime}).`
    : `⏳ Timer started for **${bossName}** (${hours} hours). Respawn at ${respawnTime}.`;

  if (context.reply && !context.replied) {
    context.reply({ content: msgContent, components: [row] });
  } else if (context.followUp && context.replied) {
    context.followUp({ content: msgContent, components: [row] });
  } else {
    context.channel.send({ content: msgContent, components: [row] });
  }
}

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
