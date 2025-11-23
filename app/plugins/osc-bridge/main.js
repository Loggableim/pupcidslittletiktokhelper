const osc = require('osc');
const fs = require('fs').promises;
const path = require('path');

/**
 * OSC-Bridge Plugin für VRChat-Integration
 *
 * Permanente OSC-Brücke zwischen TikTok-Events und VRChat-Avataren.
 * Unterstützt bidirektionale Kommunikation mit konfigurierbaren Parametern.
 *
 * Features:
 * - Dauerhaft aktiv (kein Auto-Shutdown)
 * - VRChat-Standard-Parameter (/avatar/parameters/*, /world/*)
 * - Sicherheit: Nur lokale IPs erlaubt
 * - Vollständiges Logging mit oscBridge.log
 * - Event-Bus-Integration für eingehende OSC-Signale
 * - Flow-System-Integration für automatische Trigger
 */
class OSCBridgePlugin {
    constructor(api) {
        this.api = api;
        this.logger = api.logger;

        // OSC UDP Port
        this.udpPort = null;
        this.isRunning = false;
        this.config = null;

        // Logging
        this.logDir = path.join(__dirname, '..', '..', 'user_data', 'logs');
        this.logFile = path.join(this.logDir, 'oscBridge.log');

        // Statistiken
        this.stats = {
            messagesSent: 0,
            messagesReceived: 0,
            errors: 0,
            lastMessageSent: null,
            lastMessageReceived: null,
            startTime: null
        };

        // Sicherheit: Erlaubte IP-Adressen
        this.ALLOWED_IPS = ['127.0.0.1', 'localhost', '::1', '0.0.0.0'];

        // Standard VRChat Parameter-Pfade
        this.VRCHAT_PARAMS = {
            WAVE: '/avatar/parameters/Wave',
            CELEBRATE: '/avatar/parameters/Celebrate',
            DANCE: '/avatar/parameters/DanceTrigger',
            EMOTE_SLOT_0: '/avatar/parameters/EmoteSlot0',
            EMOTE_SLOT_1: '/avatar/parameters/EmoteSlot1',
            EMOTE_SLOT_2: '/avatar/parameters/EmoteSlot2',
            EMOTE_SLOT_3: '/avatar/parameters/EmoteSlot3',
            HEARTS: '/avatar/parameters/Hearts',
            CONFETTI: '/avatar/parameters/Confetti',
            LIGHTS: '/world/lights/nightmode',
            VOLUME: '/world/audio/volume'
        };
    }

    async init() {
        try {
            // Log-Verzeichnis erstellen
            await this.initLogDir();

            // Config laden
            this.config = await this.api.getConfig('config') || this.getDefaultConfig();

            // API-Routes registrieren
            this.registerRoutes();

            // Socket.IO Events registrieren
            this.registerSocketEvents();

            // Automatisch starten wenn enabled
            if (this.config.enabled) {
                await this.start();
            }

            this.logger.info('📡 OSC-Bridge Plugin initialized');

            return true;
        } catch (error) {
            this.logger.error('OSC-Bridge Plugin init error:', error);
            return false;
        }
    }

    async initLogDir() {
        try {
            await fs.mkdir(this.logDir, { recursive: true });
        } catch (error) {
            this.logger.error('Failed to create OSC log directory:', error);
        }
    }

    getDefaultConfig() {
        return {
            enabled: false,
            sendHost: '127.0.0.1',
            sendPort: 9000,
            receivePort: 9001,
            verboseMode: false,
            allowedIPs: ['127.0.0.1', '::1'],
            autoRetryOnError: true,
            retryDelay: 5000,
            maxPacketSize: 65536
        };
    }

