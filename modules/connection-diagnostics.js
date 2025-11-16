const axios = require('axios');
const { WebSocket } = require('ws');

/**
 * Connection Diagnostics Module
 * Validates Euler API key sources, tests TikTok API reachability,
 * and tests Euler WebSocket connectivity for debugging connection issues.
 */
class ConnectionDiagnostics {
    constructor(db) {
        this.db = db;
        this.connectionAttempts = [];
        this.maxAttempts = 10;
    }

    /**
     * Decrypt backup Euler API key (same as tiktok.js)
     */
    _getBackupEulerKey() {
        try {
            const encrypted = 'RkxCV14HT0UPWUwNCk5cUwlDVEdLBAUCV0ZBRVNeARVGUQoXDV9LXlRbQV0QH1BWBwFCQxNWDwZPEAwJFlgKFQ==';
            const key = 'pupcid-tiktok-helper-2024';
            
            const text = Buffer.from(encrypted, 'base64').toString();
            let result = '';
            for (let i = 0; i < text.length; i++) {
                result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
            }
            return result;
        } catch (error) {
            return null;
        }
    }

    /**
     * Validate Euler API key sources and determine which is being used
     */
    validateEulerApiKey() {
        const dbKey = this.db.getSetting('tiktok_euler_api_key');
        const envKey = process.env.TIKTOK_SIGN_API_KEY;
        const backupKey = this._getBackupEulerKey();

        const result = {
            sources: {
                database: {
                    set: !!dbKey,
                    valid: !!dbKey && dbKey.length > 10,
                    value: dbKey ? `${dbKey.substring(0, 8)}...` : null
                },
                environment: {
                    set: !!envKey,
                    valid: !!envKey && envKey.length > 10,
                    value: envKey ? `${envKey.substring(0, 8)}...` : null
                },
                backup: {
                    set: !!backupKey,
                    valid: !!backupKey && backupKey.length > 10,
                    value: backupKey ? `${backupKey.substring(0, 8)}...` : null
                }
            },
            activeKey: null,
            activeSource: null
        };

        // Determine which key is active (same priority as tiktok.js)
        if (dbKey) {
            result.activeKey = `${dbKey.substring(0, 8)}...`;
            result.activeSource = 'database';
        } else if (envKey) {
            result.activeKey = `${envKey.substring(0, 8)}...`;
            result.activeSource = 'environment';
        } else if (backupKey) {
            result.activeKey = `${backupKey.substring(0, 8)}...`;
            result.activeSource = 'backup';
        }

        return result;
    }

