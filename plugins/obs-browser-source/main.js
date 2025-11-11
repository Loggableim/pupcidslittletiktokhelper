/**
 * OBS Browser Source Manager Plugin
 *
 * Zentralisierte Verwaltung aller OBS Browser Source URLs
 *
 * Features:
 * - URL-Generierung mit Query-Parametern
 * - Hot-Reload für Browser Sources
 * - CORS & CSP Management
 * - Socket.IO Event-Bus
 * - Legacy URL Redirects
 *
 * API Endpoints:
 * - GET  /api/obs-browser-source/sources      Liste aller Browser Sources
 * - GET  /api/obs-browser-source/url/:id      URL für Browser Source generieren
 * - POST /api/obs-browser-source/reload       Hot-Reload Signal an alle Browser Sources
 * - GET  /api/obs-browser-source/config       Plugin-Konfiguration
 * - POST /api/obs-browser-source/config       Plugin-Konfiguration aktualisieren
 */

class OBSBrowserSourcePlugin {
    constructor(api) {
        this.api = api;
        this.logger = api.logger;
        this.manifest = require('./manifest.json');

        // Plugin-State
        this.config = null;
        this.browserSources = new Map();
        this.connectedClients = new Set();
    }

    /**
     * Plugin-Initialisierung
     */
    async init() {
        try {
            // Lade Konfiguration
            this.config = await this.api.getConfig('config') || this.getDefaultConfig();

            // Initialisiere Browser Sources aus Manifest
            this.initBrowserSources();

            // Registriere API-Routes
            this.registerRoutes();

            // Registriere Socket.IO Events
            this.registerSocketEvents();

            // Legacy URL Redirects (optional, für Rückwärtskompatibilität)
            if (this.config.enable_legacy_redirects) {
                this.registerLegacyRedirects();
            }

            this.logger.info('🖼️  OBS Browser Source Manager initialized');
            this.logger.info(`   Base URL: ${this.config.base_url}`);
            this.logger.info(`   Browser Sources: ${this.browserSources.size}`);

            return true;
        } catch (error) {
            this.logger.error('OBS Browser Source Plugin init error:', error);
            return false;
        }
    }

    /**
     * Standard-Konfiguration
     */
    getDefaultConfig() {
        const schema = this.manifest.settings_schema;
        const config = {};

        Object.keys(schema).forEach(key => {
            config[key] = schema[key].default;
        });

        return config;
    }

    /**
     * Browser Sources aus Manifest initialisieren
     */
    initBrowserSources() {
        this.manifest.browser_sources.forEach(source => {
            this.browserSources.set(source.id, {
                ...source,
                url: this.generateSourceURL(source),
                connected_clients: 0
            });
        });
    }

    /**
     * URL für Browser Source generieren
     */
    generateSourceURL(source, params = {}) {
        const baseUrl = this.config.base_url;
        let path = source.path;

        // Dynamische Parameter ersetzen (z.B. /goal/{key})
        if (source.is_dynamic && source.parameters) {
            Object.keys(source.parameters).forEach(paramKey => {
                const paramValue = params[paramKey];
                if (paramValue) {
                    path = path.replace(`{${paramKey}}`, paramValue);
                }
            });
        }

        // Query-Parameter hinzufügen
        const queryParams = new URLSearchParams();

        // Custom Query-Parameter aus params
        Object.keys(params).forEach(key => {
            if (!source.parameters || !source.parameters[key]) {
                queryParams.append(key, params[key]);
            }
        });

        const queryString = queryParams.toString();
        const fullUrl = `${baseUrl}${path}${queryString ? '?' + queryString : ''}`;

        return fullUrl;
    }

