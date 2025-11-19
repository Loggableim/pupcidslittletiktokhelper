/**
 * Cache Cleanup Job
 * 
 * Runs daily to clean up old cached audio files
 * Removes files that haven't been played in 6 weeks (42 days)
 */

const cron = require('node-cron');

class CacheCleanupJob {
    constructor(audioCacheManager, logger) {
        this.cacheManager = audioCacheManager;
        this.logger = logger || console;
        this.job = null;
    }

    /**
     * Start the cleanup job
     * Runs daily at 3:00 AM
     */
    start() {
        // Cron expression: Run at 3:00 AM every day
        // Format: second minute hour day month weekday
        this.job = cron.schedule('0 3 * * *', async () => {
            this.logger.info('[CleanupJob] Starting scheduled cache cleanup...');
            
            try {
                const stats = await this.cacheManager.cleanupOldFiles();
                
                this.logger.info('[CleanupJob] Cleanup completed successfully', stats);
                
                // Log cache stats after cleanup
                const cacheStats = this.cacheManager.getCacheStats();
                this.logger.info('[CleanupJob] Cache stats after cleanup:', cacheStats);
            } catch (error) {
                this.logger.error(`[CleanupJob] Cleanup failed: ${error.message}`);
            }
        }, {
            timezone: "Europe/Berlin" // Adjust timezone as needed
        });

        this.logger.info('[CleanupJob] Scheduled daily cleanup at 3:00 AM');
    }

    /**
     * Stop the cleanup job
     */
    stop() {
        if (this.job) {
            this.job.stop();
            this.logger.info('[CleanupJob] Stopped cleanup job');
        }
    }

    /**
     * Run cleanup manually
     */
    async runNow() {
        this.logger.info('[CleanupJob] Running manual cleanup...');
        
        try {
            const stats = await this.cacheManager.cleanupOldFiles();
            this.logger.info('[CleanupJob] Manual cleanup completed', stats);
            return stats;
        } catch (error) {
            this.logger.error(`[CleanupJob] Manual cleanup failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get job status
     */
    getStatus() {
        return {
            running: this.job ? true : false,
            schedule: '3:00 AM daily',
            timezone: 'Europe/Berlin',
            cleanupAge: '42 days (6 weeks)'
        };
    }
}

module.exports = CacheCleanupJob;