    registerRoutes() {
        // UI route
        this.api.registerRoute('GET', '/osc-bridge/ui', (req, res) => {
            res.sendFile(path.join(this.api.getPluginDir(), 'ui.html'));
        });

        // GET /api/osc/status - Status abrufen
        this.api.registerRoute('get', '/api/osc/status', (req, res) => {
            res.json({
                success: true,
                ...this.getStatus()
            });
        });

        // POST /api/osc/start - Bridge starten
        this.api.registerRoute('post', '/api/osc/start', async (req, res) => {
            const result = await this.start();
            res.json(result);
        });

        // POST /api/osc/stop - Bridge stoppen
        this.api.registerRoute('post', '/api/osc/stop', async (req, res) => {
            const result = await this.stop();
            res.json(result);
        });

        // POST /api/osc/send - OSC-Nachricht senden
        this.api.registerRoute('post', '/api/osc/send', (req, res) => {
            const { address, args } = req.body;

            if (!address) {
                return res.status(400).json({
                    success: false,
                    error: 'Address is required'
                });
            }

            const argsArray = Array.isArray(args) ? args : [args];
            const success = this.send(address, ...argsArray);

            res.json({
                success,
                message: success ? 'OSC message sent' : 'Failed to send OSC message',
                address,
                args: argsArray
            });
        });

        // POST /api/osc/test - Test-Signal senden
        this.api.registerRoute('post', '/api/osc/test', (req, res) => {
            const { address, value } = req.body;
            const result = this.test(address, value);
            res.json(result);
        });

        // GET /api/osc/config - Config abrufen
        this.api.registerRoute('get', '/api/osc/config', async (req, res) => {
            const config = await this.api.getConfig('config') || this.getDefaultConfig();
            res.json({
                success: true,
                config
            });
        });

        // POST /api/osc/config - Config aktualisieren
        this.api.registerRoute('post', '/api/osc/config', async (req, res) => {
            const newConfig = req.body;
            const result = await this.updateConfig(newConfig);
            res.json(result);
        });

        // VRChat Helper-Endpoints
        this.api.registerRoute('post', '/api/osc/vrchat/wave', (req, res) => {
            const duration = req.body.duration || 2000;
            this.wave(duration);
            res.json({ success: true, action: 'wave', duration });
        });

        this.api.registerRoute('post', '/api/osc/vrchat/celebrate', (req, res) => {
            const duration = req.body.duration || 3000;
            this.celebrate(duration);
            res.json({ success: true, action: 'celebrate', duration });
        });

        this.api.registerRoute('post', '/api/osc/vrchat/dance', (req, res) => {
            const duration = req.body.duration || 5000;
            this.dance(duration);
            res.json({ success: true, action: 'dance', duration });
        });

        this.api.registerRoute('post', '/api/osc/vrchat/hearts', (req, res) => {
            const duration = req.body.duration || 2000;
            this.hearts(duration);
            res.json({ success: true, action: 'hearts', duration });
        });

        this.api.registerRoute('post', '/api/osc/vrchat/confetti', (req, res) => {
            const duration = req.body.duration || 3000;
            this.confetti(duration);
            res.json({ success: true, action: 'confetti', duration });
        });

        this.api.registerRoute('post', '/api/osc/vrchat/emote', (req, res) => {
            const { slot, duration } = req.body;
            this.triggerEmote(slot || 0, duration || 2000);
            res.json({ success: true, action: 'emote', slot, duration });
        });
    }

    registerSocketEvents() {
        // Client kann Status-Updates anfordern
        this.api.registerSocket('osc:get-status', (data) => {
            this.emitStatus();
        });
    }