    /**
     * API-Routes registrieren
     */
    registerRoutes() {
        // GET /api/obs-browser-source/sources - Liste aller Browser Sources
        this.api.registerRoute('get', '/api/obs-browser-source/sources', (req, res) => {
            const sources = Array.from(this.browserSources.values()).map(source => ({
                id: source.id,
                name: source.name,
                description: source.description,
                url: source.url,
                path: source.path,
                default_width: source.default_width,
                default_height: source.default_height,
                is_dock: source.is_dock || false,
                is_dynamic: source.is_dynamic || false,
                requires_interaction: source.requires_interaction || false,
                connected_clients: source.connected_clients
            }));

            res.json({
                success: true,
                sources,
                total: sources.length
            });
        });

        // GET /api/obs-browser-source/url/:id - URL für Browser Source generieren
        this.api.registerRoute('get', '/api/obs-browser-source/url/:id', (req, res) => {
            const { id } = req.params;
            const params = req.query;

            const source = this.browserSources.get(id);

            if (!source) {
                return res.status(404).json({
                    success: false,
                    error: 'Browser Source not found',
                    available_sources: Array.from(this.browserSources.keys())
                });
            }

            // Validiere erforderliche Parameter für dynamische Sources
            if (source.is_dynamic && source.parameters) {
                const requiredParams = Object.entries(source.parameters)
                    .filter(([key, config]) => config.required)
                    .map(([key]) => key);

                const missingParams = requiredParams.filter(param => !params[param]);

                if (missingParams.length > 0) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing required parameters',
                        missing: missingParams,
                        required: source.parameters
                    });
                }
            }

            const url = this.generateSourceURL(source, params);

