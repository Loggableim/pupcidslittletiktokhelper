/**
 * Metrics Collector Utility
 *
 * Collects system metrics using systeminformation package:
 * - CPU usage (total and per-core)
 * - CPU temperature
 * - RAM usage (total, used, free, percentage)
 * - Process-specific memory
 * - GPU information and usage
 * - System uptime and process uptime
 */

const si = require('systeminformation');

class MetricsCollector {
    constructor(logger) {
        this.logger = logger;

        // Historical data buffer (stores last 60 seconds of metrics)
        this.historySize = 60;
        this.history = {
            cpu: [],
            memory: [],
            gpu: [],
            network: [],
            timestamps: []
        };

        // Cache for static info (updated less frequently)
        this.staticInfo = {
            cpu: null,
            memory: null,
            gpu: null,
            os: null,
            network: null,
            lastUpdate: 0
        };

        // Cache TTL for static info (5 minutes)
        this.staticInfoTTL = 5 * 60 * 1000;

        // GPU availability flag
        this.hasGPU = false;
        this.gpuCheckDone = false;

        // Network stats tracking
        this.lastNetworkStats = null;
        this.lastNetworkStatsTime = 0;
    }

    /**
     * Initialize and check for GPU availability
     */
    async initialize() {
        try {
            this.log('Initializing metrics collector...', 'info');

            // Check for GPU
            const graphics = await si.graphics();
            this.hasGPU = graphics.controllers && graphics.controllers.length > 0;
            this.gpuCheckDone = true;

            if (this.hasGPU) {
                // Filter out virtual/meta monitors
                const realGPUs = graphics.controllers.filter(gpu => {
                    const model = (gpu.model || '').toLowerCase();
                    const vendor = (gpu.vendor || '').toLowerCase();
                    return !model.includes('virtual') && 
                           !model.includes('meta') && 
                           !model.includes('basic display') &&
                           !vendor.includes('meta');
                });

                if (realGPUs.length > 0) {
                    this.log(`GPU detected: ${realGPUs[0].model}`, 'info');
                } else {
                    this.log(`GPU detected: ${graphics.controllers[0].model}`, 'info');
                }
            } else {
                this.log('No GPU detected or not accessible', 'info');
            }

            // Load static info
            await this.updateStaticInfo();

            this.log('Metrics collector initialized successfully', 'info');
        } catch (error) {
            this.log(`Error initializing metrics collector: ${error.message}`, 'error');
            this.hasGPU = false;
            this.gpuCheckDone = true;
        }
    }

    /**
     * Update static system information (called less frequently)
     */
    async updateStaticInfo() {
        try {
            const now = Date.now();

            // Only update if cache is stale
            if (now - this.staticInfo.lastUpdate < this.staticInfoTTL) {
                return;
            }

            // Get static CPU info
            const cpuInfo = await si.cpu();
            this.staticInfo.cpu = {
                manufacturer: cpuInfo.manufacturer,
                brand: cpuInfo.brand,
                cores: cpuInfo.cores,
                physicalCores: cpuInfo.physicalCores,
                processors: cpuInfo.processors,
                speed: cpuInfo.speed,
                speedMin: cpuInfo.speedMin,
                speedMax: cpuInfo.speedMax
            };

            // Get static memory info
            const memInfo = await si.mem();
            this.staticInfo.memory = {
                total: memInfo.total
            };

            // Get static GPU info
            if (this.hasGPU) {
                const graphics = await si.graphics();
                if (graphics.controllers && graphics.controllers.length > 0) {
                    this.staticInfo.gpu = graphics.controllers.map(gpu => ({
                        vendor: gpu.vendor,
                        model: gpu.model,
                        vram: gpu.vram,
                        vramDynamic: gpu.vramDynamic
                    }));
                }
            }

            // Get OS info
            const osInfo = await si.osInfo();
            this.staticInfo.os = {
                platform: osInfo.platform,
                distro: osInfo.distro,
                release: osInfo.release,
                kernel: osInfo.kernel,
                arch: osInfo.arch,
                hostname: osInfo.hostname
            };

            // Get network interface info
            const networkInterfaces = await si.networkInterfaces();
            this.staticInfo.network = networkInterfaces.map(iface => ({
                iface: iface.iface,
                ifaceName: iface.ifaceName,
                type: iface.type,
                speed: iface.speed,
                internal: iface.internal
            }));

            this.staticInfo.lastUpdate = now;

        } catch (error) {
            this.log(`Error updating static info: ${error.message}`, 'warn');
        }
    }