    async start() {
        if (this.isRunning) {
            return { success: false, error: 'Already running' };
        }

        try {
            this.udpPort = new osc.UDPPort({
                localAddress: '0.0.0.0',
                localPort: this.config.receivePort,
                remoteAddress: this.config.sendHost,
                remotePort: this.config.sendPort,
                metadata: true
            });

            this.udpPort.on('ready', () => {
                this.isRunning = true;
                this.stats.startTime = new Date();

                const info = `OSC-Bridge started - Receive: ${this.config.receivePort}, Send: ${this.config.sendHost}:${this.config.sendPort}`;
                this.logger.info(`📡 ${info}`);
                this.logToFile('INFO', info);

                this.emitStatus();
            });

            this.udpPort.on('message', (oscMessage, timeTag, info) => {
                this.handleIncomingMessage(oscMessage, info);
            });

            this.udpPort.on('error', (error) => {
                this.stats.errors++;
                this.logger.error('OSC-Bridge error:', error);
                this.logToFile('ERROR', `${error.message}`);

                // Auto-Retry bei Port-Kollision
                if (error.code === 'EADDRINUSE' && this.config.autoRetryOnError) {
                    this.logger.info(`Port ${this.config.receivePort} in use, trying ${this.config.receivePort + 1}...`);
                    this.config.receivePort++;
                    this.api.setConfig('config', this.config);

                    setTimeout(() => {
                        this.start();
                    }, this.config.retryDelay);
                }

                this.emitStatus();
            });

            this.udpPort.open();

            return { success: true };

        } catch (error) {
            this.logger.error('Failed to start OSC-Bridge:', error);
            this.logToFile('ERROR', `Start failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    async stop() {
        if (!this.isRunning) {
            return { success: false, error: 'Not running' };
        }

        try {
            if (this.udpPort) {
                this.udpPort.close();
                this.udpPort = null;
            }

            this.isRunning = false;
            this.logger.info('📡 OSC-Bridge stopped');
            this.logToFile('INFO', 'OSC-Bridge stopped');

            this.emitStatus();

            return { success: true };

        } catch (error) {
            this.logger.error('Failed to stop OSC-Bridge:', error);
            return { success: false, error: error.message };
        }
    }

    send(address, ...args) {
        if (!this.isRunning) {
            this.logger.warn('OSC-Bridge not running, cannot send message');
            return false;
        }

        try {
            if (!this.isValidAddress(address)) {
                this.logger.warn(`Blocked OSC send to suspicious address: ${address}`);
                return false;
            }

            const message = {
                address: address,
                args: args.map(arg => this.convertToOSCArg(arg))
            };

            this.udpPort.send(message);

            this.stats.messagesSent++;
            this.stats.lastMessageSent = { address, args, timestamp: new Date() };

            const logMsg = `SEND → ${address} ${JSON.stringify(args)}`;
            this.logToFile('SEND', logMsg);

            if (this.config.verboseMode) {
                this.logger.debug(`📡 ${logMsg}`);
            }

            this.api.emit('osc:sent', {
                address,
                args,
                timestamp: new Date()
            });

            return true;

        } catch (error) {
            this.stats.errors++;
            this.logger.error('OSC send error:', error);
            this.logToFile('ERROR', `Send failed: ${error.message}`);
            return false;
        }
    }

    handleIncomingMessage(oscMessage, info) {
        try {
            const { address, args } = oscMessage;

            this.stats.messagesReceived++;
            this.stats.lastMessageReceived = { address, args, timestamp: new Date() };

            const values = args.map(arg => arg.value);
            const logMsg = `RECV ← ${address} ${JSON.stringify(values)} from ${info.address}:${info.port}`;
            this.logToFile('RECV', logMsg);

            if (this.config.verboseMode) {
                this.logger.debug(`📡 ${logMsg}`);
            }

            this.api.emit('osc:received', {
                address,
                args: values,
                source: `${info.address}:${info.port}`,
                timestamp: new Date()
            });

            // Event für Flow-System
            this.api.emit(`osc.in${address}`, {
                address,
                values,
                source: info.address
            });

        } catch (error) {
            this.stats.errors++;
            this.logger.error('OSC message handling error:', error);
            this.logToFile('ERROR', `Message handling failed: ${error.message}`);
        }
    }

    convertToOSCArg(value) {
        if (typeof value === 'number') {
            return Number.isInteger(value) ? { type: 'i', value } : { type: 'f', value };
        } else if (typeof value === 'string') {
            return { type: 's', value };
        } else if (typeof value === 'boolean') {
            return { type: value ? 'T' : 'F' };
        } else {
            return { type: 's', value: String(value) };
        }
    }

    isValidAddress(address) {
        if (!address.startsWith('/')) {
            return false;
        }

        if (address.includes('..') || address.includes('\\')) {
            return false;
        }

        return true;
    }

    async logToFile(level, message) {
        try {
            const timestamp = new Date().toISOString();
            const logLine = `[${timestamp}] [${level}] ${message}\n`;
            await fs.appendFile(this.logFile, logLine, 'utf8');
        } catch (error) {
            // Silent fail
        }
    }

    async updateConfig(newConfig) {
        try {
            const wasRunning = this.isRunning;

            if (wasRunning) {
                await this.stop();
            }

            this.config = { ...this.config, ...newConfig };

            await this.api.setConfig('config', this.config);

            if (wasRunning && this.config.enabled) {
                await this.start();
            } else if (!this.config.enabled && wasRunning) {
                this.logger.info('📡 OSC-Bridge disabled');
            } else if (this.config.enabled && !wasRunning) {
                await this.start();
            }

            this.emitStatus();

            return { success: true, config: this.config };

        } catch (error) {
            this.logger.error('Failed to update OSC config:', error);
            return { success: false, error: error.message };
        }
    }

    emitStatus() {
        const status = this.getStatus();
        this.api.emit('osc:status', status);
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            config: this.config,
            stats: this.stats,
            uptime: this.stats.startTime ? Date.now() - this.stats.startTime.getTime() : 0
        };
    }

    test(address = '/avatar/parameters/Test', value = 1) {
        if (!this.isRunning) {
            return { success: false, error: 'Bridge not running' };
        }

        try {
            this.send(address, value);
            this.logger.info(`📡 OSC Test signal sent: ${address} = ${value}`);

            return {
                success: true,
                message: `Test signal sent to ${address}`,
                address,
                value
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // VRChat Helper-Methoden
    triggerAvatarParameter(paramName, value = 1, duration = 1000) {
        const address = `/avatar/parameters/${paramName}`;
        this.send(address, value);

        if (duration > 0) {
            setTimeout(() => {
                this.send(address, 0);
            }, duration);
        }
    }

    wave(duration = 2000) {
        this.triggerAvatarParameter('Wave', 1, duration);
    }

    celebrate(duration = 3000) {
        this.triggerAvatarParameter('Celebrate', 1, duration);
    }

    dance(duration = 5000) {
        this.triggerAvatarParameter('DanceTrigger', 1, duration);
    }

    hearts(duration = 2000) {
        this.triggerAvatarParameter('Hearts', 1, duration);
    }

    confetti(duration = 3000) {
        this.triggerAvatarParameter('Confetti', 1, duration);
    }

    triggerEmote(slotNumber, duration = 2000) {
        if (slotNumber >= 0 && slotNumber <= 7) {
            this.triggerAvatarParameter(`EmoteSlot${slotNumber}`, 1, duration);
        }
    }

    // Expose für Flow-System
    getOSCBridge() {
        return this;
    }

    async destroy() {
        if (this.isRunning) {
            await this.stop();
        }

        this.logger.info('📡 OSC-Bridge Plugin destroyed');
    }
}

module.exports = OSCBridgePlugin;
