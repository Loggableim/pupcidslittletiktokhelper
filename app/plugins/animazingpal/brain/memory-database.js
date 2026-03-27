'use strict';

const path = require('path');
const BetterSqlite3 = require('better-sqlite3');

/**
 * AnimazingPal Memory Database
 *
 * Manages the Brain Engine's own SQLite database for storing viewer
 * interaction patterns and engagement memory.
 *
 * Supports legacy databases via automatic schema migration – the
 * streamer_id column is added if it is missing (same pattern used in
 * app/modules/database.js runMigrations() and
 * app/modules/leaderboard.js migrateToStreamerIdColumn()).
 */
class MemoryDatabase {
    constructor(dbPath, logger) {
        this.dbPath = dbPath;
        this.logger = logger;
        this.db = null;
    }

    /**
     * Open the database, create tables, and run any pending migrations.
     * Migrations are always executed BEFORE the first query that
     * references new columns so that legacy databases are upgraded
     * transparently.
     */
    initialize() {
        try {
            this.db = new BetterSqlite3(this.dbPath);
            this.db.pragma('journal_mode = WAL');

            // Create tables (new installations already have streamer_id)
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS memory_interactions (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    streamer_id TEXT    NOT NULL DEFAULT 'default',
                    user_id     TEXT    NOT NULL,
                    username    TEXT    NOT NULL,
                    event_type  TEXT    NOT NULL,
                    event_data  TEXT,
                    occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            this.db.exec(`
                CREATE TABLE IF NOT EXISTS memory_patterns (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    streamer_id  TEXT    NOT NULL DEFAULT 'default',
                    pattern_key  TEXT    NOT NULL,
                    pattern_data TEXT,
                    confidence   REAL    DEFAULT 0.0,
                    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(streamer_id, pattern_key)
                )
            `);

            // Run migrations BEFORE any other query so legacy DBs are
            // upgraded before the first SELECT/INSERT that uses streamer_id.
            this.runMigrations();

            this.db.exec(`
                CREATE INDEX IF NOT EXISTS idx_mem_interactions_streamer
                ON memory_interactions(streamer_id, user_id)
            `);

            this.db.exec(`
                CREATE INDEX IF NOT EXISTS idx_mem_patterns_streamer
                ON memory_patterns(streamer_id, pattern_key)
            `);

            this.logger.info('Memory database initialized successfully');
        } catch (error) {
            this.logger.error(`Failed to initialize memory database: ${error.message}`);
            throw error;
        }
    }

    /**
     * Add streamer_id column to legacy tables that were created before
     * multi-streamer support was introduced.  Follows the same PRAGMA-
     * based check used in app/modules/database.js and
     * app/modules/leaderboard.js.
     */
    runMigrations() {
        this.migrateStreamerIdColumn('memory_interactions');
        this.migrateStreamerIdColumn('memory_patterns');
    }

    /**
     * @param {string} tableName
     */
    migrateStreamerIdColumn(tableName) {
        try {
            const columns     = this.db.prepare(`PRAGMA table_info(${tableName})`).all();
            const hasStreamerId = columns.some(col => col.name === 'streamer_id');

            if (!hasStreamerId) {
                this.logger.info(`Migrating ${tableName}: adding streamer_id column`);
                this.db.exec(
                    `ALTER TABLE ${tableName} ADD COLUMN streamer_id TEXT NOT NULL DEFAULT 'default'`
                );
                this.logger.info(`Migration completed for ${tableName}`);
            }
        } catch (error) {
            this.logger.error(`Migration failed for ${tableName}: ${error.message}`);
            // Non-fatal – the column may already exist or the table may be empty
        }
    }

    // ─── Query helpers ────────────────────────────────────────────────────────

    recordInteraction(streamerId, userId, username, eventType, eventData = null) {
        try {
            this.db.prepare(`
                INSERT INTO memory_interactions (streamer_id, user_id, username, event_type, event_data)
                VALUES (?, ?, ?, ?, ?)
            `).run(streamerId, userId, username, eventType, eventData ? JSON.stringify(eventData) : null);
        } catch (error) {
            this.logger.error(`Failed to record interaction: ${error.message}`);
        }
    }

    getRecentInteractions(streamerId, limit = 50) {
        try {
            return this.db.prepare(`
                SELECT * FROM memory_interactions
                WHERE streamer_id = ?
                ORDER BY occurred_at DESC
                LIMIT ?
            `).all(streamerId, limit);
        } catch (error) {
            this.logger.error(`Failed to get interactions: ${error.message}`);
            return [];
        }
    }

    setPattern(streamerId, patternKey, patternData, confidence = 0.5) {
        try {
            this.db.prepare(`
                INSERT INTO memory_patterns (streamer_id, pattern_key, pattern_data, confidence, updated_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(streamer_id, pattern_key) DO UPDATE SET
                    pattern_data = excluded.pattern_data,
                    confidence   = excluded.confidence,
                    updated_at   = CURRENT_TIMESTAMP
            `).run(streamerId, patternKey, JSON.stringify(patternData), confidence);
        } catch (error) {
            this.logger.error(`Failed to set pattern: ${error.message}`);
        }
    }

    getPattern(streamerId, patternKey) {
        try {
            const row = this.db.prepare(`
                SELECT * FROM memory_patterns WHERE streamer_id = ? AND pattern_key = ?
            `).get(streamerId, patternKey);

            if (row && row.pattern_data) {
                row.pattern_data = JSON.parse(row.pattern_data);
            }
            return row || null;
        } catch (error) {
            this.logger.error(`Failed to get pattern: ${error.message}`);
            return null;
        }
    }

    close() {
        if (this.db) {
            try {
                this.db.close();
            } catch (_) {
                // ignore
            }
            this.db = null;
        }
    }
}

module.exports = MemoryDatabase;