    /**
     * Collect all current metrics
     */
    async collectMetrics() {
        try {
            const timestamp = Date.now();

            // Periodically update static info
            await this.updateStaticInfo();

            // Collect dynamic metrics in parallel for better performance
            const [
                cpuData,
                memData,
                cpuTemp,
                processData,
                uptimeData,
                gpuData,
                networkData,
                processesData
            ] = await Promise.all([
                this.getCPUMetrics(),
                this.getMemoryMetrics(),
                this.getCPUTemperature(),
                this.getProcessMetrics(),
                this.getUptimeMetrics(),
                this.hasGPU ? this.getGPUMetrics() : Promise.resolve(null),
                this.getNetworkMetrics(),
                this.getTopProcesses()
            ]);

            // Combine all metrics
            const metrics = {
                timestamp,
                cpu: cpuData,
                memory: memData,
                process: processData,
                uptime: uptimeData,
                network: networkData,
                processes: processesData,
                static: this.staticInfo
            };

            // Add temperature if available
            if (cpuTemp !== null) {
                metrics.cpu.temperature = cpuTemp;
            }

            // Add GPU if available
            if (gpuData) {
                metrics.gpu = gpuData;
            }

            // Add to history
            this.addToHistory(metrics);

            return metrics;

        } catch (error) {
            this.log(`Error collecting metrics: ${error.message}`, 'error');
            return null;
        }
    }

    /**
     * Get CPU metrics (usage and per-core)
     */
    async getCPUMetrics() {
        try {
            const cpuLoad = await si.currentLoad();

            return {
                usage: Math.round(cpuLoad.currentLoad * 100) / 100,
                idle: Math.round(cpuLoad.currentLoadIdle * 100) / 100,
                user: Math.round(cpuLoad.currentLoadUser * 100) / 100,
                system: Math.round(cpuLoad.currentLoadSystem * 100) / 100,
                cores: cpuLoad.cpus ? cpuLoad.cpus.map(core => ({
                    load: Math.round(core.load * 100) / 100,
                    loadUser: Math.round(core.loadUser * 100) / 100,
                    loadSystem: Math.round(core.loadSystem * 100) / 100,
                    loadIdle: Math.round(core.loadIdle * 100) / 100
                })) : []
            };
        } catch (error) {
            this.log(`Error getting CPU metrics: ${error.message}`, 'warn');
            return { usage: 0, idle: 100, user: 0, system: 0, cores: [] };
        }
    }

    /**
     * Get CPU temperature (if available)
     */
    async getCPUTemperature() {
        try {
            const temp = await si.cpuTemperature();

            if (temp.main !== null && temp.main !== -1) {
                return {
                    main: temp.main,
                    cores: temp.cores || [],
                    max: temp.max || null,
                    socket: temp.socket || []
                };
            }

            return null;
        } catch (error) {
            // Temperature not available on all systems, don't spam logs
            return null;
        }
    }

    /**
     * Get memory metrics
     */
    async getMemoryMetrics() {
        try {
            const mem = await si.mem();

            const total = mem.total;
            const used = mem.used;
            const free = mem.free;
            const available = mem.available;
            const usedPercent = total > 0 ? Math.round((used / total) * 10000) / 100 : 0;

            return {
                total,
                used,
                free,
                available,
                usedPercent,
                // Convert to human-readable
                totalGB: Math.round(total / (1024 * 1024 * 1024) * 100) / 100,
                usedGB: Math.round(used / (1024 * 1024 * 1024) * 100) / 100,
                freeGB: Math.round(free / (1024 * 1024 * 1024) * 100) / 100,
                availableGB: Math.round(available / (1024 * 1024 * 1024) * 100) / 100,
                // Swap info
                swapTotal: mem.swaptotal,
                swapUsed: mem.swapused,
                swapFree: mem.swapfree
            };
        } catch (error) {
            this.log(`Error getting memory metrics: ${error.message}`, 'warn');
            return {
                total: 0,
                used: 0,
                free: 0,
                available: 0,
                usedPercent: 0,
                totalGB: 0,
                usedGB: 0,
                freeGB: 0,
                availableGB: 0
            };
        }
    }

    /**
     * Get process-specific metrics
     */
    async getProcessMetrics() {
        try {
            const processLoad = await si.processLoad('node');

            if (processLoad && processLoad.proc) {
                return {
                    cpu: Math.round(processLoad.proc * 100) / 100,
                    memory: process.memoryUsage().heapUsed,
                    memoryMB: Math.round(process.memoryUsage().heapUsed / (1024 * 1024) * 100) / 100,
                    pid: process.pid
                };
            }

            // Fallback to basic process info
            const memUsage = process.memoryUsage();
            return {
                cpu: 0,
                memory: memUsage.heapUsed,
                memoryMB: Math.round(memUsage.heapUsed / (1024 * 1024) * 100) / 100,
                heapTotal: Math.round(memUsage.heapTotal / (1024 * 1024) * 100) / 100,
                external: Math.round(memUsage.external / (1024 * 1024) * 100) / 100,
                rss: Math.round(memUsage.rss / (1024 * 1024) * 100) / 100,
                pid: process.pid
            };
        } catch (error) {
            this.log(`Error getting process metrics: ${error.message}`, 'warn');
            const memUsage = process.memoryUsage();
            return {
                cpu: 0,
                memory: memUsage.heapUsed,
                memoryMB: Math.round(memUsage.heapUsed / (1024 * 1024) * 100) / 100,
                pid: process.pid
            };
        }
    }

