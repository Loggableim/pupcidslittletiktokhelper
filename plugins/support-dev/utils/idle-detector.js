const { spawn } = require('child_process');
const os = require('os');
const si = require('systeminformation');

/**
 * Idle Detector
 * Detects system idle state based on multiple criteria:
 * - System idle time (OS-level)
 * - CPU load
 * - GPU load
 * - User activity (keyboard/mouse)
 */
class IdleDetector {
    constructor(logger) {
        this.logger = logger || console;
        this.platform = os.platform();
        
        // Idle thresholds (configurable)
        this.config = {
            idleTimeSeconds: 120,      // 2 minutes of no user activity
            cpuThresholdPercent: 20,   // CPU must be below 20% to consider idle
            gpuThresholdPercent: 20,   // GPU must be below 20% to consider idle
        };
        
        // State
        this.isIdle = false;
        this.lastCheckTime = Date.now();
        this.checkInterval = null;
    }

    /**
     * Configure idle detection thresholds
     */
    configure(config) {
        if (config.idleTimeSeconds !== undefined) {
            this.config.idleTimeSeconds = Math.max(60, config.idleTimeSeconds);
        }
        if (config.cpuThresholdPercent !== undefined) {
            this.config.cpuThresholdPercent = Math.max(0, Math.min(100, config.cpuThresholdPercent));
        }
        if (config.gpuThresholdPercent !== undefined) {
            this.config.gpuThresholdPercent = Math.max(0, Math.min(100, config.gpuThresholdPercent));
        }
    }

    /**
     * Start idle detection monitoring
     * @param {Function} onIdleChange - Callback when idle state changes (isIdle)
     */
    start(onIdleChange) {
        this.onIdleChange = onIdleChange;
        
        // Check every 10 seconds
        this.checkInterval = setInterval(() => {
            this.checkIdleState();
        }, 10000);
        
        // Initial check
        this.checkIdleState();
        
        this.logger.info('Idle detector started');
    }

    /**
     * Stop idle detection monitoring
     */
    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        this.logger.info('Idle detector stopped');
    }

    /**
     * Check if system is currently idle
     */
    async checkIdleState() {
        try {
            const systemIdleTime = await this.getSystemIdleTime();
            const cpuLoad = await this.getCPULoad();
            const gpuLoad = await this.getGPULoad();
            
            // System is idle if:
            // 1. No user activity for configured time
            // 2. CPU load is below threshold
            // 3. GPU load is below threshold (if GPU present)
            
            const isSystemIdle = systemIdleTime >= this.config.idleTimeSeconds;
            const isCPUIdle = cpuLoad < this.config.cpuThresholdPercent;
            const isGPUIdle = gpuLoad === null || gpuLoad < this.config.gpuThresholdPercent;
            
            const wasIdle = this.isIdle;
            this.isIdle = isSystemIdle && isCPUIdle && isGPUIdle;
            
            // Log state change
            if (wasIdle !== this.isIdle) {
                this.logger.info(`Idle state changed: ${this.isIdle ? 'IDLE' : 'ACTIVE'}`);
                this.logger.debug(`  System idle: ${systemIdleTime}s (threshold: ${this.config.idleTimeSeconds}s)`);
                this.logger.debug(`  CPU load: ${cpuLoad.toFixed(1)}% (threshold: ${this.config.cpuThresholdPercent}%)`);
                this.logger.debug(`  GPU load: ${gpuLoad !== null ? gpuLoad.toFixed(1) + '%' : 'N/A'} (threshold: ${this.config.gpuThresholdPercent}%)`);
                
                if (this.onIdleChange) {
                    this.onIdleChange(this.isIdle);
                }
            }
            
            return this.isIdle;
            
        } catch (error) {
            this.logger.error(`Error checking idle state: ${error.message}`);
            return false;
        }
    }

    /**
     * Get system idle time in seconds
     */
    async getSystemIdleTime() {
        return new Promise((resolve) => {
            if (this.platform === 'win32') {
                // Windows: Use PowerShell to get idle time
                const ps = spawn('powershell', [
                    '-Command',
                    'Add-Type @\'',
                    'using System;',
                    'using System.Runtime.InteropServices;',
                    'public class Idle {',
                    '    [DllImport("user32.dll")]',
                    '    public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);',
                    '    public struct LASTINPUTINFO {',
                    '        public uint cbSize;',
                    '        public uint dwTime;',
                    '    }',
                    '}',
                    '\'@;',
                    '$lastInput = New-Object Idle+LASTINPUTINFO;',
                    '$lastInput.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($lastInput);',
                    '[Idle]::GetLastInputInfo([ref]$lastInput) | Out-Null;',
                    '$idleTime = ([Environment]::TickCount - $lastInput.dwTime) / 1000;',
                    'Write-Output $idleTime'
                ]);

                let output = '';
                ps.stdout.on('data', (data) => {
                    output += data.toString();
                });

                ps.on('close', () => {
                    const idleTime = parseFloat(output.trim()) || 0;
                    resolve(Math.floor(idleTime));
                });

                ps.on('error', () => {
                    resolve(0);
                });

            } else if (this.platform === 'darwin') {
                // macOS: Use ioreg
                const ioreg = spawn('ioreg', ['-c', 'IOHIDSystem']);
                let output = '';

                ioreg.stdout.on('data', (data) => {
                    output += data.toString();
                });

                ioreg.on('close', () => {
                    const match = output.match(/"HIDIdleTime"\s*=\s*(\d+)/);
                    if (match) {
                        const idleNano = parseInt(match[1]);
                        const idleSeconds = Math.floor(idleNano / 1000000000);
                        resolve(idleSeconds);
                    } else {
                        resolve(0);
                    }
                });

                ioreg.on('error', () => {
                    resolve(0);
                });

            } else {
                // Linux: Use xprintidle or fallback to xssstate
                const xprintidle = spawn('xprintidle');
                let output = '';

                xprintidle.stdout.on('data', (data) => {
                    output += data.toString();
                });

                xprintidle.on('close', (code) => {
                    if (code === 0) {
                        const idleMs = parseInt(output.trim()) || 0;
                        resolve(Math.floor(idleMs / 1000));
                    } else {
                        // Fallback: assume not idle
                        resolve(0);
                    }
                });

                xprintidle.on('error', () => {
                    // xprintidle not available, assume not idle
                    resolve(0);
                });
            }
        });
    }

    /**
     * Get current CPU load percentage
     */
    async getCPULoad() {
        try {
            const currentLoad = await si.currentLoad();
            return currentLoad.currentLoad || 0;
        } catch (error) {
            this.logger.error(`Error getting CPU load: ${error.message}`);
            return 100; // Assume high load on error to be safe
        }
    }

    /**
     * Get current GPU load percentage
     */
    async getGPULoad() {
        try {
            const graphics = await si.graphics();
            if (graphics.controllers && graphics.controllers.length > 0) {
                // Get the highest load among all GPUs
                const loads = graphics.controllers
                    .map(gpu => gpu.utilizationGpu || 0)
                    .filter(load => load > 0);
                
                if (loads.length > 0) {
                    return Math.max(...loads);
                }
            }
            return null; // No GPU or GPU load not available
        } catch (error) {
            this.logger.error(`Error getting GPU load: ${error.message}`);
            return null;
        }
    }

    /**
     * Get current idle state without triggering callbacks
     */
    getState() {
        return {
            isIdle: this.isIdle,
            config: { ...this.config }
        };
    }
}

module.exports = IdleDetector;
