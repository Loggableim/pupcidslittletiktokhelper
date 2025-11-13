const WebSocket = require('ws');
const EventEmitter = require('events');

/**
 * Live Goals Plugin
 * TikFinity Goals Plugin
 *
 * Complete goals system with 4 goal types:
 * - Coin Goal: Tracks gift coins
 * - Likes Goal: Tracks likes in real-time
 * - Follower Goal: Tracks new followers
 * - Custom Goal: Manually controlled value
 *
 * Features:
 * - TikFinity Event API integration (ws://localhost:21213)
 * - Real-time overlay updates
 * - Flow actions for goal manipulation
 * - Customizable goal progression (fixed/add/double/hide)
 * - Individual styling per goal
 */
class GoalsPlugin extends EventEmitter {
    constructor(api) {
        super();
        this.api = api;

        // TikFinity WebSocket Client
        this.tikfinityWs = null;
        this.tikfinityConnected = false;
        this.tikfinityReconnectAttempts = 0;
        this.maxTikfinityReconnectAttempts = 10;
        this.tikfinityReconnectDelay = 5000; // 5 seconds

        // Goal state cache
        this.goals = new Map();

        // Goal type definitions
        this.goalTypes = ['coin', 'likes', 'follower', 'custom'];
    }

    async init() {
        this.api.log('Initializing Live Goals Plugin...', 'info');
        this.api.log('Initializing TikFinity Goals Plugin...', 'info');

        // Initialize database
        this.initializeDatabase();

        // Load goals from database
        this.loadGoals();

        // Register routes
        this.registerRoutes();

        // Register TikTok event handlers
        this.registerTikTokEventHandlers();

        // Register Socket.IO handlers
        this.registerSocketHandlers();

        // Connect to TikFinity Event API
        this.connectToTikFinity();

        // Register Flow Actions
        this.registerFlowActions();

        this.api.log('✅ Live Goals Plugin initialized', 'info');
        this.api.log('✅ TikFinity Goals Plugin initialized', 'info');
    }