    /**
     * Get GPU metrics (if available)
     * Prioritizes dedicated GPUs over integrated/virtual ones
     */
    async getGPUMetrics() {
        try {
            if (!this.hasGPU) {
                return null;
            }

            const graphics = await si.graphics();

            if (graphics.controllers && graphics.controllers.length > 0) {
                // Filter and prioritize GPUs
                // 1. Exclude virtual/meta monitors
                // 2. Prefer NVIDIA, AMD, Intel Arc over integrated GPUs
                // 3. Return the first suitable GPU
                
                const gpuList = graphics.controllers.filter(gpu => {
                    const model = (gpu.model || '').toLowerCase();
                    const vendor = (gpu.vendor || '').toLowerCase();
                    
                    // Exclude virtual monitors and Microsoft Basic Display
                    if (model.includes('virtual') || 
                        model.includes('meta') || 
                        model.includes('basic display') ||
                        model.includes('vnc') ||
                        vendor.includes('meta')) {
                        return false;
                    }
                    return true;
                });

                // Sort GPUs to prioritize dedicated ones
                const sortedGPUs = gpuList.sort((a, b) => {
                    const aModel = (a.model || '').toLowerCase();
                    const bModel = (b.model || '').toLowerCase();
                    const aVendor = (a.vendor || '').toLowerCase();
                    const bVendor = (b.vendor || '').toLowerCase();
                    
                    // Prioritize NVIDIA, AMD, Intel Arc
                    const dedicatedVendors = ['nvidia', 'amd', 'ati'];
                    const aDedicated = dedicatedVendors.some(v => aVendor.includes(v));
                    const bDedicated = dedicatedVendors.some(v => bVendor.includes(v));
                    
                    if (aDedicated && !bDedicated) return -1;
                    if (!aDedicated && bDedicated) return 1;
                    
                    // De-prioritize Intel UHD/HD Graphics (integrated)
                    const aIntegrated = aModel.includes('uhd') || aModel.includes('hd graphics');
                    const bIntegrated = bModel.includes('uhd') || bModel.includes('hd graphics');
                    
                    if (!aIntegrated && bIntegrated) return -1;
                    if (aIntegrated && !bIntegrated) return 1;
                    
                    return 0;
                });

                // Use the best GPU found
                const selectedGPUs = sortedGPUs.length > 0 ? sortedGPUs : graphics.controllers;
                
                return selectedGPUs.map(gpu => ({
                    model: gpu.model,
                    vendor: gpu.vendor,
                    vram: gpu.vram,
                    vramDynamic: gpu.vramDynamic,
                    temperatureGpu: gpu.temperatureGpu || null,
                    utilizationGpu: gpu.utilizationGpu || null,
                    utilizationMemory: gpu.utilizationMemory || null,
                    memoryTotal: gpu.memoryTotal || null,
                    memoryUsed: gpu.memoryUsed || null,
                    memoryFree: gpu.memoryFree || null
                }));
            }

            return null;
        } catch (error) {
            // GPU metrics might not be available, don't spam logs
            return null;
        }
    }

    /**
     * Get uptime metrics
     */
    async getUptimeMetrics() {
        try {
            const time = await si.time();

            return {
                system: time.uptime,
                process: process.uptime(),
                // Human-readable formats
                systemHours: Math.floor(time.uptime / 3600),
                processHours: Math.floor(process.uptime() / 3600)
            };
        } catch (error) {
            this.log(`Error getting uptime metrics: ${error.message}`, 'warn');
            return {
                system: 0,
                process: process.uptime(),
                systemHours: 0,
                processHours: Math.floor(process.uptime() / 3600)
            };
        }
    }

