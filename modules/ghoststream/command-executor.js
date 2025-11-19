const EventEmitter = require('events');

/**
 * CommandExecutor - Handles chat commands and maps them to browser actions
 * Provides validation, rate limiting, and permission checks
 */
class CommandExecutor extends EventEmitter {
    constructor(options = {}) {
        super();
        this.commandPrefix = options.commandPrefix || '!';
        this.allowedCommands = new Set(options.allowedCommands || ['scene', 'tts', 'click']);
        this.rateLimit = options.rateLimit || 10; // commands per window
        this.rateLimitWindow = options.rateLimitWindow || 60000; // 1 minute
        
        // Rate limiting tracking
        this.userCommandCounts = new Map();
        this.commandHistory = [];
        
        // Command handlers
        this.commandHandlers = new Map();
        this.registerDefaultHandlers();
    }

    /**
     * Register default command handlers
     */
    registerDefaultHandlers() {
        // !scene <name> - Switch OBS scene (if OBS integration available)
        this.registerCommand('scene', async (args, context) => {
            const sceneName = args.join(' ');
            if (!sceneName) {
                throw new Error('Scene name required');
            }
            return { type: 'scene', sceneName };
        });

        // !tts <message> - Trigger TTS
        this.registerCommand('tts', async (args, context) => {
            const message = args.join(' ');
            if (!message) {
                throw new Error('Message required');
            }
            return { type: 'tts', message, username: context.username };
        });

        // !click <selector> - Click element in browser
        this.registerCommand('click', async (args, context) => {
            const selector = args.join(' ');
            if (!selector) {
                throw new Error('Selector required');
            }
            // Validate selector (basic security check)
            if (!this.isValidSelector(selector)) {
                throw new Error('Invalid selector');
            }
            return { type: 'click', selector };
        });
    }

    /**
     * Register a custom command handler
     */
    registerCommand(name, handler) {
        this.commandHandlers.set(name, handler);
        this.allowedCommands.add(name);
    }

    /**
     * Parse and execute a chat message as command
     */
    async parseAndExecute(message, username) {
        // Check if message is a command
        if (!message.startsWith(this.commandPrefix)) {
            return null;
        }

        // Extract command and arguments
        const parts = message.slice(this.commandPrefix.length).trim().split(/\s+/);
        const commandName = parts[0].toLowerCase();
        const args = parts.slice(1);

        // Check if command is allowed
        if (!this.allowedCommands.has(commandName)) {
            this.emit('command:unknown', { commandName, username });
            return null;
        }

        // Check rate limit
        if (!this.checkRateLimit(username)) {
            this.emit('command:rate_limited', { username, commandName });
            throw new Error('Rate limit exceeded');
        }

        // Get handler
        const handler = this.commandHandlers.get(commandName);
        if (!handler) {
            return null;
        }

        try {
            // Execute command
            const context = { username, timestamp: Date.now() };
            const result = await handler(args, context);
            
            // Track command execution
            this.trackCommand(username, commandName);
            this.emit('command:executed', { username, commandName, result });
            
            return result;
        } catch (error) {
            this.emit('command:error', { username, commandName, error: error.message });
            throw error;
        }
    }

    /**
     * Check rate limit for user
     */
    checkRateLimit(username) {
        const now = Date.now();
        
        // Clean up old entries
        this.commandHistory = this.commandHistory.filter(entry => 
            now - entry.timestamp < this.rateLimitWindow
        );

        // Count commands from this user in the window
        const userCommands = this.commandHistory.filter(entry => 
            entry.username === username
        );

        return userCommands.length < this.rateLimit;
    }

    /**
     * Track command execution
     */
    trackCommand(username, commandName) {
        this.commandHistory.push({
            username,
            commandName,
            timestamp: Date.now()
        });
    }

    /**
     * Validate selector (basic security check)
     */
    isValidSelector(selector) {
        // Only allow basic CSS selectors, no JavaScript
        const dangerousPatterns = [
            /javascript:/i,
            /<script/i,
            /on\w+=/i,
            /eval\(/i,
            /expression\(/i
        ];

        return !dangerousPatterns.some(pattern => pattern.test(selector));
    }

    /**
     * Clear rate limit history
     */
    clearHistory() {
        this.commandHistory = [];
        this.userCommandCounts.clear();
    }
}

module.exports = CommandExecutor;