    /**
     * Test TikTok API reachability
     */
    async testTikTokApi(username = 'tiktok') {
        const result = {
            success: false,
            responseTime: null,
            error: null,
            statusCode: null
        };

        const startTime = Date.now();
        
        try {
            const response = await axios.get(`https://www.tiktok.com/@${username}`, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            result.responseTime = Date.now() - startTime;
            result.statusCode = response.status;
            result.success = response.status === 200;
            
        } catch (error) {
            result.responseTime = Date.now() - startTime;
            result.error = error.message;
            
            if (error.response) {
                result.statusCode = error.response.status;
            }
        }

        return result;
    }

    /**
     * Test Euler Stream WebSocket connectivity
     */
    async testEulerWebSocket() {
        const result = {
            success: false,
            responseTime: null,
            error: null
        };

        const startTime = Date.now();

        return new Promise((resolve) => {
            try {
                // Test WebSocket connection to Euler Stream service
                const ws = new WebSocket('wss://www.eulerstream.com/', {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });

                const timeout = setTimeout(() => {
                    ws.close();
                    result.responseTime = Date.now() - startTime;
                    result.error = 'Connection timeout (10s)';
                    resolve(result);
                }, 10000);

                ws.on('open', () => {
                    clearTimeout(timeout);
                    result.responseTime = Date.now() - startTime;
                    result.success = true;
                    ws.close();
                    resolve(result);
                });

                ws.on('error', (error) => {
                    clearTimeout(timeout);
                    result.responseTime = Date.now() - startTime;
                    result.error = error.message;
                    resolve(result);
                });

            } catch (error) {
                result.responseTime = Date.now() - startTime;
                result.error = error.message;
                resolve(result);
            }
        });
    }

    /**
     * Get connection configuration settings
     */
    getConnectionConfig() {
        return {
            enableEulerFallbacks: this.db.getSetting('tiktok_enable_euler_fallbacks') === 'true' || 
                                  process.env.TIKTOK_ENABLE_EULER_FALLBACKS === 'true',
            connectWithUniqueId: this.db.getSetting('tiktok_connect_with_unique_id') === 'true' || 
                                 process.env.TIKTOK_CONNECT_WITH_UNIQUE_ID === 'true',
            connectionTimeout: parseInt(this.db.getSetting('tiktok_connection_timeout')) || 45000
        };
    }

    /**
     * Log a connection attempt
     */
    logConnectionAttempt(username, success, errorType, errorMessage) {
        const attempt = {
            timestamp: new Date().toISOString(),
            username,
            success,
            errorType,
            errorMessage
        };

        this.connectionAttempts.unshift(attempt);
        
        // Keep only last N attempts
        if (this.connectionAttempts.length > this.maxAttempts) {
            this.connectionAttempts = this.connectionAttempts.slice(0, this.maxAttempts);
        }
    }

    /**
     * Get recent connection attempts
     */
    getConnectionAttempts() {
        return this.connectionAttempts;
    }

    /**
     * Run full diagnostics and return report
     */
    async runFullDiagnostics(username = 'tiktok') {
        console.log('🔍 Running connection diagnostics...');

        const diagnostics = {
            timestamp: new Date().toISOString(),
            eulerApiKey: this.validateEulerApiKey(),
            tiktokApi: await this.testTikTokApi(username),
            eulerWebSocket: await this.testEulerWebSocket(),
            connectionConfig: this.getConnectionConfig(),
            recentAttempts: this.getConnectionAttempts(),
            recommendations: []
        };

        // Generate recommendations based on results
        if (!diagnostics.eulerApiKey.activeKey) {
            diagnostics.recommendations.push({
                severity: 'warning',
                message: 'Kein Euler API Key konfiguriert. Fallback zu Backup-Key aktiv.',
                action: 'Registriere einen API-Key bei https://www.eulerstream.com für bessere Zuverlässigkeit.'
            });
        }

        if (!diagnostics.tiktokApi.success) {
            diagnostics.recommendations.push({
                severity: 'error',
                message: 'TikTok API nicht erreichbar.',
                action: 'Überprüfe deine Internetverbindung und Firewall-Einstellungen.'
            });
        }

        if (!diagnostics.eulerWebSocket.success) {
            diagnostics.recommendations.push({
                severity: 'warning',
                message: 'Euler WebSocket Verbindung fehlgeschlagen.',
                action: 'Euler Stream Fallback könnte nicht verfügbar sein. Stelle sicher, dass ausgehende WebSocket-Verbindungen erlaubt sind.'
            });
        }

        if (diagnostics.tiktokApi.responseTime > 5000) {
            diagnostics.recommendations.push({
                severity: 'warning',
                message: 'TikTok API Antwortzeit sehr langsam (>' + diagnostics.tiktokApi.responseTime + 'ms).',
                action: 'Langsame Internetverbindung könnte zu Timeouts führen. Erwäge längeres Timeout.'
            });
        }

        const failedAttempts = this.connectionAttempts.filter(a => !a.success).length;
        if (failedAttempts >= 3) {
            diagnostics.recommendations.push({
                severity: 'error',
                message: `${failedAttempts} fehlgeschlagene Verbindungsversuche in letzten ${this.maxAttempts} Versuchen.`,
                action: 'Überprüfe Username, Internet-Verbindung und ob der Stream live ist.'
            });
        }

        console.log('✅ Diagnostics complete');
        return diagnostics;
    }

    /**
     * Get current connection health status
     */
    async getConnectionHealth() {
        const eulerKey = this.validateEulerApiKey();
        const recentAttempts = this.getConnectionAttempts();
        const recentFailures = recentAttempts.filter(a => !a.success).length;

        let status = 'healthy';
        let message = 'Verbindung bereit';

        if (!eulerKey.activeKey) {
            status = 'warning';
            message = 'Backup Euler Key aktiv';
        }

        if (recentFailures >= 2) {
            status = 'degraded';
            message = `${recentFailures} fehlgeschlagene Versuche`;
        }

        if (recentFailures >= 5) {
            status = 'critical';
            message = 'Wiederholte Verbindungsfehler';
        }

        return {
            status,
            message,
            recentAttempts: recentAttempts.slice(0, 5),
            eulerKeyConfigured: !!eulerKey.activeKey,
            eulerKeySource: eulerKey.activeSource
        };
    }
}

module.exports = ConnectionDiagnostics;
