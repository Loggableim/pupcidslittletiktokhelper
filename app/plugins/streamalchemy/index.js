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
        
        // Rate limiting
        this.userRateLimits = new Map();
        
        // Configuration
        this.pluginConfig = null;
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
     * @param {string} userId - User ID
     * @param {Object} gift - Gift object
     */
    async processGift(userId, gift) {
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
     * Clean up old entries from gift buffers
     */
    cleanupOldBuffers() {
        const now = Date.now();
        const maxAge = config.CRAFTING_WINDOW_MS * 2; // Keep buffers for 2x crafting window

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

        // Clean up old rate limit entries
        for (const [userId, data] of this.userRateLimits.entries()) {
            if (now > data.resetTime + 60000) {
                this.userRateLimits.delete(userId);
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
     * Clean up plugin resources
     */
    async destroy() {
        this.api.log('[STREAMALCHEMY] Shutting down StreamAlchemy Plugin...', 'info');

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
