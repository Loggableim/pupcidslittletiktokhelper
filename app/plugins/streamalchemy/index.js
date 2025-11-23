/**
 * StreamAlchemy Plugin - Main Entry Point
 * 
 * Transform TikTok gifts into virtual RPG items with crafting mechanics.
 * 
 * Features:
 * - Gift-to-item conversion with AI-generated icons
 * - Real-time crafting when users send 2 gifts within 6 seconds
 * - Deterministic generation (no duplicate AI calls)
 * - Persistent inventory system
 * - Real-time overlay with animations
 * - Rarity-based item tiers
 * 
 * Architecture:
 * - Event-driven design (TikTok events → Item generation → Overlay updates)
 * - Race-condition safe (serialized AI requests, atomic DB writes)
 * - Modular components (DB, Crafting Service, Overlay)
 */

const path = require('path');
const AlchemyDatabase = require('./db');
const CraftingService = require('./craftingService');
const config = require('./config');

class StreamAlchemyPlugin {
    constructor(api) {
        this.api = api;
        this.pluginDir = api.pluginDir;
        
        // Core services
        this.db = null;
        this.craftingService = null;
        
        // User gift buffers for crafting detection
        // Map<userId, Array<{gift, timestamp, item}>>
        this.giftBuffers = new Map();
        
        // Processing queue to prevent race conditions
        // Map<userId, Promise>
        this.processingQueues = new Map();
        
        // Rate limiting
        this.userRateLimits = new Map();
        
        // Configuration
        this.pluginConfig = null;
        
        // Track if commands are registered
        this.commandsRegistered = false;
    }