    /**
     * Initialize database tables for goals
     */
    initializeDatabase() {
        try {
            const db = this.api.getDatabase();

            // Goals configuration table
            db.exec(`
                CREATE TABLE IF NOT EXISTS goals_config (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    goal_type TEXT NOT NULL UNIQUE,
                    enabled INTEGER DEFAULT 1,
                    name TEXT NOT NULL,
                    start_value INTEGER DEFAULT 0,
                    current_value INTEGER DEFAULT 0,
                    target_value INTEGER DEFAULT 1000,
                    progression_mode TEXT DEFAULT 'fixed',
                    increment_amount INTEGER DEFAULT 100,
                    style_json TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Goals history/events table
            db.exec(`
                CREATE TABLE IF NOT EXISTS goals_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    goal_type TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    old_value INTEGER,
                    new_value INTEGER,
                    delta INTEGER,
                    metadata TEXT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // TikFinity connection settings
            db.exec(`
                CREATE TABLE IF NOT EXISTS goals_tikfinity_config (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    enabled INTEGER DEFAULT 1,
                    websocket_url TEXT DEFAULT 'ws://localhost:21213',
                    auto_reconnect INTEGER DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Initialize default goals if not exist
            this.initializeDefaultGoals(db);

            // Initialize TikFinity config if not exist
            const tikfinityStmt = db.prepare(`
                INSERT OR IGNORE INTO goals_tikfinity_config (id, enabled, websocket_url, auto_reconnect)
                VALUES (1, 1, 'ws://localhost:21213', 1)
            `);
            tikfinityStmt.run();

            this.api.log('Database tables initialized', 'info');
        } catch (error) {
            this.api.log(`Error initializing database: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Initialize default goal configurations
     */
    initializeDefaultGoals(db) {
        const defaultGoals = [
            {
                goal_type: 'coin',
                name: 'Coins Goal',
                start_value: 0,
                current_value: 0,
                target_value: 1000,
                progression_mode: 'add',
                increment_amount: 1000,
                style_json: JSON.stringify({
                    fill_color1: '#fbbf24',
                    fill_color2: '#f59e0b',
                    bg_color: '#78350f',
                    text_color: '#ffffff',
                    label_template: 'Coins: {current} / {target}'
                })
            },
            {
                goal_type: 'likes',
                name: 'Likes Goal',
                start_value: 0,
                current_value: 0,
                target_value: 500,
                progression_mode: 'add',
                increment_amount: 500,
                style_json: JSON.stringify({
                    fill_color1: '#4ade80',
                    fill_color2: '#22c55e',
                    bg_color: '#14532d',
                    text_color: '#ffffff',
                    label_template: 'Likes: {current} / {target}'
                })
            },
            {
                goal_type: 'follower',
                name: 'Followers Goal',
                start_value: 0,
                current_value: 0,
                target_value: 10,
                progression_mode: 'add',
                increment_amount: 10,
                style_json: JSON.stringify({
                    fill_color1: '#60a5fa',
                    fill_color2: '#3b82f6',
                    bg_color: '#1e3a8a',
                    text_color: '#ffffff',
                    label_template: 'Followers: {current} / {target}'
                })
            },
            {
                goal_type: 'custom',
                name: 'Custom Goal',
                start_value: 0,
                current_value: 0,
                target_value: 100,
                progression_mode: 'fixed',
                increment_amount: 0,
                style_json: JSON.stringify({
                    fill_color1: '#a78bfa',
                    fill_color2: '#8b5cf6',
                    bg_color: '#4c1d95',
                    text_color: '#ffffff',
                    label_template: 'Custom: {current} / {target}'
                })
            }
        ];

        const stmt = db.prepare(`
            INSERT OR IGNORE INTO goals_config
            (goal_type, enabled, name, start_value, current_value, target_value, progression_mode, increment_amount, style_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const goal of defaultGoals) {
            stmt.run(
                goal.goal_type,
                1,
                goal.name,
                goal.start_value,
                goal.current_value,
                goal.target_value,
                goal.progression_mode,
                goal.increment_amount,
                goal.style_json
            );
        }
    }

    /**
     * Load all goals from database into memory
     */
    loadGoals() {
        try {
            const db = this.api.getDatabase();
            const stmt = db.prepare('SELECT * FROM goals_config');
            const rows = stmt.all();

            this.goals.clear();

            for (const row of rows) {
                const goal = {
                    id: row.id,
                    goalType: row.goal_type,
                    enabled: Boolean(row.enabled),
                    name: row.name,
                    startValue: row.start_value,
                    currentValue: row.current_value,
                    targetValue: row.target_value,
                    progressionMode: row.progression_mode,
                    incrementAmount: row.increment_amount,
                    style: row.style_json ? JSON.parse(row.style_json) : {},
                    createdAt: row.created_at,
                    updatedAt: row.updated_at
                };

                // Calculate derived values
                goal.percent = this.calculatePercent(goal.currentValue, goal.targetValue);
                goal.remaining = Math.max(0, goal.targetValue - goal.currentValue);
                goal.isCompleted = goal.currentValue >= goal.targetValue;

                this.goals.set(goal.goalType, goal);
            }

            this.api.log(`Loaded ${this.goals.size} goals from database`, 'info');
        } catch (error) {
            this.api.log(`Error loading goals: ${error.message}`, 'error');
        }
    }

    /**
     * Calculate percentage (0-100)
     */
    calculatePercent(current, target) {
        if (target <= 0) return 0;
        return Math.min(100, Math.round((current / target) * 100));
    }

    /**
     * Connect to TikFinity Event API WebSocket
     */
    connectToTikFinity() {
        try {
            const db = this.api.getDatabase();
            const configStmt = db.prepare('SELECT * FROM goals_tikfinity_config WHERE id = 1');
            const config = configStmt.get();

            if (!config || !config.enabled) {
                this.api.log('TikFinity integration is disabled', 'info');
                return;
            }

            const wsUrl = config.websocket_url || 'ws://localhost:21213';

            this.api.log(`Connecting to TikFinity Event API at ${wsUrl}...`, 'info');

            this.tikfinityWs = new WebSocket(wsUrl);

            this.tikfinityWs.on('open', () => {
                this.tikfinityConnected = true;
                this.tikfinityReconnectAttempts = 0;
                this.api.log('✅ Connected to TikFinity Event API', 'info');

                // Broadcast connection status via Socket.IO
                this.api.io.emit('goals:event-api:connected', { connected: true });
            });

            this.tikfinityWs.on('message', (data) => {
                try {
                    const event = JSON.parse(data.toString());
                    this.handleTikFinityEvent(event);
                } catch (error) {
                    this.api.log(`Error parsing TikFinity event: ${error.message}`, 'error');
                }
            });

            this.tikfinityWs.on('error', (error) => {
                this.api.log(`TikFinity WebSocket error: ${error.message}`, 'error');
            });

            this.tikfinityWs.on('close', () => {
                this.tikfinityConnected = false;
                this.api.log('TikFinity WebSocket connection closed', 'warn');

                // Broadcast connection status via Socket.IO
                this.api.io.emit('goals:event-api:connected', { connected: false });

                // Auto-reconnect if enabled
                if (config.auto_reconnect && this.tikfinityReconnectAttempts < this.maxTikfinityReconnectAttempts) {
                    this.tikfinityReconnectAttempts++;
                    const delay = this.tikfinityReconnectDelay * this.tikfinityReconnectAttempts;

                    this.api.log(`Attempting to reconnect to TikFinity in ${delay / 1000}s (attempt ${this.tikfinityReconnectAttempts}/${this.maxTikfinityReconnectAttempts})`, 'info');

                    setTimeout(() => {
                        this.connectToTikFinity();
                    }, delay);
                }
            });

        } catch (error) {
            this.api.log(`Error connecting to TikFinity: ${error.message}`, 'error');
        }
    }

    /**
     * Handle TikFinity WebSocket events
     */
    handleTikFinityEvent(event) {
        try {
            // TikFinity event structure varies, but commonly:
            // { type: 'gift', data: { coins: 100 } }
            // { type: 'like', data: { count: 1 } }
            // { type: 'follow', data: { username: 'user123' } }

            if (event.type === 'gift' && event.data && event.data.coins) {
                this.incrementGoal('coin', event.data.coins);
            } else if (event.type === 'like') {
                const count = event.data?.count || 1;
                this.incrementGoal('likes', count);
            } else if (event.type === 'follow') {
                this.incrementGoal('follower', 1);
            }

        } catch (error) {
            this.api.log(`Error handling TikFinity event: ${error.message}`, 'error');
        }
    }

    /**
     * Register TikTok event handlers (fallback if TikFinity is not available)
     */
    registerTikTokEventHandlers() {
        // Gift event - increment coin goal
        this.api.registerTikTokEvent('gift', (data) => {
            if (data.coins) {
                this.incrementGoal('coin', data.coins);
            }
        });

        // Like event - increment likes goal
        this.api.registerTikTokEvent('like', (data) => {
            const count = data.likeCount || 1;
            this.incrementGoal('likes', count);
        });

        // Follow event - increment follower goal
        this.api.registerTikTokEvent('follow', (data) => {
            this.incrementGoal('follower', 1);
        });

        this.api.log('✅ TikTok event handlers registered', 'info');
    }

    /**
     * Increment a goal's current value
     */
    async incrementGoal(goalType, delta) {
        const goal = this.goals.get(goalType);
        if (!goal || !goal.enabled) {
            return;
        }

        const oldValue = goal.currentValue;
        const newValue = oldValue + delta;

        await this.setGoalValue(goalType, newValue);
    }

    /**
     * Set a goal's current value (absolute)
     */
    async setGoalValue(goalType, newValue) {
        const goal = this.goals.get(goalType);
        if (!goal) {
            this.api.log(`Goal type ${goalType} not found`, 'warn');
            return;
        }

        const oldValue = goal.currentValue;
        const delta = newValue - oldValue;

        // Update in-memory state
        goal.currentValue = Math.max(0, newValue);
        goal.percent = this.calculatePercent(goal.currentValue, goal.targetValue);
        goal.remaining = Math.max(0, goal.targetValue - goal.currentValue);

        const wasCompleted = goal.isCompleted;
        goal.isCompleted = goal.currentValue >= goal.targetValue;

        // Update database
        try {
            const db = this.api.getDatabase();
            const stmt = db.prepare(`
                UPDATE goals_config
                SET current_value = ?, updated_at = CURRENT_TIMESTAMP
                WHERE goal_type = ?
            `);
            stmt.run(goal.currentValue, goalType);

            // Log to history
            const historyStmt = db.prepare(`
                INSERT INTO goals_history (goal_type, event_type, old_value, new_value, delta)
                VALUES (?, ?, ?, ?, ?)
            `);
            historyStmt.run(goalType, 'value_changed', oldValue, goal.currentValue, delta);

        } catch (error) {
            this.api.log(`Error updating goal ${goalType}: ${error.message}`, 'error');
        }

        // Broadcast update to overlays
        this.broadcastGoalUpdate(goal);

        // Check if goal was just completed
        if (!wasCompleted && goal.isCompleted) {
            this.handleGoalCompleted(goal);
        }

        this.api.log(`Goal ${goalType}: ${oldValue} → ${goal.currentValue} (${delta >= 0 ? '+' : ''}${delta})`, 'info');
    }

    /**
     * Handle goal completion
     */
    async handleGoalCompleted(goal) {
        this.api.log(`🎯 Goal completed: ${goal.name} (${goal.currentValue}/${goal.targetValue})`, 'info');

        // Broadcast completion event via Socket.IO
        this.api.io.emit('goals:completed', {
            goalType: goal.goalType,
            name: goal.name,
            currentValue: goal.currentValue,
            targetValue: goal.targetValue
        });

        // Apply progression mode
        if (goal.progressionMode === 'add') {
            // Increase target by increment amount
            await this.updateGoalTarget(goal.goalType, goal.targetValue + goal.incrementAmount);
        } else if (goal.progressionMode === 'double') {
            // Double the target
            await this.updateGoalTarget(goal.goalType, goal.targetValue * 2);
        } else if (goal.progressionMode === 'hide') {
            // Disable the goal
            await this.toggleGoal(goal.goalType, false);
        }
        // 'fixed' mode: do nothing, goal stays completed
    }

    /**
     * Update goal target value
     */
    async updateGoalTarget(goalType, newTarget) {
        const goal = this.goals.get(goalType);
        if (!goal) return;

        const oldTarget = goal.targetValue;
        goal.targetValue = Math.max(1, newTarget);
        goal.percent = this.calculatePercent(goal.currentValue, goal.targetValue);
        goal.remaining = Math.max(0, goal.targetValue - goal.currentValue);
        goal.isCompleted = goal.currentValue >= goal.targetValue;

        // Update database
        try {
            const db = this.api.getDatabase();
            const stmt = db.prepare(`
                UPDATE goals_config
                SET target_value = ?, updated_at = CURRENT_TIMESTAMP
                WHERE goal_type = ?
            `);
            stmt.run(goal.targetValue, goalType);

            // Log to history
            const historyStmt = db.prepare(`
                INSERT INTO goals_history (goal_type, event_type, old_value, new_value, metadata)
                VALUES (?, ?, ?, ?, ?)
            `);
            historyStmt.run(goalType, 'target_changed', oldTarget, goal.targetValue,
                JSON.stringify({ mode: goal.progressionMode }));

        } catch (error) {
            this.api.log(`Error updating goal target ${goalType}: ${error.message}`, 'error');
        }

        // Broadcast update
        this.broadcastGoalUpdate(goal);

        this.api.log(`Goal ${goalType} target: ${oldTarget} → ${goal.targetValue}`, 'info');
    }

    /**
     * Toggle goal enabled/disabled
     */
    async toggleGoal(goalType, enabled) {
        const goal = this.goals.get(goalType);
        if (!goal) return;

        goal.enabled = enabled;

        // Update database
        try {
            const db = this.api.getDatabase();
            const stmt = db.prepare(`
                UPDATE goals_config
                SET enabled = ?, updated_at = CURRENT_TIMESTAMP
                WHERE goal_type = ?
            `);
            stmt.run(enabled ? 1 : 0, goalType);

        } catch (error) {
            this.api.log(`Error toggling goal ${goalType}: ${error.message}`, 'error');
        }

        // Broadcast update
        this.broadcastGoalUpdate(goal);

        this.api.log(`Goal ${goalType} ${enabled ? 'enabled' : 'disabled'}`, 'info');
    }

    /**
     * Reset goal to start value
     */
    async resetGoal(goalType) {
        const goal = this.goals.get(goalType);
        if (!goal) return;

        await this.setGoalValue(goalType, goal.startValue);

        this.api.log(`Goal ${goalType} reset to ${goal.startValue}`, 'info');
    }

    /**
     * Broadcast goal update to overlays via Socket.IO
     */
    broadcastGoalUpdate(goal) {
        this.api.io.emit('goals:update', {
            goalType: goal.goalType,
            enabled: goal.enabled,
            name: goal.name,
            currentValue: goal.currentValue,
            targetValue: goal.targetValue,
            startValue: goal.startValue,
            percent: goal.percent,
            remaining: goal.remaining,
            isCompleted: goal.isCompleted,
            progressionMode: goal.progressionMode,
            incrementAmount: goal.incrementAmount,
            style: goal.style
        });
    }

    /**
     * Register Socket.IO handlers
     */
    registerSocketHandlers() {
        this.api.registerSocket('goals:get-all', (socket) => {
            const goalsArray = Array.from(this.goals.values()).map(goal => ({
                goalType: goal.goalType,
                enabled: goal.enabled,
                name: goal.name,
                currentValue: goal.currentValue,
                targetValue: goal.targetValue,
                startValue: goal.startValue,
                percent: goal.percent,
                remaining: goal.remaining,
                isCompleted: goal.isCompleted,
                progressionMode: goal.progressionMode,
                incrementAmount: goal.incrementAmount,
                style: goal.style
            }));

            socket.emit('goals:all', { goals: goalsArray });
        });

        this.api.registerSocket('goals:subscribe', (socket, data) => {
            const goalType = data.goalType;
            if (goalType && this.goals.has(goalType)) {
                socket.join(`goal:${goalType}`);
                const goal = this.goals.get(goalType);
                // Send current state only to subscribing socket
                socket.emit('goals:update', {
                    goalType: goal.goalType,
                    enabled: goal.enabled,
                    name: goal.name,
                    currentValue: goal.currentValue,
                    targetValue: goal.targetValue,
                    startValue: goal.startValue,
                    percent: goal.percent,
                    remaining: goal.remaining,
                    isCompleted: goal.isCompleted,
                    progressionMode: goal.progressionMode,
                    incrementAmount: goal.incrementAmount,
                    style: goal.style
                });
            }
        });

        this.api.log('✅ Socket.IO handlers registered', 'info');
    }

    /**
     * Register API routes
     */
    registerRoutes() {
        // Serve UI
        const path = require('path');
        const fs = require('fs');

        this.api.registerRoute('get', '/goals/ui', (req, res) => {
            const uiPath = path.join(__dirname, 'ui.html');
            if (fs.existsSync(uiPath)) {
                res.sendFile(uiPath);
            } else {
                res.status(404).json({ success: false, error: 'UI not found' });
            }
        });

        // Serve overlay
        this.api.registerRoute('get', '/goals/overlay', (req, res) => {
            const overlayPath = path.join(__dirname, 'overlay.html');
            if (fs.existsSync(overlayPath)) {
                res.sendFile(overlayPath);
            } else {
                res.status(404).json({ success: false, error: 'Overlay not found' });
            }
        });

        // Get all goals
        this.api.registerRoute('get', '/api/goals', (req, res) => {
            try {
                this.api.log(`[DEBUG] /api/goals called`, 'info');
                this.api.log(`[DEBUG] this.goals type: ${this.goals.constructor.name}`, 'info');
                this.api.log(`[DEBUG] this.goals size: ${this.goals.size}`, 'info');

                // Ensure this.goals is a Map
                if (!(this.goals instanceof Map)) {
                    this.api.log('Warning: this.goals is not a Map, reinitializing', 'warn');
                    this.goals = new Map();
                    this.loadGoals();
                }

                // Convert Map to Array - METHOD 1: Direct array creation
                const goalsArray = [];
                this.goals.forEach((goal, key) => {
                    goalsArray.push({
                        goalType: goal.goalType,
                        enabled: goal.enabled,
                        name: goal.name,
                        currentValue: goal.currentValue,
                        targetValue: goal.targetValue,
                        startValue: goal.startValue,
                        percent: goal.percent,
                        remaining: goal.remaining,
                        isCompleted: goal.isCompleted,
                        progressionMode: goal.progressionMode,
                        incrementAmount: goal.incrementAmount,
                        style: goal.style
                    });
                });

                this.api.log(`[DEBUG] goalsArray length: ${goalsArray.length}`, 'info');
                this.api.log(`[DEBUG] goalsArray is Array: ${Array.isArray(goalsArray)}`, 'info');
                this.api.log(`[DEBUG] Returning goals to client`, 'info');

                res.json({ success: true, goals: goalsArray });
            } catch (error) {
                this.api.log(`Error in /api/goals route: ${error.message}`, 'error');
                this.api.log(`Error stack: ${error.stack}`, 'error');
                res.status(500).json({ success: false, error: error.message, goals: [] });
            }
        });

        // Get single goal
        this.api.registerRoute('get', '/api/goals/:goalType', (req, res) => {
            const goalType = req.params.goalType;
            const goal = this.goals.get(goalType);

            if (!goal) {
                return res.status(404).json({ success: false, error: 'Goal not found' });
            }

            res.json({
                success: true,
                goal: {
                    goalType: goal.goalType,
                    enabled: goal.enabled,
                    name: goal.name,
                    currentValue: goal.currentValue,
                    targetValue: goal.targetValue,
                    startValue: goal.startValue,
                    percent: goal.percent,
                    remaining: goal.remaining,
                    isCompleted: goal.isCompleted,
                    progressionMode: goal.progressionMode,
                    incrementAmount: goal.incrementAmount,
                    style: goal.style
                }
            });
        });

        // Update goal configuration
        this.api.registerRoute('post', '/api/goals/:goalType/config', async (req, res) => {
            const goalType = req.params.goalType;
            const goal = this.goals.get(goalType);

            if (!goal) {
                return res.status(404).json({ success: false, error: 'Goal not found' });
            }

            const updates = req.body;

            try {
                const db = this.api.getDatabase();

                // Build update query dynamically
                const allowedFields = ['name', 'start_value', 'target_value', 'progression_mode', 'increment_amount', 'enabled'];
                const updateFields = [];
                const updateValues = [];

                for (const field of allowedFields) {
                    if (updates[field] !== undefined) {
                        updateFields.push(`${field} = ?`);
                        updateValues.push(updates[field]);
                    }
                }

                // Handle style separately (JSON)
                if (updates.style) {
                    updateFields.push('style_json = ?');
                    updateValues.push(JSON.stringify(updates.style));
                    goal.style = updates.style;
                }

                if (updateFields.length > 0) {
                    updateFields.push('updated_at = CURRENT_TIMESTAMP');
                    updateValues.push(goalType);

                    const stmt = db.prepare(`
                        UPDATE goals_config
                        SET ${updateFields.join(', ')}
                        WHERE goal_type = ?
                    `);
                    stmt.run(...updateValues);
                }

                // Update in-memory state
                if (updates.name !== undefined) goal.name = updates.name;
                if (updates.start_value !== undefined) goal.startValue = updates.start_value;
                if (updates.target_value !== undefined) {
                    goal.targetValue = updates.target_value;
                    goal.percent = this.calculatePercent(goal.currentValue, goal.targetValue);
                    goal.remaining = Math.max(0, goal.targetValue - goal.currentValue);
                    goal.isCompleted = goal.currentValue >= goal.targetValue;
                }
                if (updates.progression_mode !== undefined) goal.progressionMode = updates.progression_mode;
                if (updates.increment_amount !== undefined) goal.incrementAmount = updates.increment_amount;
                if (updates.enabled !== undefined) goal.enabled = Boolean(updates.enabled);

                // Broadcast update
                this.broadcastGoalUpdate(goal);

                res.json({ success: true, message: 'Goal updated', goal });

            } catch (error) {
                this.api.log(`Error updating goal config: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Set goal value (absolute)
        this.api.registerRoute('post', '/api/goals/:goalType/set', async (req, res) => {
            const goalType = req.params.goalType;
            const { value } = req.body;

            if (value === undefined) {
                return res.status(400).json({ success: false, error: 'value is required' });
            }

            const goal = this.goals.get(goalType);
            if (!goal) {
                return res.status(404).json({ success: false, error: 'Goal not found' });
            }

            await this.setGoalValue(goalType, parseInt(value));

            res.json({ success: true, message: 'Goal value set', goal });
        });

        // Increment goal value (relative)
        this.api.registerRoute('post', '/api/goals/:goalType/increment', async (req, res) => {
            const goalType = req.params.goalType;
            const { delta } = req.body;

            if (delta === undefined) {
                return res.status(400).json({ success: false, error: 'delta is required' });
            }

            const goal = this.goals.get(goalType);
            if (!goal) {
                return res.status(404).json({ success: false, error: 'Goal not found' });
            }

            await this.incrementGoal(goalType, parseInt(delta));

            res.json({ success: true, message: 'Goal incremented', goal });
        });

        // Reset goal
        this.api.registerRoute('post', '/api/goals/:goalType/reset', async (req, res) => {
            const goalType = req.params.goalType;
            const goal = this.goals.get(goalType);

            if (!goal) {
                return res.status(404).json({ success: false, error: 'Goal not found' });
            }

            await this.resetGoal(goalType);

            res.json({ success: true, message: 'Goal reset', goal });
        });

        // Toggle goal enabled/disabled
        this.api.registerRoute('post', '/api/goals/:goalType/toggle', async (req, res) => {
            const goalType = req.params.goalType;
            const { enabled } = req.body;

            if (enabled === undefined) {
                return res.status(400).json({ success: false, error: 'enabled is required' });
            }

            const goal = this.goals.get(goalType);
            if (!goal) {
                return res.status(404).json({ success: false, error: 'Goal not found' });
            }

            await this.toggleGoal(goalType, Boolean(enabled));

            res.json({ success: true, message: `Goal ${enabled ? 'enabled' : 'disabled'}`, goal });
        });

        // Get Event API connection status
        this.api.registerRoute('get', '/api/goals/event-api/status', (req, res) => {
            res.json({
                success: true,
                connected: this.tikfinityConnected,
                reconnectAttempts: this.tikfinityReconnectAttempts
            });
        });

        // Update Event API config
        this.api.registerRoute('post', '/api/goals/event-api/config', (req, res) => {
            const { enabled, websocket_url, auto_reconnect } = req.body;

            try {
                const db = this.api.getDatabase();
                const updates = [];
                const values = [];

                if (enabled !== undefined) {
                    updates.push('enabled = ?');
                    values.push(enabled ? 1 : 0);
                }
                if (websocket_url !== undefined) {
                    updates.push('websocket_url = ?');
                    values.push(websocket_url);
                }
                if (auto_reconnect !== undefined) {
                    updates.push('auto_reconnect = ?');
                    values.push(auto_reconnect ? 1 : 0);
                }

                if (updates.length > 0) {
                    updates.push('updated_at = CURRENT_TIMESTAMP');
                    const stmt = db.prepare(`
                        UPDATE goals_tikfinity_config
                        SET ${updates.join(', ')}
                        WHERE id = 1
                    `);
                    stmt.run(...values);
                }

                // Reconnect if URL changed or enabled state changed
                if (websocket_url !== undefined || enabled !== undefined) {
                    if (this.tikfinityWs) {
                        this.tikfinityWs.close();
                    }
                    this.tikfinityReconnectAttempts = 0;
                    setTimeout(() => this.connectToTikFinity(), 1000);
                }

                res.json({ success: true, message: 'TikFinity config updated' });

            } catch (error) {
                this.api.log(`Error updating TikFinity config: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get goal history
        this.api.registerRoute('get', '/api/goals/:goalType/history', (req, res) => {
            const goalType = req.params.goalType;
            const limit = parseInt(req.query.limit) || 50;

            try {
                const db = this.api.getDatabase();
                const stmt = db.prepare(`
                    SELECT * FROM goals_history
                    WHERE goal_type = ?
                    ORDER BY timestamp DESC
                    LIMIT ?
                `);
                const history = stmt.all(goalType, limit);

                res.json({ success: true, history });

            } catch (error) {
                this.api.log(`Error fetching goal history: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.log('✅ API routes registered', 'info');
    }

    /**
     * Register Flow Actions for automation
     */
    registerFlowActions() {
        // This plugin exports actions that can be used in the Flow Engine
        // The Flow Engine will need to be extended to support plugin actions

        // Export available actions
        this.flowActions = {
            'goals.set_value': {
                name: 'Set Goal Value',
                description: 'Set a goal to a specific value',
                params: [
                    { name: 'goalType', type: 'select', options: this.goalTypes, required: true },
                    { name: 'value', type: 'number', required: true }
                ],
                execute: async (params) => {
                    await this.setGoalValue(params.goalType, params.value);
                }
            },
            'goals.increment': {
                name: 'Increment Goal',
                description: 'Increment a goal by a specific amount',
                params: [
                    { name: 'goalType', type: 'select', options: this.goalTypes, required: true },
                    { name: 'delta', type: 'number', required: true }
                ],
                execute: async (params) => {
                    await this.incrementGoal(params.goalType, params.delta);
                }
            },
            'goals.reset': {
                name: 'Reset Goal',
                description: 'Reset a goal to its start value',
                params: [
                    { name: 'goalType', type: 'select', options: this.goalTypes, required: true }
                ],
                execute: async (params) => {
                    await this.resetGoal(params.goalType);
                }
            },
            'goals.toggle': {
                name: 'Toggle Goal',
                description: 'Enable or disable a goal',
                params: [
                    { name: 'goalType', type: 'select', options: this.goalTypes, required: true },
                    { name: 'enabled', type: 'boolean', required: true }
                ],
                execute: async (params) => {
                    await this.toggleGoal(params.goalType, params.enabled);
                }
            }
        };

        // Store actions in plugin API for Flow Engine discovery
        this.api.flowActions = this.flowActions;

        this.api.log('✅ Flow actions registered', 'info');
    }

    /**
     * Cleanup on plugin destruction
     */
    async destroy() {
        // Close TikFinity WebSocket
        if (this.tikfinityWs) {
            this.tikfinityWs.close();
            this.tikfinityWs = null;
        }

        this.api.log('🎯 Goals Plugin destroyed', 'info');
    }
}

module.exports = GoalsPlugin;