            res.json({
                success: true,
                id: source.id,
                name: source.name,
                url,
                width: source.default_width,
                height: source.default_height,
                is_dock: source.is_dock || false
            });
        });

        // POST /api/obs-browser-source/reload - Hot-Reload Signal
        this.api.registerRoute('post', '/api/obs-browser-source/reload', (req, res) => {
            if (!this.config.enable_hot_reload) {
                return res.status(403).json({
                    success: false,
                    error: 'Hot-Reload is disabled in plugin configuration'
                });
            }

            const { source_id } = req.body;

            // Reload Signal an alle oder spezifische Browser Sources senden
            if (source_id) {
                this.api.emit(`obs-browser-source:reload:${source_id}`, {
                    source_id,
                    timestamp: Date.now()
                });

                this.logger.info(`🔄 Hot-Reload triggered for: ${source_id}`);
            } else {
                // Global reload für alle Browser Sources
                this.api.emit('obs-browser-source:reload', {
                    timestamp: Date.now()
                });

                this.logger.info('🔄 Global Hot-Reload triggered for all Browser Sources');
            }

            res.json({
                success: true,
                message: source_id
                    ? `Reload signal sent to ${source_id}`
                    : 'Global reload signal sent to all Browser Sources'
            });
        });

        // GET /api/obs-browser-source/config - Plugin-Konfiguration
        this.api.registerRoute('get', '/api/obs-browser-source/config', async (req, res) => {
            const config = await this.api.getConfig('config') || this.getDefaultConfig();

            res.json({
                success: true,
                config,
                schema: this.manifest.settings_schema
            });
        });

        // POST /api/obs-browser-source/config - Plugin-Konfiguration aktualisieren
        this.api.registerRoute('post', '/api/obs-browser-source/config', async (req, res) => {
            const newConfig = req.body;

            try {
                // Validiere Konfiguration gegen Schema
                const validation = this.validateConfig(newConfig);

                if (!validation.valid) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid configuration',
                        errors: validation.errors
                    });
                }

                // Speichere neue Konfiguration
                this.config = { ...this.config, ...newConfig };
                await this.api.setConfig('config', this.config);

                // Re-generiere Browser Source URLs
                this.initBrowserSources();

                this.logger.info('⚙️  OBS Browser Source configuration updated');

                res.json({
                    success: true,
                    config: this.config,
                    message: 'Configuration updated successfully'
                });
            } catch (error) {
                this.logger.error('Error updating OBS Browser Source config:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // GET /api/obs-browser-source/stats - Statistiken
        this.api.registerRoute('get', '/api/obs-browser-source/stats', (req, res) => {
            const stats = {
                total_sources: this.browserSources.size,
                connected_clients: this.connectedClients.size,
                hot_reload_enabled: this.config.enable_hot_reload,
                legacy_redirects_enabled: this.config.enable_legacy_redirects,
                sources_by_type: {
                    overlays: Array.from(this.browserSources.values()).filter(s => !s.is_dock).length,
                    docks: Array.from(this.browserSources.values()).filter(s => s.is_dock).length,
                    dynamic: Array.from(this.browserSources.values()).filter(s => s.is_dynamic).length
                }
            };

            res.json({
                success: true,
                stats
            });
        });
    }

    /**
     * Socket.IO Events registrieren
     */
    registerSocketEvents() {
        // Client-Registrierung für Hot-Reload
        this.api.registerSocket('obs-browser-source:connect', (data, socket) => {
            this.connectedClients.add(socket.id);

            const { source_id } = data;

            if (source_id && this.browserSources.has(source_id)) {
                const source = this.browserSources.get(source_id);
                source.connected_clients++;

                this.logger.debug(`🖼️  Browser Source connected: ${source_id} (${socket.id})`);
            }

            // Sende initiale Konfiguration an Client
            socket.emit('obs-browser-source:config', {
                hot_reload_enabled: this.config.enable_hot_reload,
                source_id
            });
        });

        // Client-Disconnect
        this.api.registerSocket('obs-browser-source:disconnect', (data, socket) => {
            this.connectedClients.delete(socket.id);

            const { source_id } = data;

            if (source_id && this.browserSources.has(source_id)) {
                const source = this.browserSources.get(source_id);
                source.connected_clients = Math.max(0, source.connected_clients - 1);

                this.logger.debug(`🖼️  Browser Source disconnected: ${source_id} (${socket.id})`);
            }
        });

        // Reload Request von Client
        this.api.registerSocket('obs-browser-source:request-reload', (data, socket) => {
            const { source_id } = data;

            this.logger.info(`🔄 Reload requested by client for: ${source_id || 'all'}`);

            // Trigger reload
            if (source_id) {
                this.api.emit(`obs-browser-source:reload:${source_id}`, {
                    source_id,
                    timestamp: Date.now(),
                    requester: socket.id
                });
            } else {
                this.api.emit('obs-browser-source:reload', {
                    timestamp: Date.now(),
                    requester: socket.id
                });
            }
        });
    }

    /**
     * Legacy URL Redirects (Rückwärtskompatibilität)
     *
     * WICHTIG: Diese Redirects sorgen dafür, dass alte URLs weiterhin funktionieren!
     */
    registerLegacyRedirects() {
        // Keine Redirects notwendig, da die statischen HTML-Dateien in public/ bleiben
        // und Express.static weiterhin funktioniert

        this.logger.info('✅ Legacy URL Redirects: Statische Dateien bleiben in public/, keine Breaking Changes');
    }

    /**
     * Konfiguration validieren
     */
    validateConfig(config) {
        const errors = [];
        const schema = this.manifest.settings_schema;

        Object.keys(config).forEach(key => {
            if (!schema[key]) {
                errors.push(`Unknown configuration key: ${key}`);
                return;
            }

            const expectedType = schema[key].type;
            const actualType = typeof config[key];

            if (expectedType === 'string' && actualType !== 'string') {
                errors.push(`${key} must be a string`);
            } else if (expectedType === 'boolean' && actualType !== 'boolean') {
                errors.push(`${key} must be a boolean`);
            } else if (expectedType === 'number' && actualType !== 'number') {
                errors.push(`${key} must be a number`);
            }
        });

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Plugin herunterfahren
     */
    async destroy() {
        this.browserSources.clear();
        this.connectedClients.clear();

        this.logger.info('🖼️  OBS Browser Source Manager destroyed');
    }

    /**
     * Expose API für andere Module/Plugins
     */
    getAPI() {
        return {
            getBrowserSources: () => Array.from(this.browserSources.values()),
            getBrowserSource: (id) => this.browserSources.get(id),
            generateURL: (sourceId, params) => {
                const source = this.browserSources.get(sourceId);
                return source ? this.generateSourceURL(source, params) : null;
            },
            reloadSource: (sourceId) => {
                if (sourceId) {
                    this.api.emit(`obs-browser-source:reload:${sourceId}`, {
                        source_id: sourceId,
                        timestamp: Date.now()
                    });
                } else {
                    this.api.emit('obs-browser-source:reload', {
                        timestamp: Date.now()
                    });
                }
            },
            getStats: () => ({
                total_sources: this.browserSources.size,
                connected_clients: this.connectedClients.size
            })
        };
    }
}

module.exports = OBSBrowserSourcePlugin;
