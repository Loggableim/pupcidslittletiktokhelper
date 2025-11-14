const Database = require('better-sqlite3');

class DatabaseManager {
    constructor(dbPath) {
        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL'); // Performance-Optimierung
        this.initializeTables();

        // Batching-System für Event-Logs
        this.eventBatchQueue = [];
        this.eventBatchSize = 100;
        this.eventBatchTimeout = 5000; // 5 Sekunden
        this.eventBatchTimer = null;

        // Flag für Shutdown-Handler (verhindert doppelte Registrierung)
        this.shutdownHandlersRegistered = false;

        // Graceful shutdown handler (nur einmal registrieren)
        this.setupShutdownHandler();
    }

    setupShutdownHandler() {
        // Verhindere doppelte Handler-Registrierung
        if (DatabaseManager.shutdownHandlersRegistered) {
            return;
        }

        const gracefulShutdown = async () => {
            // Verhindere mehrfache Ausführung
            if (this._isShuttingDown) {
                return;
            }
            this._isShuttingDown = true;

            try {
                // Flush mit Timeout-Schutz
                await Promise.race([
                    this.flushEventBatch(),
                    new Promise(resolve => setTimeout(resolve, 3000))
                ]);
                this.db.close();
            } catch (error) {
                console.error('Error during graceful shutdown:', error);
            }
        };

        process.once('SIGINT', gracefulShutdown);
        process.once('SIGTERM', gracefulShutdown);
        process.once('exit', gracefulShutdown);

        DatabaseManager.shutdownHandlersRegistered = true;
    }

    initializeTables() {
        // Globale Einstellungen
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        `);

        // Profile (verschiedene Konfigs speichern)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                config TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Event-Automatisierungen (Flows)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS flows (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                trigger_type TEXT NOT NULL,
                trigger_condition TEXT,
                actions TEXT NOT NULL,
                enabled INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Event-Log (optional, für Analytics)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS event_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                username TEXT,
                data TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Alert-Konfigurationen
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS alert_configs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT UNIQUE NOT NULL,
                sound_file TEXT,
                sound_volume INTEGER DEFAULT 80,
                text_template TEXT,
                duration INTEGER DEFAULT 5,
                enabled INTEGER DEFAULT 1
            )
        `);