    /**
     * Initialize the plugin
     */
    async init() {
        this.api.log('🧪 [STREAMALCHEMY] Initializing StreamAlchemy Plugin...', 'info');

        try {
            // Load plugin configuration
            await this.loadConfiguration();

            // Initialize database
            this.db = new AlchemyDatabase(this.pluginDir, this.api);
            await this.db.init();

            // Initialize crafting service
            const openaiKey = process.env.OPENAI_API_KEY || this.pluginConfig?.openaiApiKey;
            this.craftingService = new CraftingService(this.db, this.api, openaiKey);

            // Register routes
            this.registerRoutes();

            // Register TikTok event handlers
            this.registerTikTokEvents();

            // Register Socket.io events
            this.registerSocketEvents();

            // Start cleanup timer (remove old gift buffers)
            this.startCleanupTimer();

            // Register commands with GCCE if available (or wait for it)
            this.registerGCCECommands();
            
            // Also listen for GCCE ready event in case it loads later
            this.api.registerSocket('gcce:ready', async () => {
                if (!this.commandsRegistered) {
                    this.api.log('[STREAMALCHEMY] GCCE became available, registering commands now', 'info');
                    this.registerGCCECommands();
                }
            });

            this.api.log('✅ [STREAMALCHEMY] StreamAlchemy Plugin initialized successfully', 'info');
        } catch (error) {
            this.api.log(`❌ [STREAMALCHEMY] Initialization failed: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Load plugin configuration from database
     */
    async loadConfiguration() {
        try {
            this.pluginConfig = await this.api.getConfig('streamalchemy_config') || {};
            
            // Apply defaults
            this.pluginConfig = {
                enabled: true,
                openaiApiKey: null,
                autoGenerateItems: true,
                autoCrafting: true,
                ...this.pluginConfig
            };

            await this.api.setConfig('streamalchemy_config', this.pluginConfig);
        } catch (error) {
            this.api.log(`[STREAMALCHEMY] Config load error: ${error.message}`, 'error');
            this.pluginConfig = { enabled: true };
        }
    }

    /**
     * Register Express routes
     */
    registerRoutes() {
        // Serve overlay HTML
        this.api.registerRoute('GET', '/streamalchemy/overlay', (req, res) => {
            res.sendFile(path.join(this.pluginDir, 'overlay.html'));
        });

        // Serve CSS
        this.api.registerRoute('GET', '/streamalchemy/style.css', (req, res) => {
            res.sendFile(path.join(this.pluginDir, 'style.css'));
        });

        // API: Get plugin configuration
        this.api.registerRoute('GET', '/api/streamalchemy/config', async (req, res) => {
            res.json({
                success: true,
                config: this.pluginConfig
            });
        });

        // API: Update plugin configuration
        this.api.registerRoute('POST', '/api/streamalchemy/config', async (req, res) => {
            try {
                this.pluginConfig = { ...this.pluginConfig, ...req.body };
                await this.api.setConfig('streamalchemy_config', this.pluginConfig);
                
                res.json({
                    success: true,
                    config: this.pluginConfig
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // API: Get user inventory
        this.api.registerRoute('GET', '/api/streamalchemy/inventory/:userId', async (req, res) => {
            try {
                const userId = req.params.userId;
                const inventory = await this.db.getUserInventory(userId);
                
                // Enrich with item details
                const enrichedInventory = await Promise.all(
                    inventory.map(async entry => {
                        const item = await this.db.getItemById(entry.itemId);
                        return {
                            ...entry,
                            item
                        };
                    })
                );

                res.json({
                    success: true,
                    userId,
                    inventory: enrichedInventory
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // API: Get database statistics
        this.api.registerRoute('GET', '/api/streamalchemy/stats', async (req, res) => {
            try {
                const dbStats = await this.db.getStats();
                const craftingStats = this.craftingService.getStats();

                res.json({
                    success: true,
                    database: dbStats,
                    crafting: craftingStats,
                    activeBuffers: this.giftBuffers.size
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // API: Get all items (global inventory)
        this.api.registerRoute('GET', '/api/streamalchemy/items', async (req, res) => {
            try {
                const items = await this.db.getAllItems();
                res.json({
                    success: true,
                    items
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        this.api.log('[STREAMALCHEMY] Routes registered', 'debug');
    }

    /**
     * Register TikTok event handlers
     */
    registerTikTokEvents() {
        // Handle gift events
        this.api.registerTikTokEvent('gift', async (data) => {
            await this.handleGiftEvent(data);
        });

        this.api.log('[STREAMALCHEMY] TikTok events registered', 'debug');
    }

    /**
     * Register Socket.io events
     */
    registerSocketEvents() {
        // Client can request their inventory
        this.api.registerSocket('streamalchemy:get_inventory', async (socket, data) => {
            try {
                const userId = data.userId;
                const inventory = await this.db.getUserInventory(userId);
                socket.emit('streamalchemy:inventory', { userId, inventory });
            } catch (error) {
                socket.emit('streamalchemy:error', { error: error.message });
            }
        });

        this.api.log('[STREAMALCHEMY] Socket events registered', 'debug');
    }

    /**
     * Handle incoming TikTok gift events
     * @param {Object} data - Gift event data from TikTok
     */
    async handleGiftEvent(data) {
        try {
            if (!this.pluginConfig.enabled) return;

            // Validate user identification - fail fast if missing
            const userId = data.uniqueId || data.userId;
            if (!userId) {
                this.api.log('[STREAMALCHEMY] Gift event missing user identification', 'warn');
                return;
            }

            const gift = {
                id: data.giftId,
                name: data.giftName,
                coins: data.diamondCount || data.coins || 0,
                repeat: data.repeatCount || 1
            };

            this.api.log(`[STREAMALCHEMY] Gift received: ${gift.name} x${gift.repeat} from ${userId}`, 'info');

            // Check rate limiting
            if (this.isRateLimited(userId)) {
                this.api.log(`[STREAMALCHEMY] Rate limited: ${userId}`, 'warn');
                return;
            }

            // Process each repeat count separately
            for (let i = 0; i < gift.repeat; i++) {
                await this.processGift(userId, gift);
            }

        } catch (error) {
            this.api.log(`[STREAMALCHEMY] Error handling gift event: ${error.message}`, 'error');
        }
    }

    /**
     * Process a single gift (generate item and check for crafting)
     * Uses a queue to ensure sequential processing per user
     * @param {string} userId - User ID
     * @param {Object} gift - Gift object
     */
    async processGift(userId, gift) {
        // Get or create processing queue for this user
        if (!this.processingQueues.has(userId)) {
            this.processingQueues.set(userId, Promise.resolve());
        }
        
        // Chain this processing to the user's queue
        const currentQueue = this.processingQueues.get(userId);
        const nextQueue = currentQueue.then(async () => {
            try {
                // Step 1: Generate or retrieve base item
                const item = await this.craftingService.generateBaseItem(gift);

                // Step 2: Add to user's gift buffer
                const buffer = this.getOrCreateGiftBuffer(userId);
                buffer.push({
                    gift,
                    item,
                    timestamp: Date.now()
                });

                // Step 3: Check for crafting opportunity
                if (this.pluginConfig.autoCrafting && buffer.length >= 2) {
                    await this.attemptCrafting(userId);
                } else {
                    // No crafting - just give the base item
                    await this.giveItemToUser(userId, item);
                }
            } catch (error) {
                this.api.log(`[STREAMALCHEMY] Error processing gift for ${userId}: ${error.message}`, 'error');
            }
        });
        
        this.processingQueues.set(userId, nextQueue);
        return nextQueue;
    }

    /**
     * Attempt to craft items from user's buffer
     * @param {string} userId - User ID
     */
    async attemptCrafting(userId) {
        const buffer = this.getOrCreateGiftBuffer(userId);
        
        // Need at least 2 items
        if (buffer.length < 2) return;

        const now = Date.now();
        const craftingWindow = config.CRAFTING_WINDOW_MS;

        // Get the two most recent items
        const item2 = buffer[buffer.length - 1];
        const item1 = buffer[buffer.length - 2];

        // Check if they're within the crafting window
        const timeDiff = item2.timestamp - item1.timestamp;
        
        if (timeDiff <= craftingWindow) {
            // Crafting triggered!
            this.api.log(`[STREAMALCHEMY] Crafting triggered for ${userId}: ${item1.item.name} + ${item2.item.name}`, 'info');

            // Remove both items from buffer
            buffer.splice(buffer.length - 2, 2);

            // Broadcast crafting start to overlay
            this.broadcastCraftingStart(userId, item1.item, item2.item);

            try {
                // Generate crafted item
                const craftedItem = await this.craftingService.generateCraftedItem(item1.item, item2.item);

                // Give crafted item to user
                await this.giveItemToUser(userId, craftedItem);

                // Broadcast crafting complete
                this.broadcastCraftingComplete(userId, craftedItem);

            } catch (error) {
                this.api.log(`[STREAMALCHEMY] Crafting failed: ${error.message}`, 'error');
                
                // On failure, give back the base items
                await this.giveItemToUser(userId, item1.item);
                await this.giveItemToUser(userId, item2.item);
            }

        } else {
            // Not within window - give the older item to user
            const oldItem = buffer.shift();
            await this.giveItemToUser(userId, oldItem.item);
        }
    }

    /**
     * Give an item to a user and update their inventory
     * @param {string} userId - User ID
     * @param {Object} item - Item object
     */
    async giveItemToUser(userId, item) {
        // Check if this is the first time receiving this item
        const isFirstTime = await this.db.isFirstTimeItem(userId, item.itemId);

        // Update inventory
        const inventoryEntry = await this.db.updateUserInventory(userId, item.itemId, 1);

        // Broadcast to overlay
        if (isFirstTime) {
            this.broadcastItemDiscovery(userId, item);
        } else {
            this.broadcastItemIncrement(userId, item, inventoryEntry.quantity);
        }

        this.api.log(`[STREAMALCHEMY] Gave ${item.name} to ${userId} (qty: ${inventoryEntry.quantity}, first: ${isFirstTime})`, 'debug');
    }

    /**
     * Broadcast crafting start animation to overlay
     */
    broadcastCraftingStart(userId, itemA, itemB) {
        this.api.emit('streamalchemy:crafting_start', {
            userId,
            itemA,
            itemB,
            timestamp: Date.now()
        });
    }

    /**
     * Broadcast crafting complete event to overlay
     */
    broadcastCraftingComplete(userId, craftedItem) {
        this.api.emit('streamalchemy:crafting_complete', {
            userId,
            craftedItem,
            timestamp: Date.now()
        });
    }

    /**
     * Broadcast new item discovery to overlay (first time)
     */
    broadcastItemDiscovery(userId, item) {
        this.api.emit('streamalchemy:item_discovery', {
            userId,
            item,
            timestamp: Date.now()
        });
    }

    /**
     * Broadcast item increment to overlay (repeat)
     */
    broadcastItemIncrement(userId, item, quantity) {
        this.api.emit('streamalchemy:item_increment', {
            userId,
            item,
            quantity,
            timestamp: Date.now()
        });
    }

    /**
     * Get or create gift buffer for user
     * @param {string} userId - User ID
     * @returns {Array} Gift buffer array
     */
    getOrCreateGiftBuffer(userId) {
        if (!this.giftBuffers.has(userId)) {
            this.giftBuffers.set(userId, []);
        }
        return this.giftBuffers.get(userId);
    }

    /**
     * Check if user is rate limited
     * @param {string} userId - User ID
     * @returns {boolean} True if rate limited
     */
    isRateLimited(userId) {
        const now = Date.now();
        const limit = config.RATE_LIMIT.GIFTS_PER_USER_PER_MINUTE;
        
        if (!this.userRateLimits.has(userId)) {
            this.userRateLimits.set(userId, { count: 1, resetTime: now + 60000 });
            return false;
        }

        const rateLimitData = this.userRateLimits.get(userId);
        
        if (now > rateLimitData.resetTime) {
            // Reset
            rateLimitData.count = 1;
            rateLimitData.resetTime = now + 60000;
            return false;
        }

        if (rateLimitData.count >= limit) {
            return true;
        }

        rateLimitData.count++;
        return false;
    }

    /**
     * Start periodic cleanup timer for old gift buffers
     */
    startCleanupTimer() {
        this.cleanupInterval = setInterval(() => {
            this.cleanupOldBuffers();
        }, 30000); // Every 30 seconds

        this.api.log('[STREAMALCHEMY] Cleanup timer started', 'debug');
    }

    /**
     * Clean up old entries from gift buffers and rate limits
     */
    cleanupOldBuffers() {
        const now = Date.now();
        const maxAge = config.CRAFTING_WINDOW_MS * 2; // Keep buffers for 2x crafting window
        const maxRateLimitEntries = 1000; // Prevent unbounded growth

        // Clean up gift buffers
        for (const [userId, buffer] of this.giftBuffers.entries()) {
            // Filter out old entries
            const filtered = buffer.filter(entry => (now - entry.timestamp) <= maxAge);
            
            if (filtered.length === 0) {
                // Remove empty buffers
                this.giftBuffers.delete(userId);
            } else if (filtered.length < buffer.length) {
                // Update buffer with filtered entries
                this.giftBuffers.set(userId, filtered);
            }
        }

        // Clean up rate limit entries immediately when they expire
        for (const [userId, data] of this.userRateLimits.entries()) {
            if (now > data.resetTime) {
                this.userRateLimits.delete(userId);
            }
        }
        
        // If rate limit map is still too large, remove oldest entries (LRU)
        if (this.userRateLimits.size > maxRateLimitEntries) {
            const entries = Array.from(this.userRateLimits.entries())
                .sort((a, b) => a[1].resetTime - b[1].resetTime);
            
            const toRemove = entries.slice(0, entries.length - maxRateLimitEntries);
            for (const [userId] of toRemove) {
                this.userRateLimits.delete(userId);
            }
            
            this.api.log(`[STREAMALCHEMY] Rate limit cleanup: removed ${toRemove.length} old entries`, 'debug');
        }
        
        // Clean up processing queues for inactive users
        for (const [userId] of this.processingQueues.entries()) {
            if (!this.giftBuffers.has(userId)) {
                this.processingQueues.delete(userId);
            }
        }
    }

    /**
     * Handle chat commands (structure prepared for future implementation)
     * @param {string} userId - User ID
     * @param {string} command - Command name
     * @param {Array} args - Command arguments
     */
    async handleChatCommand(userId, command, args) {
        // TODO: Implement chat commands
        // - /merge itemA itemB
        // - /inventory
        // - /alchemy help
        
        this.api.log(`[STREAMALCHEMY] Chat command received: ${command} from ${userId}`, 'debug');
        
        // Parser structure ready for future implementation
        const commands = {
            merge: async () => {
                // Future: Manual crafting
            },
            inventory: async () => {
                // Future: Show inventory in chat/overlay
            },
            help: async () => {
                // Future: Show help text
            }
        };

        if (commands[command]) {
            await commands[command](args);
        }
    }

    /**
     * Register commands with GCCE (Global Chat Command Engine)
     */
    registerGCCECommands() {
        // Skip if already registered
        if (this.commandsRegistered) {
            return;
        }
        
        // Try to get GCCE plugin from the plugin loader
        const gccePlugin = this.api.pluginLoader?.loadedPlugins?.get('gcce');
        
        if (!gccePlugin || !gccePlugin.instance) {
            this.api.log('[STREAMALCHEMY] GCCE not available yet - will register when available', 'debug');
            return;
        }

        const gcce = gccePlugin.instance;

        // Define StreamAlchemy commands
        const commands = [
            {
                name: 'inventory',
                description: 'View your alchemy inventory',
                syntax: '/inventory',
                permission: 'all',
                enabled: true,
                minArgs: 0,
                maxArgs: 0,
                category: 'Alchemy',
                handler: async (args, context) => await this.handleInventoryCommand(args, context)
            },
            {
                name: 'inspect',
                description: 'Inspect an item in your inventory',
                syntax: '/inspect <item_name>',
                permission: 'all',
                enabled: true,
                minArgs: 1,
                category: 'Alchemy',
                handler: async (args, context) => await this.handleInspectCommand(args, context)
            },
            {
                name: 'merge',
                description: 'Manually merge two items (moderator only)',
                syntax: '/merge <item1> <item2>',
                permission: 'moderator',
                enabled: true,
                minArgs: 2,
                maxArgs: 2,
                category: 'Alchemy',
                handler: async (args, context) => await this.handleMergeCommand(args, context)
            },
            {
                name: 'alchemy',
                description: 'View alchemy system information and help',
                syntax: '/alchemy [help]',
                permission: 'all',
                enabled: true,
                minArgs: 0,
                maxArgs: 1,
                category: 'Alchemy',
                handler: async (args, context) => await this.handleAlchemyCommand(args, context)
            }
        ];

        // Register commands
        const result = gcce.registerCommandsForPlugin('streamalchemy', commands);
        
        this.commandsRegistered = result.registered.length > 0;
        
        this.api.log(`[STREAMALCHEMY] Registered ${result.registered.length} commands with GCCE`, 'info');
        if (result.failed.length > 0) {
            this.api.log(`[STREAMALCHEMY] Failed to register commands: ${result.failed.join(', ')}`, 'warn');
        }
    }

    /**
     * Handle /inventory command
     */
    async handleInventoryCommand(args, context) {
        try {
            const userId = context.userId;
            const inventory = await this.db.getUserInventory(userId);

            if (inventory.length === 0) {
                return {
                    success: true,
                    message: `${context.username}, you don't have any items yet! Send gifts to start your collection.`,
                    displayOverlay: true,
                    data: {
                        type: 'inventory_empty',
                        username: context.username
                    }
                };
            }

            // Enrich with item details
            const enrichedInventory = await Promise.all(
                inventory.map(async entry => {
                    const item = await this.db.getItemById(entry.itemId);
                    return {
                        ...entry,
                        item
                    };
                })
            );

            // Emit to overlay
            this.api.emit('streamalchemy:show_inventory', {
                userId,
                username: context.username,
                inventory: enrichedInventory,
                timestamp: Date.now()
            });

            return {
                success: true,
                message: `${context.username}, you have ${inventory.length} unique items! Check the overlay.`,
                displayOverlay: true,
                data: {
                    type: 'inventory_display',
                    username: context.username,
                    itemCount: inventory.length,
                    inventory: enrichedInventory
                }
            };

        } catch (error) {
            this.api.log(`[STREAMALCHEMY] Inventory command error: ${error.message}`, 'error');
            return {
                success: false,
                error: 'Failed to retrieve your inventory. Please try again.',
                displayOverlay: true
            };
        }
    }

    /**
     * Handle /inspect command
     */
    async handleInspectCommand(args, context) {
        try {
            const itemName = args.join(' ').toLowerCase();
            const userId = context.userId;
            
            // Input validation - prevent DoS with long inputs
            if (itemName.length > 100) {
                return {
                    success: false,
                    message: 'Item name is too long. Please use a shorter search term.',
                    displayOverlay: true
                };
            }
            
            // Get user's inventory
            const inventory = await this.db.getUserInventory(userId);
            
            // Find item by name
            let foundItem = null;
            for (const entry of inventory) {
                const item = await this.db.getItemById(entry.itemId);
                if (item && item.name.toLowerCase().includes(itemName)) {
                    foundItem = { ...item, quantity: entry.quantity };
                    break;
                }
            }

            if (!foundItem) {
                return {
                    success: false,
                    error: `Item "${args.join(' ')}" not found in your inventory.`,
                    displayOverlay: true
                };
            }

            // Emit to overlay
            this.api.emit('streamalchemy:inspect_item', {
                userId,
                username: context.username,
                item: foundItem,
                timestamp: Date.now()
            });

            return {
                success: true,
                message: `Inspecting ${foundItem.name} (${foundItem.rarity}) - Check the overlay!`,
                displayOverlay: true,
                data: {
                    type: 'item_inspect',
                    item: foundItem
                }
            };

        } catch (error) {
            this.api.log(`[STREAMALCHEMY] Inspect command error: ${error.message}`, 'error');
            return {
                success: false,
                error: 'Failed to inspect item. Please try again.',
                displayOverlay: true
            };
        }
    }

    /**
     * Handle /merge command (moderator only)
     */
    async handleMergeCommand(args, context) {
        try {
            const item1Name = args[0].toLowerCase();
            const item2Name = args[1].toLowerCase();
            const userId = context.userId;
            
            // Input validation - prevent DoS
            if (item1Name.length > 100 || item2Name.length > 100) {
                return {
                    success: false,
                    message: 'Item names are too long.',
                    displayOverlay: true
                };
            }

            // Get user's inventory
            const inventory = await this.db.getUserInventory(userId);

            // Find both items
            let item1 = null;
            let item2 = null;

            for (const entry of inventory) {
                const item = await this.db.getItemById(entry.itemId);
                if (item) {
                    if (item.name.toLowerCase().includes(item1Name) && !item1) {
                        item1 = item;
                    } else if (item.name.toLowerCase().includes(item2Name) && !item2) {
                        item2 = item;
                    }
                }
            }

            if (!item1) {
                return {
                    success: false,
                    error: `Item "${args[0]}" not found in your inventory.`,
                    displayOverlay: true
                };
            }

            if (!item2) {
                return {
                    success: false,
                    error: `Item "${args[1]}" not found in your inventory.`,
                    displayOverlay: true
                };
            }

            // Trigger crafting animation
            this.broadcastCraftingStart(userId, item1, item2);

            // Generate crafted item
            const craftedItem = await this.craftingService.generateCraftedItem(item1, item2);

            // Give crafted item to user
            await this.giveItemToUser(userId, craftedItem);

            // Broadcast complete
            this.broadcastCraftingComplete(userId, craftedItem);

            return {
                success: true,
                message: `Successfully merged ${item1.name} + ${item2.name} into ${craftedItem.name}!`,
                displayOverlay: true,
                data: {
                    type: 'manual_merge',
                    item1,
                    item2,
                    craftedItem
                }
            };

        } catch (error) {
            this.api.log(`[STREAMALCHEMY] Merge command error: ${error.message}`, 'error');
            return {
                success: false,
                error: 'Failed to merge items. Please try again.',
                displayOverlay: true
            };
        }
    }

    /**
     * Handle /alchemy command
     */
    async handleAlchemyCommand(args, context) {
        const stats = await this.db.getStats();
        const craftingStats = this.craftingService.getStats();

        if (args.length > 0 && args[0].toLowerCase() === 'help') {
            // Show help information
            return {
                success: true,
                message: 'StreamAlchemy: Transform gifts into RPG items! Send 2 gifts within 6 seconds to craft new items.',
                displayOverlay: true,
                data: {
                    type: 'alchemy_help',
                    commands: [
                        '/inventory - View your items',
                        '/inspect <item> - Inspect an item',
                        '/alchemy - View system stats'
                    ]
                }
            };
        }

        // Show statistics
        return {
            success: true,
            message: `StreamAlchemy Stats: ${stats.totalItems} total items (${stats.craftedItems} crafted), ${stats.totalUsers} alchemists`,
            displayOverlay: true,
            data: {
                type: 'alchemy_stats',
                stats: {
                    ...stats,
                    ...craftingStats
                }
            }
        };
    }

    /**
     * Clean up plugin resources
     */
    async destroy() {
        this.api.log('[STREAMALCHEMY] Shutting down StreamAlchemy Plugin...', 'info');

        // Unregister commands from GCCE
        const gccePlugin = this.api.pluginLoader?.loadedPlugins?.get('gcce');
        if (gccePlugin?.instance) {
            gccePlugin.instance.unregisterCommandsForPlugin('streamalchemy');
        }

        // Stop cleanup timer
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }

        // Clear buffers
        this.giftBuffers.clear();
        this.userRateLimits.clear();

        // Destroy services
        if (this.craftingService) {
            await this.craftingService.destroy();
        }

        if (this.db) {
            await this.db.destroy();
        }

        this.api.log('[STREAMALCHEMY] StreamAlchemy Plugin shut down successfully', 'info');
    }
}

module.exports = StreamAlchemyPlugin;
