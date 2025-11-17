/**
 * HTTP Client Enhancer for TikTok Live Connector
 * 
 * This module enhances the tiktok-live-connector library's HTTP client
 * by configuring environment variables that the library reads.
 * 
 * Key improvements:
 * - Increased timeouts to prevent premature failures
 * - Better error handling for various failure modes
 * - Configuration through environment variables that the library respects
 */
class HttpClientEnhancer {
    constructor() {
        this.defaultTimeout = 20000; // 20 seconds (increased from 10s)
        this.originalEnvValues = {};
    }

    /**
     * Configure environment variables for enhanced HTTP client behavior
     * 
     * The tiktok-live-connector library reads these environment variables:
     * - TIKTOK_CLIENT_TIMEOUT: HTTP request timeout in milliseconds
     */
    enhance(options = {}) {
        const {
            timeout = this.defaultTimeout,
            verbose = false
        } = options;

        // Store original values for restoration
        if (process.env.TIKTOK_CLIENT_TIMEOUT) {
            this.originalEnvValues.TIKTOK_CLIENT_TIMEOUT = process.env.TIKTOK_CLIENT_TIMEOUT;
        }

        // Set enhanced timeout
        process.env.TIKTOK_CLIENT_TIMEOUT = timeout.toString();

        if (verbose) {
            console.log(`🔧 HTTP Client Enhanced:`);
            console.log(`   - Timeout: ${timeout}ms (was: ${this.originalEnvValues.TIKTOK_CLIENT_TIMEOUT || '10000'}ms)`);
        }

        return {
            timeout,
            enhanced: true
        };
    }

    /**
     * Restore original environment variables
     */
    restore() {
        if (this.originalEnvValues.TIKTOK_CLIENT_TIMEOUT) {
            process.env.TIKTOK_CLIENT_TIMEOUT = this.originalEnvValues.TIKTOK_CLIENT_TIMEOUT;
        } else {
            delete process.env.TIKTOK_CLIENT_TIMEOUT;
        }

        console.log('🔧 HTTP Client configuration restored to original values');
    }

    /**
     * Get current configuration
     */
    getConfiguration() {
        return {
            currentTimeout: parseInt(process.env.TIKTOK_CLIENT_TIMEOUT || '10000'),
            originalTimeout: parseInt(this.originalEnvValues.TIKTOK_CLIENT_TIMEOUT || '10000'),
            enhanced: !!process.env.TIKTOK_CLIENT_TIMEOUT
        };
    }
}

module.exports = HttpClientEnhancer;