        // Soundboard: Gift-spezifische Sounds
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS gift_sounds (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                gift_id INTEGER UNIQUE NOT NULL,
                label TEXT NOT NULL,
                mp3_url TEXT NOT NULL,
                volume REAL DEFAULT 1.0,
                animation_url TEXT,
                animation_type TEXT DEFAULT 'none',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Gift-Katalog (Cache der verfügbaren TikTok Gifts)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS gift_catalog (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                image_url TEXT,
                diamond_count INTEGER DEFAULT 0,
                last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // HUD-Element-Konfigurationen (Position und Sichtbarkeit)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS hud_elements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                element_id TEXT UNIQUE NOT NULL,
                enabled INTEGER DEFAULT 1,
                position_x REAL DEFAULT 0,
                position_y REAL DEFAULT 0,
                position_unit TEXT DEFAULT 'px',
                width REAL DEFAULT 0,
                height REAL DEFAULT 0,
                anchor TEXT DEFAULT 'top-left',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Emoji Rain HUD Konfiguration
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS emoji_rain_config (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                enabled INTEGER DEFAULT 1,
                config_json TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // PATCH: VDO.Ninja Multi-Guest Integration - Rooms
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS vdoninja_rooms (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                room_name TEXT UNIQUE NOT NULL,
                room_id TEXT UNIQUE NOT NULL,
                password TEXT,
                max_guests INTEGER DEFAULT 6,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_used DATETIME
            )
        `);

        // PATCH: VDO.Ninja Multi-Guest Integration - Guests
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS vdoninja_guests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                room_id INTEGER REFERENCES vdoninja_rooms(id) ON DELETE CASCADE,
                slot_number INTEGER NOT NULL,
                stream_id TEXT,
                guest_name TEXT,
                is_connected INTEGER DEFAULT 0,
                audio_enabled INTEGER DEFAULT 1,
                video_enabled INTEGER DEFAULT 1,
                volume REAL DEFAULT 1.0,
                layout_position_x REAL DEFAULT 0,
                layout_position_y REAL DEFAULT 0,
                layout_width REAL DEFAULT 100,
                layout_height REAL DEFAULT 100,
                joined_at DATETIME,
                UNIQUE(room_id, slot_number)
            )
        `);

        // PATCH: VDO.Ninja Multi-Guest Integration - Layout Presets
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS vdoninja_layouts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                layout_type TEXT NOT NULL,
                layout_config TEXT NOT NULL,
                thumbnail_url TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // PATCH: VDO.Ninja Multi-Guest Integration - Guest Events
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS vdoninja_guest_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guest_id INTEGER REFERENCES vdoninja_guests(id) ON DELETE CASCADE,
                event_type TEXT NOT NULL,
                event_data TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Gift Milestone Celebration Plugin
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS milestone_config (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                enabled INTEGER DEFAULT 1,
                threshold INTEGER DEFAULT 1000,
                mode TEXT DEFAULT 'auto_increment',
                increment_step INTEGER DEFAULT 1000,
                animation_gif_path TEXT,
                animation_video_path TEXT,
                animation_audio_path TEXT,
                audio_volume INTEGER DEFAULT 80,
                playback_mode TEXT DEFAULT 'exclusive',
                animation_duration INTEGER DEFAULT 0,
                session_reset INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS milestone_stats (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                cumulative_coins INTEGER DEFAULT 0,
                current_milestone INTEGER DEFAULT 0,
                last_trigger_at DATETIME,
                session_start_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Default-Einstellungen setzen
        this.setDefaultSettings();
        this.initializeEmojiRainDefaults();
        this.initializeDefaultVDONinjaLayouts(); // PATCH: VDO.Ninja Default Layouts
        this.initializeMilestoneDefaults(); // Gift Milestone Celebration Plugin
    }

    setDefaultSettings() {
        const defaults = {
            'alert_gift_min_coins': '100',
            'theme': 'dark',
            // Quick Actions Einstellungen
            'tts_enabled': 'true',
            'soundboard_enabled': 'true',
            'flows_enabled': 'true',
            // Soundboard Einstellungen
            'soundboard_play_mode': 'overlap', // overlap or sequential (managed in frontend)
            'soundboard_max_queue_length': '10',
            'soundboard_like_threshold': '0',
            'soundboard_like_window_seconds': '10',
            'soundboard_follow_sound': '',
            'soundboard_follow_volume': '1.0',
            'soundboard_subscribe_sound': '',
            'soundboard_subscribe_volume': '1.0',
            'soundboard_share_sound': '',
            'soundboard_share_volume': '1.0',
            'soundboard_like_sound': '',
            'soundboard_like_volume': '1.0',
            'soundboard_default_gift_sound': '',
            'soundboard_gift_volume': '1.0',
            // HUD/Overlay Einstellungen
            'hud_resolution': '1920x1080',
            'hud_orientation': 'landscape'
        };

        const stmt = this.db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
        for (const [key, value] of Object.entries(defaults)) {
            stmt.run(key, value);
        }

        // Standard HUD-Element Positionen initialisieren
        this.initializeDefaultHudElements();
    }

    initializeDefaultHudElements() {
        const defaultElements = [
            { element_id: 'alert', enabled: 1, position_x: 50, position_y: 50, position_unit: '%', width: 400, height: 200, anchor: 'center' },
            { element_id: 'event-feed', enabled: 1, position_x: 30, position_y: 120, position_unit: 'px', width: 400, height: 400, anchor: 'bottom-left' },
            { element_id: 'chat', enabled: 1, position_x: 30, position_y: 30, position_unit: 'px', width: 450, height: 600, anchor: 'bottom-right' },
            { element_id: 'goal', enabled: 1, position_x: 50, position_y: 30, position_unit: '%', width: 500, height: 80, anchor: 'top-center' }
        ];

        const stmt = this.db.prepare(`
            INSERT OR IGNORE INTO hud_elements (element_id, enabled, position_x, position_y, position_unit, width, height, anchor)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const element of defaultElements) {
            stmt.run(
                element.element_id,
                element.enabled,
                element.position_x,
                element.position_y,
                element.position_unit,
                element.width,
                element.height,
                element.anchor
            );
        }
    }

    // ========== SETTINGS ==========
    getSetting(key) {
        const stmt = this.db.prepare('SELECT value FROM settings WHERE key = ?');
        const result = stmt.get(key);
        return result ? result.value : null;
    }

    getAllSettings() {
        const stmt = this.db.prepare('SELECT * FROM settings');
        const rows = stmt.all();
        const settings = {};
        rows.forEach(row => {
            settings[row.key] = row.value;
        });
        return settings;
    }

    setSetting(key, value) {
        const stmt = this.db.prepare(`
            INSERT INTO settings (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `);
        stmt.run(key, String(value));
    }

    // ========== FLOWS ==========
    getFlows() {
        const stmt = this.db.prepare('SELECT * FROM flows ORDER BY created_at DESC');
        const rows = stmt.all();
        return rows.map(row => ({
            ...row,
            trigger_condition: row.trigger_condition ? JSON.parse(row.trigger_condition) : null,
            actions: JSON.parse(row.actions),
            enabled: Boolean(row.enabled)
        }));
    }

    getFlow(id) {
        const stmt = this.db.prepare('SELECT * FROM flows WHERE id = ?');
        const row = stmt.get(id);
        if (!row) return null;
        return {
            ...row,
            trigger_condition: row.trigger_condition ? JSON.parse(row.trigger_condition) : null,
            actions: JSON.parse(row.actions),
            enabled: Boolean(row.enabled)
        };
    }

    getEnabledFlows() {
        const stmt = this.db.prepare('SELECT * FROM flows WHERE enabled = 1 ORDER BY created_at ASC');
        const rows = stmt.all();
        return rows.map(row => ({
            ...row,
            trigger_condition: row.trigger_condition ? JSON.parse(row.trigger_condition) : null,
            actions: JSON.parse(row.actions),
            enabled: Boolean(row.enabled)
        }));
    }

    createFlow(flow) {
        const stmt = this.db.prepare(`
            INSERT INTO flows (name, trigger_type, trigger_condition, actions, enabled)
            VALUES (?, ?, ?, ?, ?)
        `);
        const info = stmt.run(
            flow.name,
            flow.trigger_type,
            flow.trigger_condition ? JSON.stringify(flow.trigger_condition) : null,
            JSON.stringify(flow.actions),
            flow.enabled ? 1 : 0
        );
        return info.lastInsertRowid;
    }

    updateFlow(id, flow) {
        const stmt = this.db.prepare(`
            UPDATE flows
            SET name = ?, trigger_type = ?, trigger_condition = ?, actions = ?, enabled = ?
            WHERE id = ?
        `);
        stmt.run(
            flow.name,
            flow.trigger_type,
            flow.trigger_condition ? JSON.stringify(flow.trigger_condition) : null,
            JSON.stringify(flow.actions),
            flow.enabled ? 1 : 0,
            id
        );
    }

    deleteFlow(id) {
        const stmt = this.db.prepare('DELETE FROM flows WHERE id = ?');
        stmt.run(id);
    }

    toggleFlow(id, enabled) {
        const stmt = this.db.prepare('UPDATE flows SET enabled = ? WHERE id = ?');
        stmt.run(enabled ? 1 : 0, id);
    }

    // ========== ALERT CONFIGS ==========
    getAlertConfig(eventType) {
        const stmt = this.db.prepare('SELECT * FROM alert_configs WHERE event_type = ?');
        const row = stmt.get(eventType);
        return row ? { ...row, enabled: Boolean(row.enabled) } : null;
    }

    getAllAlertConfigs() {
        const stmt = this.db.prepare('SELECT * FROM alert_configs');
        const rows = stmt.all();
        return rows.map(row => ({ ...row, enabled: Boolean(row.enabled) }));
    }

    setAlertConfig(eventType, config) {
        const stmt = this.db.prepare(`
            INSERT INTO alert_configs (event_type, sound_file, sound_volume, text_template, duration, enabled)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(event_type) DO UPDATE SET
                sound_file = excluded.sound_file,
                sound_volume = excluded.sound_volume,
                text_template = excluded.text_template,
                duration = excluded.duration,
                enabled = excluded.enabled
        `);
        stmt.run(
            eventType,
            config.sound_file || null,
            config.sound_volume || 80,
            config.text_template || '',
            config.duration || 5,
            config.enabled ? 1 : 0
        );
    }

    // ========== EVENT LOGS ==========
    logEvent(eventType, username, data) {
        // Add to batch queue
        this.eventBatchQueue.push({
            eventType,
            username,
            data: JSON.stringify(data)
        });

        // Check if batch is full
        if (this.eventBatchQueue.length >= this.eventBatchSize) {
            this.flushEventBatch();
        } else {
            // Reset timer
            if (this.eventBatchTimer) {
                clearTimeout(this.eventBatchTimer);
            }
            this.eventBatchTimer = setTimeout(() => {
                this.flushEventBatch();
            }, this.eventBatchTimeout);
        }
    }

    flushEventBatch() {
        if (this.eventBatchQueue.length === 0) {
            return Promise.resolve();
        }

        // Clear timer
        if (this.eventBatchTimer) {
            clearTimeout(this.eventBatchTimer);
            this.eventBatchTimer = null;
        }

        // Snapshot der Queue (verhindert Race Conditions)
        const eventsToFlush = [...this.eventBatchQueue];
        this.eventBatchQueue = [];

        return new Promise((resolve, reject) => {
            try {
                // Prepare batch insert
                const stmt = this.db.prepare(`
                    INSERT INTO event_logs (event_type, username, data)
                    VALUES (?, ?, ?)
                `);

                // Use transaction for batch insert
                const insertMany = this.db.transaction((events) => {
                    for (const event of events) {
                        stmt.run(event.eventType, event.username, event.data);
                    }
                });

                insertMany(eventsToFlush);
                resolve();
            } catch (error) {
                console.error('Error flushing event batch:', error);
                // Bei Fehler zurück in Queue
                this.eventBatchQueue.unshift(...eventsToFlush);
                reject(error);
            }
        });
    }

    getEventLogs(limit = 100) {
        const stmt = this.db.prepare('SELECT * FROM event_logs ORDER BY timestamp DESC LIMIT ?');
        const rows = stmt.all(limit);
        return rows.map(row => ({
            ...row,
            data: JSON.parse(row.data)
        }));
    }

    clearEventLogs() {
        const stmt = this.db.prepare('DELETE FROM event_logs');
        stmt.run();
    }

    // ========== PROFILES ==========
    getProfiles() {
        const stmt = this.db.prepare('SELECT * FROM profiles ORDER BY created_at DESC');
        const rows = stmt.all();
        return rows.map(row => ({
            ...row,
            config: JSON.parse(row.config)
        }));
    }

    getProfile(id) {
        const stmt = this.db.prepare('SELECT * FROM profiles WHERE id = ?');
        const row = stmt.get(id);
        if (!row) return null;
        return {
            ...row,
            config: JSON.parse(row.config)
        };
    }

    createProfile(name, config) {
        const stmt = this.db.prepare('INSERT INTO profiles (name, config) VALUES (?, ?)');
        const info = stmt.run(name, JSON.stringify(config));
        return info.lastInsertRowid;
    }

    deleteProfile(id) {
        const stmt = this.db.prepare('DELETE FROM profiles WHERE id = ?');
        stmt.run(id);
    }

    // ========== GIFT CATALOG ==========
    getGiftCatalog() {
        const stmt = this.db.prepare('SELECT * FROM gift_catalog ORDER BY diamond_count DESC');
        return stmt.all();
    }

    getGift(id) {
        const stmt = this.db.prepare('SELECT * FROM gift_catalog WHERE id = ?');
        return stmt.get(id);
    }

    updateGiftCatalog(gifts) {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO gift_catalog (id, name, image_url, diamond_count, last_updated)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);

        const transaction = this.db.transaction((giftsArray) => {
            for (const gift of giftsArray) {
                stmt.run(gift.id, gift.name, gift.image_url || null, gift.diamond_count || 0);
            }
        });

        transaction(gifts);
        return gifts.length;
    }

    clearGiftCatalog() {
        const stmt = this.db.prepare('DELETE FROM gift_catalog');
        stmt.run();
    }

    getCatalogLastUpdate() {
        const stmt = this.db.prepare('SELECT MAX(last_updated) as last_update FROM gift_catalog');
        const result = stmt.get();
        return result ? result.last_update : null;
    }

    // ========== HUD ELEMENTS ==========
    getHudElement(elementId) {
        const stmt = this.db.prepare('SELECT * FROM hud_elements WHERE element_id = ?');
        const row = stmt.get(elementId);
        return row ? { ...row, enabled: Boolean(row.enabled) } : null;
    }

    getAllHudElements() {
        const stmt = this.db.prepare('SELECT * FROM hud_elements ORDER BY element_id');
        const rows = stmt.all();
        return rows.map(row => ({ ...row, enabled: Boolean(row.enabled) }));
    }

    setHudElement(elementId, config) {
        const stmt = this.db.prepare(`
            INSERT INTO hud_elements (element_id, enabled, position_x, position_y, position_unit, width, height, anchor, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(element_id) DO UPDATE SET
                enabled = excluded.enabled,
                position_x = excluded.position_x,
                position_y = excluded.position_y,
                position_unit = excluded.position_unit,
                width = excluded.width,
                height = excluded.height,
                anchor = excluded.anchor,
                updated_at = CURRENT_TIMESTAMP
        `);
        stmt.run(
            elementId,
            config.enabled ? 1 : 0,
            config.position_x,
            config.position_y,
            config.position_unit || 'px',
            config.width || 0,
            config.height || 0,
            config.anchor || 'top-left'
        );
    }

    updateHudElementPosition(elementId, positionX, positionY, unit = 'px', anchor = 'top-left') {
        const stmt = this.db.prepare(`
            UPDATE hud_elements
            SET position_x = ?, position_y = ?, position_unit = ?, anchor = ?, updated_at = CURRENT_TIMESTAMP
            WHERE element_id = ?
        `);
        stmt.run(positionX, positionY, unit, anchor, elementId);
    }

    updateHudElementSize(elementId, width, height) {
        const stmt = this.db.prepare(`
            UPDATE hud_elements
            SET width = ?, height = ?, updated_at = CURRENT_TIMESTAMP
            WHERE element_id = ?
        `);
        stmt.run(width, height, elementId);
    }

    toggleHudElement(elementId, enabled) {
        const stmt = this.db.prepare(`
            UPDATE hud_elements
            SET enabled = ?, updated_at = CURRENT_TIMESTAMP
            WHERE element_id = ?
        `);
        stmt.run(enabled ? 1 : 0, elementId);
    }

    /**
     * Initialize default Emoji Rain configuration
     */
    initializeEmojiRainDefaults() {
        console.log('🔧 [DATABASE] initializeEmojiRainDefaults() called');

        const defaultConfig = {
            // OBS HUD Settings
            obs_hud_enabled: true,
            obs_hud_width: 1920,
            obs_hud_height: 1080,
            enable_glow: true,
            enable_particles: true,
            enable_depth: true,
            target_fps: 60,

            // Standard Canvas Settings
            width_px: 1280,
            height_px: 720,

            // Emoji Set
            emoji_set: ["💧","💙","💚","💜","❤️","🩵","✨","🌟","🔥","🎉"],

            // Custom Images
            use_custom_images: false,
            image_urls: [],

            // Effect
            effect: 'bounce', // 'bounce' | 'bubble' | 'none'

            // Physics Settings
            physics_gravity_y: 1.0,
            physics_air: 0.02,
            physics_friction: 0.1,
            physics_restitution: 0.6,
            physics_wind_strength: 0.0005,
            physics_wind_variation: 0.0003,

            // Appearance Settings
            emoji_min_size_px: 40,
            emoji_max_size_px: 80,
            emoji_rotation_speed: 0.05,
            emoji_lifetime_ms: 8000,
            emoji_fade_duration_ms: 1000,
            max_emojis_on_screen: 200,

            // Scaling Rules
            like_count_divisor: 10,
            like_min_emojis: 1,
            like_max_emojis: 20,
            gift_base_emojis: 3,
            gift_coin_multiplier: 0.1,
            gift_max_emojis: 50
        };

        // Check if row exists
        const checkStmt = this.db.prepare('SELECT * FROM emoji_rain_config WHERE id = 1');
        const existing = checkStmt.get();

        console.log('🔍 [DATABASE] Existing config:', existing ? 'found' : 'not found');

        if (existing) {
            // Migrate old config to new format
            console.log('🔄 [DATABASE] Migrating existing config...');
            try {
                const oldConfig = JSON.parse(existing.config_json);
                console.log('🔍 [DATABASE] Old config keys:', Object.keys(oldConfig).join(', '));

                // Merge old config with new defaults (new defaults take precedence for new fields)
                const migratedConfig = {
                    ...defaultConfig,
                    // Keep old values if they exist
                    ...(oldConfig.width_px && { width_px: oldConfig.width_px }),
                    ...(oldConfig.height_px && { height_px: oldConfig.height_px }),
                    ...(oldConfig.emoji_set && { emoji_set: oldConfig.emoji_set }),
                    ...(oldConfig.physics_gravity_y !== undefined && { physics_gravity_y: oldConfig.physics_gravity_y }),
                    ...(oldConfig.physics_air !== undefined && { physics_air: oldConfig.physics_air }),
                    ...(oldConfig.physics_restitution !== undefined && { physics_restitution: oldConfig.physics_restitution }),
                    // Map old field names to new ones
                    ...(oldConfig.size_min_px && { emoji_min_size_px: oldConfig.size_min_px }),
                    ...(oldConfig.size_max_px && { emoji_max_size_px: oldConfig.size_max_px }),
                    ...(oldConfig.drop_despawn_s && { emoji_lifetime_ms: oldConfig.drop_despawn_s * 1000 }),
                    ...(oldConfig.max_active && { max_emojis_on_screen: oldConfig.max_active }),
                    ...(oldConfig.physics_wind_force !== undefined && { physics_wind_strength: oldConfig.physics_wind_force })
                };

                const updateStmt = this.db.prepare(`
                    UPDATE emoji_rain_config
                    SET config_json = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = 1
                `);
                updateStmt.run(JSON.stringify(migratedConfig));
                console.log('✅ [DATABASE] Config migrated successfully');
                console.log('✅ [DATABASE] Migrated config emoji_set:', migratedConfig.emoji_set);
            } catch (error) {
                console.error('❌ [DATABASE] Error migrating emoji rain config:', error);
                // If migration fails, just insert defaults
                const updateStmt = this.db.prepare(`
                    UPDATE emoji_rain_config
                    SET config_json = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = 1
                `);
                updateStmt.run(JSON.stringify(defaultConfig));
            }
        } else {
            // Insert new default config
            console.log('➕ [DATABASE] Inserting new default config...');
            const stmt = this.db.prepare(`
                INSERT INTO emoji_rain_config (id, enabled, config_json)
                VALUES (1, 1, ?)
            `);
            stmt.run(JSON.stringify(defaultConfig));
            console.log('✅ [DATABASE] Default config inserted successfully');
            console.log('✅ [DATABASE] Default emoji_set:', defaultConfig.emoji_set);
        }
    }

    /**
     * Get Emoji Rain configuration
     */
    getEmojiRainConfig() {
        console.log('🔍 [DATABASE] getEmojiRainConfig() called');
        const stmt = this.db.prepare('SELECT * FROM emoji_rain_config WHERE id = 1');
        const row = stmt.get();

        console.log('🔍 [DATABASE] Row retrieved:', row ? 'exists' : 'null');

        if (!row) {
            // Fallback: initialize and return
            console.log('⚠️ [DATABASE] No config found, initializing defaults...');
            this.initializeEmojiRainDefaults();
            return this.getEmojiRainConfig();
        }

        console.log('🔍 [DATABASE] row.enabled:', row.enabled);
        console.log('🔍 [DATABASE] row.config_json length:', row.config_json ? row.config_json.length : 0);

        // Return flat config object with enabled flag
        const configData = JSON.parse(row.config_json);
        console.log('🔍 [DATABASE] Parsed config_json:', JSON.stringify(configData).substring(0, 200));
        console.log('🔍 [DATABASE] configData.emoji_set:', configData.emoji_set);
        console.log('🔍 [DATABASE] configData.emoji_set type:', typeof configData.emoji_set, Array.isArray(configData.emoji_set));

        const result = {
            enabled: Boolean(row.enabled),
            ...configData
        };

        console.log('✅ [DATABASE] Returning config with', Object.keys(result).length, 'keys');
        console.log('✅ [DATABASE] result.enabled:', result.enabled);
        console.log('✅ [DATABASE] result.emoji_set:', result.emoji_set);

        return result;
    }

    /**
     * Update Emoji Rain configuration
     */
    updateEmojiRainConfig(config, enabled = null) {
        const current = this.getEmojiRainConfig();

        // Extract enabled from current config
        const { enabled: currentEnabled, ...currentConfigData } = current;

        // Determine new enabled state
        const newEnabled = enabled !== null ? (enabled ? 1 : 0) : (currentEnabled ? 1 : 0);

        // Merge configs (exclude 'enabled' from config object as it's stored separately)
        const { enabled: _, ...newConfigData } = config;
        const mergedConfig = { ...currentConfigData, ...newConfigData };

        const stmt = this.db.prepare(`
            UPDATE emoji_rain_config
            SET config_json = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
        `);
        stmt.run(JSON.stringify(mergedConfig), newEnabled);

        return {
            enabled: Boolean(newEnabled),
            ...mergedConfig
        };
    }

    /**
     * Toggle Emoji Rain enabled state
     */
    toggleEmojiRain(enabled) {
        const stmt = this.db.prepare(`
            UPDATE emoji_rain_config
            SET enabled = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
        `);
        stmt.run(enabled ? 1 : 0);
    }

    // ========== PATCH: VDO.NINJA DEFAULT LAYOUTS ==========
    initializeDefaultVDONinjaLayouts() {
        const defaults = [
            {
                name: 'Grid 2x2',
                type: 'grid',
                config: JSON.stringify({
                    rows: 2,
                    cols: 2,
                    slots: [
                        { slot: 0, x: 0, y: 0, w: 50, h: 50 },
                        { slot: 1, x: 50, y: 0, w: 50, h: 50 },
                        { slot: 2, x: 0, y: 50, w: 50, h: 50 },
                        { slot: 3, x: 50, y: 50, w: 50, h: 50 }
                    ]
                })
            },
            {
                name: 'Grid 3x2',
                type: 'grid',
                config: JSON.stringify({
                    rows: 2,
                    cols: 3,
                    slots: [
                        { slot: 0, x: 0, y: 0, w: 33.33, h: 50 },
                        { slot: 1, x: 33.33, y: 0, w: 33.33, h: 50 },
                        { slot: 2, x: 66.66, y: 0, w: 33.33, h: 50 },
                        { slot: 3, x: 0, y: 50, w: 33.33, h: 50 },
                        { slot: 4, x: 33.33, y: 50, w: 33.33, h: 50 },
                        { slot: 5, x: 66.66, y: 50, w: 33.33, h: 50 }
                    ]
                })
            },
            {
                name: 'Solo',
                type: 'solo',
                config: JSON.stringify({
                    slots: [
                        { slot: 0, x: 0, y: 0, w: 100, h: 100 }
                    ]
                })
            },
            {
                name: 'PIP',
                type: 'pip',
                config: JSON.stringify({
                    slots: [
                        { slot: 0, x: 0, y: 0, w: 100, h: 100 },
                        { slot: 1, x: 75, y: 75, w: 20, h: 20 }
                    ]
                })
            }
        ];

        const stmt = this.db.prepare(`
            INSERT OR IGNORE INTO vdoninja_layouts (name, layout_type, layout_config)
            VALUES (?, ?, ?)
        `);

        for (const layout of defaults) {
            stmt.run(layout.name, layout.type, layout.config);
        }
    }

    // ========== PATCH: VDO.NINJA ROOM METHODS ==========
    createVDONinjaRoom(roomName, roomId, password, maxGuests) {
        const stmt = this.db.prepare(`
            INSERT INTO vdoninja_rooms (room_name, room_id, password, max_guests, last_used)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);
        const info = stmt.run(roomName, roomId, password, maxGuests);
        return info.lastInsertRowid;
    }

    getVDONinjaRoom(roomId) {
        const stmt = this.db.prepare('SELECT * FROM vdoninja_rooms WHERE room_id = ?');
        return stmt.get(roomId);
    }

    getAllVDONinjaRooms() {
        const stmt = this.db.prepare('SELECT * FROM vdoninja_rooms ORDER BY last_used DESC');
        return stmt.all();
    }

    updateVDONinjaRoom(id, updates) {
        const fields = [];
        const values = [];

        for (const [key, value] of Object.entries(updates)) {
            fields.push(`${key} = ?`);
            values.push(value);
        }

        values.push(id);

        const stmt = this.db.prepare(`
            UPDATE vdoninja_rooms
            SET ${fields.join(', ')}, last_used = CURRENT_TIMESTAMP
            WHERE id = ?
        `);
        stmt.run(...values);
    }

    deleteVDONinjaRoom(id) {
        const stmt = this.db.prepare('DELETE FROM vdoninja_rooms WHERE id = ?');
        stmt.run(id);
    }

    // ========== PATCH: VDO.NINJA GUEST METHODS ==========
    addGuest(roomId, slotNumber, streamId, guestName) {
        const stmt = this.db.prepare(`
            INSERT INTO vdoninja_guests (room_id, slot_number, stream_id, guest_name, is_connected, joined_at)
            VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
        `);
        const info = stmt.run(roomId, slotNumber, streamId, guestName);
        return info.lastInsertRowid;
    }

    getGuest(id) {
        const stmt = this.db.prepare('SELECT * FROM vdoninja_guests WHERE id = ?');
        return stmt.get(id);
    }

    getGuestsByRoom(roomId) {
        const stmt = this.db.prepare('SELECT * FROM vdoninja_guests WHERE room_id = ? ORDER BY slot_number');
        return stmt.all(roomId);
    }

    updateGuestStatus(id, updates) {
        const fields = [];
        const values = [];

        for (const [key, value] of Object.entries(updates)) {
            fields.push(`${key} = ?`);
            values.push(value);
        }

        values.push(id);

        const stmt = this.db.prepare(`
            UPDATE vdoninja_guests
            SET ${fields.join(', ')}
            WHERE id = ?
        `);
        stmt.run(...values);
    }

    removeGuest(id) {
        const stmt = this.db.prepare('DELETE FROM vdoninja_guests WHERE id = ?');
        stmt.run(id);
    }

    // ========== PATCH: VDO.NINJA LAYOUT METHODS ==========
    saveLayout(name, type, config, thumbnailUrl = null) {
        const stmt = this.db.prepare(`
            INSERT INTO vdoninja_layouts (name, layout_type, layout_config, thumbnail_url)
            VALUES (?, ?, ?, ?)
        `);
        const info = stmt.run(name, type, JSON.stringify(config), thumbnailUrl);
        return info.lastInsertRowid;
    }

    getLayout(id) {
        const stmt = this.db.prepare('SELECT * FROM vdoninja_layouts WHERE id = ?');
        const row = stmt.get(id);
        if (!row) return null;
        return {
            ...row,
            layout_config: JSON.parse(row.layout_config)
        };
    }

    getAllLayouts() {
        const stmt = this.db.prepare('SELECT * FROM vdoninja_layouts ORDER BY created_at DESC');
        const rows = stmt.all();
        return rows.map(row => ({
            ...row,
            layout_config: JSON.parse(row.layout_config)
        }));
    }

    deleteLayout(id) {
        const stmt = this.db.prepare('DELETE FROM vdoninja_layouts WHERE id = ?');
        stmt.run(id);
    }

    // ========== PATCH: VDO.NINJA EVENT LOGGING ==========
    logGuestEvent(guestId, eventType, eventData) {
        const stmt = this.db.prepare(`
            INSERT INTO vdoninja_guest_events (guest_id, event_type, event_data)
            VALUES (?, ?, ?)
        `);
        stmt.run(guestId, eventType, JSON.stringify(eventData));
    }

    getGuestEventHistory(guestId, limit = 100) {
        const stmt = this.db.prepare(`
            SELECT * FROM vdoninja_guest_events
            WHERE guest_id = ?
            ORDER BY timestamp DESC
            LIMIT ?
        `);
        const rows = stmt.all(guestId, limit);
        return rows.map(row => ({
            ...row,
            event_data: JSON.parse(row.event_data)
        }));
    }

    // ========== GIFT MILESTONE CELEBRATION METHODS ==========

    /**
     * Initialize default Milestone configuration
     */
    initializeMilestoneDefaults() {
        const defaultConfig = {
            enabled: 1,
            threshold: 1000,
            mode: 'auto_increment',
            increment_step: 1000,
            animation_gif_path: null,
            animation_video_path: null,
            animation_audio_path: null,
            audio_volume: 80,
            playback_mode: 'exclusive',
            animation_duration: 0,
            session_reset: 0
        };

        const stmt = this.db.prepare(`
            INSERT OR IGNORE INTO milestone_config (
                id, enabled, threshold, mode, increment_step,
                audio_volume, playback_mode, animation_duration, session_reset
            )
            VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
            defaultConfig.enabled,
            defaultConfig.threshold,
            defaultConfig.mode,
            defaultConfig.increment_step,
            defaultConfig.audio_volume,
            defaultConfig.playback_mode,
            defaultConfig.animation_duration,
            defaultConfig.session_reset
        );

        // Initialize stats with default threshold
        const statsStmt = this.db.prepare(`
            INSERT OR IGNORE INTO milestone_stats (id, cumulative_coins, current_milestone)
            VALUES (1, 0, ?)
        `);
        statsStmt.run(defaultConfig.threshold);
    }

    /**
     * Get Milestone configuration
     */
    getMilestoneConfig() {
        const stmt = this.db.prepare('SELECT * FROM milestone_config WHERE id = 1');
        const row = stmt.get();
        if (!row) return null;
        return {
            ...row,
            enabled: Boolean(row.enabled),
            session_reset: Boolean(row.session_reset)
        };
    }

    /**
     * Update Milestone configuration
     */
    updateMilestoneConfig(config) {
        const stmt = this.db.prepare(`
            UPDATE milestone_config
            SET enabled = ?,
                threshold = ?,
                mode = ?,
                increment_step = ?,
                animation_gif_path = ?,
                animation_video_path = ?,
                animation_audio_path = ?,
                audio_volume = ?,
                playback_mode = ?,
                animation_duration = ?,
                session_reset = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
        `);
        stmt.run(
            config.enabled ? 1 : 0,
            config.threshold || 1000,
            config.mode || 'auto_increment',
            config.increment_step || 1000,
            config.animation_gif_path || null,
            config.animation_video_path || null,
            config.animation_audio_path || null,
            config.audio_volume || 80,
            config.playback_mode || 'exclusive',
            config.animation_duration || 0,
            config.session_reset ? 1 : 0
        );
    }

    /**
     * Toggle Milestone enabled/disabled
     */
    toggleMilestone(enabled) {
        const stmt = this.db.prepare(`
            UPDATE milestone_config
            SET enabled = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
        `);
        stmt.run(enabled ? 1 : 0);
    }

    /**
     * Get Milestone statistics
     */
    getMilestoneStats() {
        const stmt = this.db.prepare('SELECT * FROM milestone_stats WHERE id = 1');
        return stmt.get();
    }

    /**
     * Add coins to milestone tracker and check if milestone reached
     * @returns {object} { triggered: boolean, milestone: number, coins: number }
     */
    addCoinsToMilestone(coins) {
        const config = this.getMilestoneConfig();
        const stats = this.getMilestoneStats();

        if (!config || !config.enabled) {
            return { triggered: false, milestone: 0, coins: stats ? stats.cumulative_coins : 0 };
        }

        const previousCoins = stats.cumulative_coins || 0;
        const newCoins = previousCoins + coins;
        const currentMilestone = stats.current_milestone || config.threshold;

        let triggered = false;
        let newMilestone = currentMilestone;

        // Check if milestone reached
        if (previousCoins < currentMilestone && newCoins >= currentMilestone) {
            triggered = true;

            // Calculate next milestone based on mode
            if (config.mode === 'auto_increment') {
                newMilestone = currentMilestone + config.increment_step;
            } else {
                // Fixed mode - milestone stays the same
                newMilestone = currentMilestone;
            }

            // Update stats with trigger
            const updateStmt = this.db.prepare(`
                UPDATE milestone_stats
                SET cumulative_coins = ?,
                    current_milestone = ?,
                    last_trigger_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = 1
            `);
            updateStmt.run(newCoins, newMilestone);
        } else {
            // Just update coins
            const updateStmt = this.db.prepare(`
                UPDATE milestone_stats
                SET cumulative_coins = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = 1
            `);
            updateStmt.run(newCoins);
        }

        return {
            triggered: triggered,
            milestone: currentMilestone,
            coins: newCoins,
            nextMilestone: newMilestone
        };
    }

    /**
     * Reset milestone statistics (manual or session reset)
     */
    resetMilestoneStats() {
        const config = this.getMilestoneConfig();
        const stmt = this.db.prepare(`
            UPDATE milestone_stats
            SET cumulative_coins = 0,
                current_milestone = ?,
                session_start_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
        `);
        stmt.run(config ? config.threshold : 1000);
    }

    /**
     * Update only the cumulative coins (without milestone check)
     */
    updateMilestoneCoins(coins) {
        const stmt = this.db.prepare(`
            UPDATE milestone_stats
            SET cumulative_coins = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
        `);
        stmt.run(coins);
    }

    /**
     * Expose prepare() method for other modules (subscription-tiers, leaderboard)
     */
    prepare(sql) {
        return this.db.prepare(sql);
    }

    /**
     * Expose exec() method for other modules
     */
    exec(sql) {
        return this.db.exec(sql);
    }

    close() {
        this.db.close();
    }
}

module.exports = DatabaseManager;