    /**
     * Get network metrics (upload/download rates)
     */
    async getNetworkMetrics() {
        try {
            const networkStats = await si.networkStats();
            const now = Date.now();

            if (!networkStats || networkStats.length === 0) {
                return {
                    rx_sec: 0,
                    tx_sec: 0,
                    rx_bytes: 0,
                    tx_bytes: 0
                };
            }

            // Use the primary (non-internal) network interface
            let primaryInterface = networkStats.find(iface => !iface.iface.startsWith('lo'));
            if (!primaryInterface) {
                primaryInterface = networkStats[0];
            }

            // Calculate rates if we have previous data
            let rx_sec = 0;
            let tx_sec = 0;

            if (this.lastNetworkStats && this.lastNetworkStatsTime > 0) {
                const timeDiff = (now - this.lastNetworkStatsTime) / 1000; // in seconds

                if (timeDiff > 0) {
                    const rxDiff = primaryInterface.rx_bytes - this.lastNetworkStats.rx_bytes;
                    const txDiff = primaryInterface.tx_bytes - this.lastNetworkStats.tx_bytes;

                    rx_sec = Math.max(0, rxDiff / timeDiff);
                    tx_sec = Math.max(0, txDiff / timeDiff);
                }
            }

            // Store current stats for next calculation
            this.lastNetworkStats = {
                rx_bytes: primaryInterface.rx_bytes,
                tx_bytes: primaryInterface.tx_bytes
            };
            this.lastNetworkStatsTime = now;

            return {
                rx_sec: Math.round(rx_sec),
                tx_sec: Math.round(tx_sec),
                rx_bytes: primaryInterface.rx_bytes,
                tx_bytes: primaryInterface.tx_bytes,
                iface: primaryInterface.iface,
                operstate: primaryInterface.operstate
            };
        } catch (error) {
            this.log(`Error getting network metrics: ${error.message}`, 'warn');
            return {
                rx_sec: 0,
                tx_sec: 0,
                rx_bytes: 0,
                tx_bytes: 0
            };
        }
    }

    /**
     * Get top processes by memory usage
     */
    async getTopProcesses() {
        try {
            const processes = await si.processes();

            if (!processes || !processes.list || processes.list.length === 0) {
                return [];
            }

            // Sort by memory usage and take top 10
            const sorted = processes.list
                .filter(proc => proc.mem > 0) // Filter out processes with no memory
                .sort((a, b) => b.mem - a.mem)
                .slice(0, 10);

            return sorted.map(proc => ({
                pid: proc.pid,
                name: proc.name,
                cpu: Math.round(proc.cpu * 100) / 100,
                memory: proc.mem, // Percentage
                memMb: Math.round(proc.memRss / 1024), // Convert KB to MB
                command: proc.command
            }));
        } catch (error) {
            this.log(`Error getting top processes: ${error.message}`, 'warn');
            return [];
        }
    }

    /**
     * Add metrics to historical buffer
     */
    addToHistory(metrics) {
        try {
            // Add timestamp
            this.history.timestamps.push(metrics.timestamp);

            // Add CPU data
            this.history.cpu.push({
                usage: metrics.cpu.usage,
                temperature: metrics.cpu.temperature?.main || null
            });

            // Add memory data
            this.history.memory.push({
                usedPercent: metrics.memory.usedPercent,
                usedGB: metrics.memory.usedGB
            });

            // Add GPU data if available
            if (metrics.gpu && metrics.gpu.length > 0) {
                if (!this.history.gpu.length) {
                    this.history.gpu = [];
                }
                this.history.gpu.push({
                    utilization: metrics.gpu[0].utilizationGpu || null,
                    temperature: metrics.gpu[0].temperatureGpu || null
                });
            }

            // Add network data if available
            if (metrics.network) {
                if (!this.history.network) {
                    this.history.network = [];
                }
                this.history.network.push({
                    rx_sec: metrics.network.rx_sec || 0,
                    tx_sec: metrics.network.tx_sec || 0
                });
            }

            // Trim history to maintain size limit
            if (this.history.timestamps.length > this.historySize) {
                const excess = this.history.timestamps.length - this.historySize;
                this.history.timestamps.splice(0, excess);
                this.history.cpu.splice(0, excess);
                this.history.memory.splice(0, excess);
                if (this.history.gpu.length > 0) {
                    this.history.gpu.splice(0, excess);
                }
                if (this.history.network && this.history.network.length > 0) {
                    this.history.network.splice(0, excess);
                }
            }
        } catch (error) {
            this.log(`Error adding to history: ${error.message}`, 'warn');
        }
    }

    /**
     * Get historical data
     */
    getHistory() {
        return {
            timestamps: [...this.history.timestamps],
            cpu: [...this.history.cpu],
            memory: [...this.history.memory],
            gpu: [...this.history.gpu],
            network: this.history.network ? [...this.history.network] : []
        };
    }

    /**
     * Clear historical data
     */
    clearHistory() {
        this.history = {
            cpu: [],
            memory: [],
            gpu: [],
            network: [],
            timestamps: []
        };
        this.log('History cleared', 'info');
    }

    /**
     * Log helper
     */
    log(message, level = 'info') {
        if (this.logger) {
            this.logger(message, level);
        }
    }
}

module.exports = MetricsCollector;
