const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

/**
 * PluginAPI - Bereitgestellte API für Plugins
 * Ermöglicht sicheren Zugriff auf System-Funktionen
 */
class PluginAPI {
    constructor(pluginId, pluginDir, app, io, db, logger, pluginLoader) {
        this.pluginId = pluginId;
        this.pluginDir = pluginDir;
        this.app = app;
        this.io = io;
        this.db = db;
        this.logger = logger;
        this.pluginLoader = pluginLoader;

        // Registrierte Routes und Events für Cleanup
        this.registeredRoutes = [];
        this.registeredSocketEvents = [];
        this.registeredTikTokEvents = [];
    }

    /**
     * Registriert eine Express-Route
     * @param {string} method - HTTP-Methode (GET, POST, PUT, DELETE)
     * @param {string} path - Route-Pfad (z.B. /api/topboard)
     * @param {function} handler - Route-Handler-Funktion
     */
    registerRoute(method, routePath, handler) {
        try {
            const fullPath = routePath.startsWith('/') ? routePath : `/${routePath}`;

            // Wrapper für Error-Handling
            const wrappedHandler = async (req, res, next) => {
                try {
                    await handler(req, res, next);
                } catch (error) {
                    this.log(`Route error in ${fullPath}: ${error.message}`, 'error');
                    res.status(500).json({
                        success: false,
                        error: 'Plugin route error',
                        message: error.message
                    });
                }
            };

            // Route registrieren
            const methodLower = method.toLowerCase();
            if (!this.app[methodLower]) {
                throw new Error(`Invalid HTTP method: ${method}`);
            }

            this.app[methodLower](fullPath, wrappedHandler);
            this.registeredRoutes.push({ method, path: fullPath });
            this.log(`Registered route: ${method} ${fullPath}`);

            return true;
        } catch (error) {
            this.log(`Failed to register route: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Registriert einen Socket.io-Event-Handler
     * @param {string} event - Event-Name
     * @param {function} callback - Event-Callback
     */
    registerSocket(event, callback) {
        try {
            const wrappedCallback = async (socket, ...args) => {
                try {
                    await callback(socket, ...args);
                } catch (error) {
                    this.log(`Socket event error in ${event}: ${error.message}`, 'error');
                    socket.emit('plugin:error', {
                        plugin: this.pluginId,
                        event,
                        error: error.message
                    });
                }
            };

            this.registeredSocketEvents.push({ event, callback: wrappedCallback });
            this.log(`Registered socket event: ${event}`);

            return true;
        } catch (error) {
            this.log(`Failed to register socket event: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Registriert einen TikTok-Event-Handler
     * @param {string} event - TikTok-Event (gift, follow, subscribe, etc.)
     * @param {function} callback - Event-Callback
     */
    registerTikTokEvent(event, callback) {
        try {
            const wrappedCallback = async (data) => {
                try {
                    await callback(data);
                } catch (error) {
                    this.log(`TikTok event error in ${event}: ${error.message}`, 'error');
                }
            };

            this.registeredTikTokEvents.push({ event, callback: wrappedCallback });
            this.log(`Registered TikTok event: ${event}`);

            return true;
        } catch (error) {
            this.log(`Failed to register TikTok event: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Sendet ein Socket.io-Event an alle Clients
     * @param {string} event - Event-Name
     * @param {*} data - Event-Daten
     */
    emit(event, data) {
        try {
            this.io.emit(event, data);
            return true;
        } catch (error) {
            this.log(`Failed to emit event: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Holt Plugin-Konfiguration aus der Datenbank
     * @param {string} key - Config-Key (optional)
     */
    getConfig(key = null) {
        try {
            const configKey = key ? `plugin:${this.pluginId}:${key}` : `plugin:${this.pluginId}:config`;
            const stmt = this.db.prepare('SELECT value FROM settings WHERE key = ?');
            const row = stmt.get(configKey);

            if (row) {
                return JSON.parse(row.value);
            }
            return null;
        } catch (error) {
            this.log(`Failed to get config: ${error.message}`, 'error');
            return null;
        }
    }

    /**
     * Speichert Plugin-Konfiguration in der Datenbank
     * @param {string} key - Config-Key
     * @param {*} value - Config-Wert
     */
    setConfig(key, value) {
        try {
            const configKey = `plugin:${this.pluginId}:${key}`;
            const valueJson = JSON.stringify(value);

            const stmt = this.db.prepare(`
                INSERT INTO settings (key, value)
                VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
            `);
            stmt.run(configKey, valueJson);

            this.log(`Config saved: ${key}`);
            return true;
        } catch (error) {
            this.log(`Failed to set config: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Loggt eine Nachricht mit Plugin-Kontext
     * @param {string} message - Log-Nachricht
     * @param {string} level - Log-Level (info, warn, error)
     */
    log(message, level = 'info') {
        const logMessage = `[Plugin:${this.pluginId}] ${message}`;

        if (this.logger && this.logger[level]) {
            this.logger[level](logMessage);
        } else {
            console.log(`[${level.toUpperCase()}] ${logMessage}`);
        }
    }

    /**
     * Gibt den absoluten Pfad zum Plugin-Verzeichnis zurück
     */
    getPluginDir() {
        return this.pluginDir;
    }

    /**
     * Gibt die öffentliche URL für eine Datei im Plugin zurück
     * @param {string} file - Dateiname
     */
    getPublicURL(file) {
        return `/plugins/${this.pluginId}/${file}`;
    }

    /**
     * Entfernt alle registrierten Routes und Events
     */
    unregisterAll() {
        // Socket-Events können nicht direkt deregistriert werden in Socket.io
        // Sie werden beim Neustart des Servers entfernt
        this.registeredRoutes = [];
        this.registeredSocketEvents = [];
        this.registeredTikTokEvents = [];

        this.log('All registrations cleared');
    }

    /**
     * Gibt Zugriff auf die Datenbank (mit Vorsicht verwenden)
     */
    getDatabase() {
        return this.db;
    }

    /**
     * Gibt Zugriff auf Socket.io
     */
    getSocketIO() {
        return this.io;
    }
}

/**
 * PluginLoader - Lädt und verwaltet Plugins
 */
class PluginLoader extends EventEmitter {
    constructor(pluginsDir, app, io, db, logger) {
        super();
        this.pluginsDir = pluginsDir;
        this.app = app;
        this.io = io;
        this.db = db;
        this.logger = logger;

        // Geladene Plugins
        this.plugins = new Map();

        // Plugin-State-Datei
        this.stateFile = path.join(pluginsDir, 'plugins_state.json');

        // State laden
        this.state = this.loadState();
    }

    /**
     * Lädt den Plugin-State aus der Datei
     */
    loadState() {
        try {
            if (fs.existsSync(this.stateFile)) {
                const data = fs.readFileSync(this.stateFile, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            this.logger.warn(`Failed to load plugin state: ${error.message}`);
        }
        return {};
    }

    /**
     * Speichert den Plugin-State in die Datei
     */
    saveState() {
        try {
            fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
            return true;
        } catch (error) {
            this.logger.error(`Failed to save plugin state: ${error.message}`);
            return false;
        }
    }

    /**
     * Lädt alle Plugins aus dem Plugins-Verzeichnis
     */
    async loadAllPlugins() {
        try {
            // Plugins-Verzeichnis erstellen falls nicht vorhanden
            if (!fs.existsSync(this.pluginsDir)) {
                fs.mkdirSync(this.pluginsDir, { recursive: true });
                this.logger.info(`Created plugins directory: ${this.pluginsDir}`);
            }

            const entries = fs.readdirSync(this.pluginsDir, { withFileTypes: true });
            const pluginDirs = entries.filter(entry => entry.isDirectory() && !entry.name.startsWith('_'));

            this.logger.info(`Found ${pluginDirs.length} plugin directories`);

            for (const dir of pluginDirs) {
                const pluginPath = path.join(this.pluginsDir, dir.name);
                await this.loadPlugin(pluginPath);
            }

            this.logger.info(`Loaded ${this.plugins.size} plugins successfully`);

            return Array.from(this.plugins.values());
        } catch (error) {
            this.logger.error(`Failed to load plugins: ${error.message}`);
            return [];
        }
    }

    /**
     * Lädt ein einzelnes Plugin
     */
    async loadPlugin(pluginPath) {
        try {
            const manifestPath = path.join(pluginPath, 'plugin.json');

            // Manifest prüfen
            if (!fs.existsSync(manifestPath)) {
                this.logger.warn(`No plugin.json found in ${pluginPath}`);
                return null;
            }

            // Manifest laden
            const manifestData = fs.readFileSync(manifestPath, 'utf8');
            const manifest = JSON.parse(manifestData);

            // Validierung
            if (!manifest.id || !manifest.name || !manifest.entry) {
                this.logger.warn(`Invalid plugin.json in ${pluginPath}: Missing required fields`);
                return null;
            }

            // State prüfen
            const pluginState = this.state[manifest.id] || {};
            const isEnabled = pluginState.enabled !== undefined ? pluginState.enabled : manifest.enabled !== false;

            if (!isEnabled) {
                this.logger.info(`Plugin ${manifest.id} is disabled, skipping`);
                return null;
            }

            // Entry-Datei prüfen
            const entryPath = path.join(pluginPath, manifest.entry);
            if (!fs.existsSync(entryPath)) {
                this.logger.warn(`Entry file not found: ${entryPath}`);
                return null;
            }

            // Plugin laden
            delete require.cache[require.resolve(entryPath)]; // Cache leeren für Reload
            const PluginClass = require(entryPath);

            // PluginAPI erstellen
            const pluginAPI = new PluginAPI(
                manifest.id,
                pluginPath,
                this.app,
                this.io,
                this.db,
                this.logger,
                this
            );

            // Plugin instanziieren
            const pluginInstance = new PluginClass(pluginAPI);

            // Plugin initialisieren
            if (typeof pluginInstance.init === 'function') {
                await pluginInstance.init();
            }

            // Plugin speichern
            const pluginInfo = {
                id: manifest.id,
                manifest,
                instance: pluginInstance,
                api: pluginAPI,
                path: pluginPath,
                loadedAt: new Date().toISOString()
            };

            this.plugins.set(manifest.id, pluginInfo);

            // State aktualisieren
            this.state[manifest.id] = {
                enabled: true,
                loadedAt: pluginInfo.loadedAt
            };
            this.saveState();

            this.logger.info(`Loaded plugin: ${manifest.name} (${manifest.id}) v${manifest.version}`);
            this.emit('plugin:loaded', pluginInfo);

            return pluginInfo;
        } catch (error) {
            this.logger.error(`Failed to load plugin from ${pluginPath}: ${error.message}`);
            this.logger.error(error.stack);
            return null;
        }
    }

    /**
     * Entlädt ein Plugin
     */
    async unloadPlugin(pluginId) {
        try {
            const plugin = this.plugins.get(pluginId);
            if (!plugin) {
                return false;
            }

            // Plugin cleanup aufrufen
            if (typeof plugin.instance.destroy === 'function') {
                await plugin.instance.destroy();
            }

            // API cleanup
            plugin.api.unregisterAll();

            // Plugin entfernen
            this.plugins.delete(pluginId);

            this.logger.info(`Unloaded plugin: ${pluginId}`);
            this.emit('plugin:unloaded', pluginId);

            return true;
        } catch (error) {
            this.logger.error(`Failed to unload plugin ${pluginId}: ${error.message}`);
            return false;
        }
    }

    /**
     * Aktiviert ein Plugin
     */
    async enablePlugin(pluginId) {
        try {
            // State aktualisieren
            if (!this.state[pluginId]) {
                this.state[pluginId] = {};
            }
            this.state[pluginId].enabled = true;
            this.saveState();

            // Wenn Plugin noch nicht geladen, jetzt laden
            if (!this.plugins.has(pluginId)) {
                const pluginPath = path.join(this.pluginsDir, pluginId);
                if (fs.existsSync(pluginPath)) {
                    await this.loadPlugin(pluginPath);
                }
            }

            this.logger.info(`Enabled plugin: ${pluginId}`);
            this.emit('plugin:enabled', pluginId);

            return true;
        } catch (error) {
            this.logger.error(`Failed to enable plugin ${pluginId}: ${error.message}`);
            return false;
        }
    }

    /**
     * Deaktiviert ein Plugin
     */
    async disablePlugin(pluginId) {
        try {
            // State aktualisieren
            if (!this.state[pluginId]) {
                this.state[pluginId] = {};
            }
            this.state[pluginId].enabled = false;
            this.saveState();

            // Plugin entladen
            await this.unloadPlugin(pluginId);

            this.logger.info(`Disabled plugin: ${pluginId}`);
            this.emit('plugin:disabled', pluginId);

            return true;
        } catch (error) {
            this.logger.error(`Failed to disable plugin ${pluginId}: ${error.message}`);
            return false;
        }
    }

    /**
     * Lädt ein Plugin neu
     */
    async reloadPlugin(pluginId) {
        try {
            await this.unloadPlugin(pluginId);

            const pluginPath = path.join(this.pluginsDir, pluginId);
            await this.loadPlugin(pluginPath);

            this.logger.info(`Reloaded plugin: ${pluginId}`);
            this.emit('plugin:reloaded', pluginId);

            return true;
        } catch (error) {
            this.logger.error(`Failed to reload plugin ${pluginId}: ${error.message}`);
            return false;
        }
    }

    /**
     * Löscht ein Plugin
     */
    async deletePlugin(pluginId) {
        try {
            // Plugin entladen
            await this.unloadPlugin(pluginId);

            // Verzeichnis löschen
            const pluginPath = path.join(this.pluginsDir, pluginId);
            if (fs.existsSync(pluginPath)) {
                fs.rmSync(pluginPath, { recursive: true, force: true });
            }

            // State löschen
            delete this.state[pluginId];
            this.saveState();

            this.logger.info(`Deleted plugin: ${pluginId}`);
            this.emit('plugin:deleted', pluginId);

            return true;
        } catch (error) {
            this.logger.error(`Failed to delete plugin ${pluginId}: ${error.message}`);
            return false;
        }
    }

    /**
     * Gibt alle geladenen Plugins zurück
     */
    getAllPlugins() {
        const plugins = [];

        for (const [id, plugin] of this.plugins.entries()) {
            plugins.push({
                id: plugin.manifest.id,
                name: plugin.manifest.name,
                description: plugin.manifest.description,
                version: plugin.manifest.version,
                author: plugin.manifest.author,
                type: plugin.manifest.type,
                enabled: true,
                loadedAt: plugin.loadedAt
            });
        }

        return plugins;
    }

    /**
     * Gibt Plugin-Info zurück
     */
    getPlugin(pluginId) {
        return this.plugins.get(pluginId);
    }

    /**
     * Gibt die Plugin-Instanz zurück (für Injektionen)
     */
    getPluginInstance(pluginId) {
        const plugin = this.plugins.get(pluginId);
        return plugin ? plugin.instance : null;
    }

    /**
     * Registriert Socket-Events für ein Plugin
     */
    registerPluginSocketEvents(socket) {
        for (const [id, plugin] of this.plugins.entries()) {
            for (const { event, callback } of plugin.api.registeredSocketEvents) {
                socket.on(event, (...args) => callback(socket, ...args));
            }
        }
    }

    /**
     * Registriert TikTok-Events für ein Plugin
     */
    registerPluginTikTokEvents(tiktok) {
        for (const [id, plugin] of this.plugins.entries()) {
            for (const { event, callback } of plugin.api.registeredTikTokEvents) {
                tiktok.on(event, callback);
            }
        }
    }
}

module.exports = PluginLoader;
