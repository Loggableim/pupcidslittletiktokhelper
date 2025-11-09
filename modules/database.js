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

        // Default-Einstellungen setzen
        this.setDefaultSettings();
    }

    setDefaultSettings() {
        const defaults = {
            'default_voice': 'en_us_ghostface',
            'tts_speed': '1.0',
            'tts_volume': '80',
            'tts_chat_enabled': 'false',
            'tts_min_coins': '0',
            'alert_gift_min_coins': '100',
            'theme': 'dark'
        };

        const stmt = this.db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
        for (const [key, value] of Object.entries(defaults)) {
            stmt.run(key, value);
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

    close() {
        this.db.close();
    }
}

module.exports = DatabaseManager;
