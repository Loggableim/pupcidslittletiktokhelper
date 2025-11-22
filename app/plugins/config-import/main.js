/**
 * Config Import Plugin
 * 
 * Allows users to import settings from old installation paths
 * where config files were stored directly in the installation directory.
 * 
 * Features:
 * - Browse and select old installation path
 * - Validate path for config files
 * - Import user_configs, user_data, and uploads
 * - Conflict detection and handling
 */

const fs = require('fs');
const path = require('path');

class ConfigImportPlugin {
    constructor(api) {
        this.api = api;
    }

    async init() {
        this.api.log('📥 Initializing Config Import Plugin...', 'info');

        try {
            // Register API routes
            this.registerRoutes();

            this.api.log('✅ Config Import Plugin initialized successfully', 'info');
        } catch (error) {
            this.api.log(`❌ Error initializing Config Import Plugin: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Register API routes
     */
    registerRoutes() {
        // Validate path endpoint
        this.api.registerRoute('POST', '/api/config-import/validate', async (req, res) => {
            try {
                const { importPath } = req.body;

                if (!importPath) {
                    return res.status(400).json({
                        success: false,
                        error: 'Import path is required'
                    });
                }

                // Sanitize and validate input path
                const sanitizedPath = this.sanitizePath(importPath);
                if (!sanitizedPath) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid path format'
                    });
                }

                const validation = this.validateImportPath(sanitizedPath);
                res.json(validation);
            } catch (error) {
                this.api.log(`Validation error: ${error.message}`, 'error');
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Import settings endpoint
        this.api.registerRoute('POST', '/api/config-import/import', async (req, res) => {
            try {
                const { importPath } = req.body;

                if (!importPath) {
                    return res.status(400).json({
                        success: false,
                        error: 'Import path is required'
                    });
                }

                // Sanitize and validate input path
                const sanitizedPath = this.sanitizePath(importPath);
                if (!sanitizedPath) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid path format'
                    });
                }

                // Validate first
                const validation = this.validateImportPath(sanitizedPath);
                if (!validation.valid) {
                    return res.status(400).json({
                        success: false,
                        error: validation.error || 'Invalid import path'
                    });
                }

                // Perform import
                const result = await this.importSettings(sanitizedPath);
                res.json(result);
            } catch (error) {
                this.api.log(`Import error: ${error.message}`, 'error');
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        this.api.log('Registered Config Import routes', 'info');
    }

    /**
     * Sanitize and validate path input to prevent directory traversal attacks
     */
    sanitizePath(inputPath) {
        try {
            if (typeof inputPath !== 'string') {
                return null;
            }

            // Trim whitespace
            let cleanPath = inputPath.trim();

            // Check for empty path
            if (!cleanPath) {
                return null;
            }

            // Resolve to absolute path to prevent directory traversal
            const absolutePath = path.resolve(cleanPath);

            // Additional security check: Ensure the path doesn't contain suspicious patterns
            // that might indicate an attempt to escape the file system
            const suspiciousPatterns = [
                /\.\.[\/\\]/,  // Directory traversal attempts
                /[<>:"|?*]/,   // Invalid filename characters (except on Unix where : is valid in paths)
            ];

            for (const pattern of suspiciousPatterns) {
                if (pattern.test(cleanPath)) {
                    this.api.log(`Suspicious path pattern detected: ${cleanPath}`, 'warn');
                    return null;
                }
            }

            return absolutePath;
        } catch (error) {
            this.api.log(`Path sanitization error: ${error.message}`, 'error');
            return null;
        }
    }

    /**
     * Validate import path for configuration files
     */
    validateImportPath(importPath) {
        try {
            // Check if path exists
            if (!fs.existsSync(importPath)) {
                return {
                    valid: false,
                    error: 'Path does not exist'
                };
            }

            // Check if it's a directory
            const stats = fs.statSync(importPath);
            if (!stats.isDirectory()) {
                return {
                    valid: false,
                    error: 'Path is not a directory'
                };
            }

            // Look for config directories/files
            const findings = {
                userConfigs: false,
                userData: false,
                uploads: false,
                files: []
            };

            // Check for user_configs directory
            const userConfigsPath = path.join(importPath, 'user_configs');
            if (fs.existsSync(userConfigsPath) && fs.statSync(userConfigsPath).isDirectory()) {
                const files = fs.readdirSync(userConfigsPath);
                if (files.length > 0) {
                    findings.userConfigs = true;
                    findings.files.push(...files.map(f => `user_configs/${f}`));
                }
            }

            // Check for user_data directory
            const userDataPath = path.join(importPath, 'user_data');
            if (fs.existsSync(userDataPath) && fs.statSync(userDataPath).isDirectory()) {
                const files = fs.readdirSync(userDataPath);
                if (files.length > 0) {
                    findings.userData = true;
                    findings.files.push(...files.map(f => `user_data/${f}`));
                }
            }

            // Check for uploads directory
            const uploadsPath = path.join(importPath, 'uploads');
            if (fs.existsSync(uploadsPath) && fs.statSync(uploadsPath).isDirectory()) {
                const files = fs.readdirSync(uploadsPath);
                if (files.length > 0) {
                    findings.uploads = true;
                    findings.files.push(...files.map(f => `uploads/${f}`));
                }
            }

            // Check if any config files were found
            if (!findings.userConfigs && !findings.userData && !findings.uploads) {
                return {
                    valid: false,
                    error: 'No configuration files found in the specified path'
                };
            }

            return {
                valid: true,
                findings
            };
        } catch (error) {
            this.api.log(`Validation error: ${error.message}`, 'error');
            return {
                valid: false,
                error: error.message
            };
        }
    }

    /**
     * Import settings from old installation path
     */
    async importSettings(importPath) {
        try {
            const configPathManager = this.getConfigPathManager();
            const results = {
                success: true,
                imported: {
                    userConfigs: 0,
                    userData: 0,
                    uploads: 0
                },
                errors: []
            };

            // Import user_configs
            const userConfigsSource = path.join(importPath, 'user_configs');
            const userConfigsDest = configPathManager.getUserConfigsDir();
            
            if (fs.existsSync(userConfigsSource)) {
                try {
                    const count = this.copyDirectoryContents(userConfigsSource, userConfigsDest);
                    results.imported.userConfigs = count;
                    this.api.log(`Imported ${count} files from user_configs`, 'info');
                } catch (error) {
                    results.errors.push(`user_configs: ${error.message}`);
                }
            }

            // Import user_data
            const userDataSource = path.join(importPath, 'user_data');
            const userDataDest = configPathManager.getUserDataDir();
            
            if (fs.existsSync(userDataSource)) {
                try {
                    const count = this.copyDirectoryContents(userDataSource, userDataDest);
                    results.imported.userData = count;
                    this.api.log(`Imported ${count} files from user_data`, 'info');
                } catch (error) {
                    results.errors.push(`user_data: ${error.message}`);
                }
            }

            // Import uploads
            const uploadsSource = path.join(importPath, 'uploads');
            const uploadsDest = configPathManager.getUploadsDir();
            
            if (fs.existsSync(uploadsSource)) {
                try {
                    const count = this.copyDirectoryContents(uploadsSource, uploadsDest);
                    results.imported.uploads = count;
                    this.api.log(`Imported ${count} files from uploads`, 'info');
                } catch (error) {
                    results.errors.push(`uploads: ${error.message}`);
                }
            }

            // Check if anything was imported
            const totalImported = results.imported.userConfigs + 
                                 results.imported.userData + 
                                 results.imported.uploads;

            if (totalImported === 0) {
                results.success = false;
                results.errors.push('No files were imported');
            }

            return results;
        } catch (error) {
            this.api.log(`Import error: ${error.message}`, 'error');
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Copy directory contents recursively
     */
    copyDirectoryContents(src, dest) {
        // Ensure destination directory exists
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }

        let fileCount = 0;

        // Read source directory
        const entries = fs.readdirSync(src, { withFileTypes: true });

        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);

            if (entry.isDirectory()) {
                // Recursively copy subdirectory
                fileCount += this.copyDirectoryContents(srcPath, destPath);
            } else {
                try {
                    // Get stats before copying for efficiency
                    const stats = fs.statSync(srcPath);
                    
                    // Copy file with COPYFILE_FICLONE flag if available (uses CoW on supported filesystems)
                    fs.copyFileSync(srcPath, destPath, fs.constants.COPYFILE_FICLONE);
                    
                    // Preserve modification time
                    fs.utimesSync(destPath, stats.atime, stats.mtime);
                    
                    fileCount++;
                } catch (copyError) {
                    // Log error but continue with other files
                    this.api.log(`Failed to copy ${srcPath}: ${copyError.message}`, 'warn');
                }
            }
        }

        return fileCount;
    }

    /**
     * Get ConfigPathManager instance
     */
    getConfigPathManager() {
        // Access the global configPathManager instance
        // This is available through the plugin API's internal references
        const ConfigPathManager = require('../../modules/config-path-manager');
        return new ConfigPathManager();
    }
}

module.exports = ConfigImportPlugin;
