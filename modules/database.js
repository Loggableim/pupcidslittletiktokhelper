const Database = require('better-sqlite3');

class DatabaseManager {
    constructor(dbPath) {
        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL'); // Performance-Optimierung
        this.initializeTables();
    }

    initializeTables() {
        // User-Voice Mappings (TTS)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS user_voices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                voice TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_used DATETIME
            )
        `);

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

        // Default-Einstellungen setzen
        this.setDefaultSettings();
        this.initializeEmojiRainDefaults();
        this.initializeDefaultVDONinjaLayouts(); // PATCH: VDO.Ninja Default Layouts
    }

    setDefaultSettings() {
        const defaults = {
            'default_voice': 'en_us_ghostface',
            'tts_speed': '1.0',
            'tts_volume': '80',
            'tts_chat_enabled': 'false',
            'tts_min_coins': '0',
            'tts_min_team_level': '0',
            'alert_gift_min_coins': '100',
            'theme': 'dark',
            // Soundboard Einstellungen
            'soundboard_enabled': 'true',
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

    // ========== USER VOICES ==========
    getUserVoice(username) {
        const stmt = this.db.prepare('SELECT voice FROM user_voices WHERE username = ?');
        const result = stmt.get(username);
        return result ? result.voice : null;
    }

    getUserVoices() {
        const stmt = this.db.prepare('SELECT * FROM user_voices ORDER BY last_used DESC');
        return stmt.all();
    }

    setUserVoice(username, voice) {
        const stmt = this.db.prepare(`
            INSERT INTO user_voices (username, voice, last_used)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(username) DO UPDATE SET
                voice = excluded.voice,
                last_used = CURRENT_TIMESTAMP
        `);
        stmt.run(username, voice);
    }

    deleteUserVoice(username) {
        const stmt = this.db.prepare('DELETE FROM user_voices WHERE username = ?');
        stmt.run(username);
    }

    updateUserVoiceLastUsed(username) {
        const stmt = this.db.prepare('UPDATE user_voices SET last_used = CURRENT_TIMESTAMP WHERE username = ?');
        stmt.run(username);
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
        const stmt = this.db.prepare(`
            INSERT INTO event_logs (event_type, username, data)
            VALUES (?, ?, ?)
        `);
        stmt.run(eventType, username, JSON.stringify(data));
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
        const defaultConfig = {
            width_px: 1280,
            height_px: 720,
            transparent_bg: true,
            bg_color: "rgba(0,0,0,0)",
            emoji_set: ["💧","💙","💚","💜","❤️","🩵","✨","🌟","🔥","🎉"],
            assign_per_user: true,
            enforce_color: false,
            emoji_color: "#ffffff",
            physics_gravity_y: 1.0,
            physics_air: 0.02,
            physics_wind_force: 0.00005,
            physics_side_walls: true,
            physics_floor: false,
            physics_restitution: 0.05,
            spin_min: -0.5,
            spin_max: 0.5,
            size_min_px: 28,
            size_max_px: 64,
            spawn_per_like: 1.0,
            max_burst: 20,
            max_queue: 200,
            max_active: 140,
            drop_despawn_s: 8.0,
            debug_overlay: false,
            show_username: false,
            username_font: "600 14px Inter, system-ui, Arial, sans-serif",
            username_color: "#ffffff",
            username_shadow: "0 2px 8px rgba(0,0,0,.75)",
            hue_rotate_deg: 0,
            saturate: 1.0,
            brightness: 1.0,
            contrast: 1.0,
            drop_shadow_css: "0 6px 14px rgba(0,0,0,.35)",
            gift_scale_enabled: true,
            gift_scale_strategy: "sqrt",
            gift_scale_per_100_coins: 0.25,
            gift_min_scale: 1.0,
            gift_max_scale: 3.0,
            gift_spawn_per_gift: 1.0,
            like_scale_per_count: 0.1,
            like_min_scale: 1.0,
            like_max_scale: 2.0
        };

        const stmt = this.db.prepare(`
            INSERT OR IGNORE INTO emoji_rain_config (id, enabled, config_json)
            VALUES (1, 1, ?)
        `);
        stmt.run(JSON.stringify(defaultConfig));
    }

    /**
     * Get Emoji Rain configuration
     */
    getEmojiRainConfig() {
        const stmt = this.db.prepare('SELECT * FROM emoji_rain_config WHERE id = 1');
        const row = stmt.get();

        if (!row) {
            // Fallback: initialize and return
            this.initializeEmojiRainDefaults();
            return this.getEmojiRainConfig();
        }

        return {
            enabled: Boolean(row.enabled),
            config: JSON.parse(row.config_json)
        };
    }

    /**
     * Update Emoji Rain configuration
     */
    updateEmojiRainConfig(config, enabled = null) {
        const current = this.getEmojiRainConfig();
        const newEnabled = enabled !== null ? (enabled ? 1 : 0) : (current.enabled ? 1 : 0);
        const newConfig = { ...current.config, ...config };

        const stmt = this.db.prepare(`
            UPDATE emoji_rain_config
            SET config_json = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
        `);
        stmt.run(JSON.stringify(newConfig), newEnabled);

        return {
            enabled: Boolean(newEnabled),
            config: newConfig
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
