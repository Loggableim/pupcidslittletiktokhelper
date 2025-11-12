const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * TTS Cache Manager
 * Manages audio caching with TTL and automatic cleanup
 */
class CacheManager {
    constructor(cacheDir, db, ttl, logger) {
        this.cacheDir = cacheDir;
        this.db = db;
        this.ttl = ttl || 86400; // Default: 24 hours
        this.logger = logger;

        // Ensure cache directory exists
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }

        // Initialize cache table
        this._initCacheTable();

        // Start cleanup interval (every 6 hours)
        this.cleanupInterval = setInterval(() => this.cleanup(), 6 * 60 * 60 * 1000);
    }

    /**
     * Initialize cache database table
     */
    _initCacheTable() {
        this.db.db.exec(`
            CREATE TABLE IF NOT EXISTS tts_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hash TEXT UNIQUE NOT NULL,
                text TEXT NOT NULL,
                voice_id TEXT NOT NULL,
                engine TEXT NOT NULL,
                file_path TEXT NOT NULL,
                duration_ms INTEGER,
                file_size INTEGER,
                created_at INTEGER NOT NULL,
                last_used_at INTEGER NOT NULL,
                use_count INTEGER DEFAULT 1
            )
        `);

        // Create index for fast lookups
        this.db.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_tts_cache_hash ON tts_cache(hash)
        `);
        this.db.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_tts_cache_last_used ON tts_cache(last_used_at)
        `);

        this.logger.info('TTS Cache: Database table initialized');
    }

    /**
     * Generate cache key hash
     */
    _generateHash(text, voiceId, engine, speed = 1.0) {
        const data = `${text}|${voiceId}|${engine}|${speed}`;
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    /**
     * Check if cached audio exists and is still valid
     */
    async get(text, voiceId, engine, speed = 1.0) {
        const hash = this._generateHash(text, voiceId, engine, speed);

        try {
            const stmt = this.db.db.prepare(`
                SELECT * FROM tts_cache WHERE hash = ? LIMIT 1
            `);
            const row = stmt.get(hash);

            if (!row) {
                return null; // Cache miss
            }

            // Check TTL
            const now = Math.floor(Date.now() / 1000);
            const age = now - row.created_at;

            if (age > this.ttl) {
                // Expired - delete
                this.logger.info(`TTS Cache: Expired cache entry for hash ${hash.substring(0, 8)}`);
                await this.delete(hash);
                return null;
            }

            // Check if file exists
            if (!fs.existsSync(row.file_path)) {
                this.logger.warn(`TTS Cache: File missing for hash ${hash.substring(0, 8)}, deleting entry`);
                await this.delete(hash);
                return null;
            }

            // Update last_used_at and use_count
            const updateStmt = this.db.db.prepare(`
                UPDATE tts_cache
                SET last_used_at = ?, use_count = use_count + 1
                WHERE hash = ?
            `);
            updateStmt.run(now, hash);

            this.logger.info(`TTS Cache: HIT for "${text.substring(0, 30)}..." (hash: ${hash.substring(0, 8)}, uses: ${row.use_count + 1})`);

            // Read and return audio data
            const audioData = fs.readFileSync(row.file_path, 'base64');

            return {
                audioData,
                durationMs: row.duration_ms,
                cached: true,
                useCount: row.use_count + 1
            };

        } catch (error) {
            this.logger.error(`TTS Cache: Error retrieving cache: ${error.message}`);
            return null;
        }
    }

    /**
     * Store audio in cache
     */
    async set(text, voiceId, engine, audioData, durationMs = null, speed = 1.0) {
        const hash = this._generateHash(text, voiceId, engine, speed);
        const filename = `${hash}.mp3`;
        const filePath = path.join(this.cacheDir, filename);

        try {
            // Save audio file
            const buffer = Buffer.from(audioData, 'base64');
            fs.writeFileSync(filePath, buffer);

            const fileSize = buffer.length;
            const now = Math.floor(Date.now() / 1000);

            // Save to database
            const stmt = this.db.db.prepare(`
                INSERT INTO tts_cache (hash, text, voice_id, engine, file_path, duration_ms, file_size, created_at, last_used_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(hash) DO UPDATE SET
                    file_path = excluded.file_path,
                    file_size = excluded.file_size,
                    last_used_at = excluded.last_used_at,
                    use_count = use_count + 1
            `);

            stmt.run(hash, text, voiceId, engine, filePath, durationMs, fileSize, now, now);

            this.logger.info(`TTS Cache: STORED "${text.substring(0, 30)}..." (hash: ${hash.substring(0, 8)}, size: ${Math.round(fileSize / 1024)}KB)`);

            return true;

        } catch (error) {
            this.logger.error(`TTS Cache: Error storing cache: ${error.message}`);
            return false;
        }
    }

    /**
     * Delete cache entry
     */
    async delete(hash) {
        try {
            const stmt = this.db.db.prepare('SELECT file_path FROM tts_cache WHERE hash = ?');
            const row = stmt.get(hash);

            if (row && fs.existsSync(row.file_path)) {
                fs.unlinkSync(row.file_path);
            }

            const deleteStmt = this.db.db.prepare('DELETE FROM tts_cache WHERE hash = ?');
            deleteStmt.run(hash);

            return true;

        } catch (error) {
            this.logger.error(`TTS Cache: Error deleting cache: ${error.message}`);
            return false;
        }
    }

    /**
     * Cleanup expired cache entries
     */
    async cleanup() {
        try {
            const now = Math.floor(Date.now() / 1000);
            const expiryTimestamp = now - this.ttl;

            // Get expired entries
            const stmt = this.db.db.prepare(`
                SELECT hash, file_path FROM tts_cache WHERE created_at < ?
            `);
            const expiredRows = stmt.all(expiryTimestamp);

            let deletedCount = 0;

            for (const row of expiredRows) {
                // Delete file
                if (fs.existsSync(row.file_path)) {
                    fs.unlinkSync(row.file_path);
                }

                // Delete DB entry
                const deleteStmt = this.db.db.prepare('DELETE FROM tts_cache WHERE hash = ?');
                deleteStmt.run(row.hash);

                deletedCount++;
            }

            if (deletedCount > 0) {
                this.logger.info(`TTS Cache: Cleaned up ${deletedCount} expired entries`);
            }

            return deletedCount;

        } catch (error) {
            this.logger.error(`TTS Cache: Error during cleanup: ${error.message}`);
            return 0;
        }
    }

    /**
     * Get cache statistics
     */
    getStats() {
        try {
            const stmt = this.db.db.prepare(`
                SELECT
                    COUNT(*) as total_entries,
                    SUM(file_size) as total_size,
                    SUM(use_count) as total_uses,
                    AVG(use_count) as avg_uses
                FROM tts_cache
            `);
            const stats = stmt.get();

            // Count actual files
            let fileCount = 0;
            let diskSize = 0;
            if (fs.existsSync(this.cacheDir)) {
                const files = fs.readdirSync(this.cacheDir);
                fileCount = files.length;
                files.forEach(file => {
                    const filePath = path.join(this.cacheDir, file);
                    diskSize += fs.statSync(filePath).size;
                });
            }

            return {
                totalEntries: stats.total_entries || 0,
                totalSize: stats.total_size || 0,
                totalSizeMB: Math.round((stats.total_size || 0) / 1024 / 1024 * 100) / 100,
                totalUses: stats.total_uses || 0,
                avgUses: Math.round((stats.avg_uses || 0) * 100) / 100,
                fileCount,
                diskSizeMB: Math.round(diskSize / 1024 / 1024 * 100) / 100,
                ttl: this.ttl
            };

        } catch (error) {
            this.logger.error(`TTS Cache: Error getting stats: ${error.message}`);
            return null;
        }
    }

    /**
     * Clear entire cache
     */
    async clear() {
        try {
            // Delete all files
            if (fs.existsSync(this.cacheDir)) {
                const files = fs.readdirSync(this.cacheDir);
                files.forEach(file => {
                    fs.unlinkSync(path.join(this.cacheDir, file));
                });
            }

            // Clear database
            this.db.db.prepare('DELETE FROM tts_cache').run();

            this.logger.info('TTS Cache: All cache cleared');
            return true;

        } catch (error) {
            this.logger.error(`TTS Cache: Error clearing cache: ${error.message}`);
            return false;
        }
    }

    /**
     * Destroy cache manager (cleanup interval)
     */
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
    }
}

module.exports = CacheManager;
