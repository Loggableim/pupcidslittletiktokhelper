const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * UpdateChecker - Prüft auf neue Versionen des Haupttools über GitHub
 */
class UpdateChecker {
    constructor(logger) {
        this.logger = logger;
        this.githubRepo = 'Loggableim/pupcidslittletiktokhelper';
        this.currentVersion = this.getCurrentVersion();
        this.checkInterval = null;
    }

    /**
     * Liest die aktuelle Version aus package.json
     */
    getCurrentVersion() {
        try {
            const packagePath = path.join(__dirname, '..', 'package.json');
            const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
            return packageData.version || '0.0.0';
        } catch (error) {
            this.logger.warn(`Could not read current version: ${error.message}`);
            return '0.0.0';
        }
    }

    /**
     * Prüft auf neue Versionen via GitHub API
     */
    async checkForUpdates() {
        try {
            const url = `https://api.github.com/repos/${this.githubRepo}/releases/latest`;

            this.logger.info('🔍 Checking for updates...');

            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'PupCids-TikTok-Helper',
                    'Accept': 'application/vnd.github.v3+json'
                },
                timeout: 10000
            });

            const release = response.data;

            const latestVersion = release.tag_name.replace(/^v/, ''); // Remove 'v' prefix if present
            const isNewVersion = this.compareVersions(latestVersion, this.currentVersion) > 0;

            const updateInfo = {
                available: isNewVersion,
                currentVersion: this.currentVersion,
                latestVersion: latestVersion,
                releaseUrl: release.html_url,
                releaseName: release.name,
                releaseNotes: release.body,
                publishedAt: release.published_at,
                downloadUrl: release.zipball_url, // GitHub Archive ZIP
                tarballUrl: release.tarball_url   // GitHub Archive TAR
            };

            if (isNewVersion) {
                this.logger.info(`✨ New version available: ${latestVersion} (current: ${this.currentVersion})`);
            } else {
                this.logger.info(`✅ You are running the latest version: ${this.currentVersion}`);
            }

            return {
                success: true,
                ...updateInfo
            };
        } catch (error) {
            // Detaillierter Error-Log nur bei echten Fehlern (nicht 404)
            if (error.response && error.response.status === 404) {
                // 404 = Repository not found oder keine Releases
                this.logger.info(`No releases found for repository ${this.githubRepo}`);
                return {
                    success: false,
                    error: 'No releases available yet',
                    currentVersion: this.currentVersion,
                    available: false
                };
            }

            this.logger.warn(`Failed to check for updates: ${error.message}`);

            if (error.response) {
                this.logger.warn(`GitHub API Error: ${error.response.status} - ${error.response.statusText}`);
            }

            return {
                success: false,
                error: error.message,
                currentVersion: this.currentVersion,
                available: false
            };
        }
    }

    /**
     * Vergleicht zwei Semantic-Versioning-Strings
     * @returns {number} 1 if v1 > v2, -1 if v1 < v2, 0 if equal
     */
    compareVersions(v1, v2) {
        const parts1 = v1.split('.').map(Number);
        const parts2 = v2.split('.').map(Number);

        for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
            const part1 = parts1[i] || 0;
            const part2 = parts2[i] || 0;

            if (part1 > part2) return 1;
            if (part1 < part2) return -1;
        }

        return 0;
    }

    /**
     * Startet automatische Update-Prüfung (alle 24 Stunden)
     */
    startAutoCheck(intervalHours = 24) {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }

        const intervalMs = intervalHours * 60 * 60 * 1000;

        // Initial check
        this.checkForUpdates();

        // Periodisch prüfen
        this.checkInterval = setInterval(() => {
            this.checkForUpdates();
        }, intervalMs);

        this.logger.info(`🔄 Auto-update check started (every ${intervalHours}h)`);
    }

    /**
     * Stoppt automatische Update-Prüfung
     */
    stopAutoCheck() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
            this.logger.info('🛑 Auto-update check stopped');
        }
    }

    /**
     * Lädt ein Update herunter (git pull)
     * HINWEIS: Dies funktioniert nur, wenn das Projekt als Git-Repository geklont wurde
     */
    async downloadUpdate() {
        try {
            this.logger.info('📥 Downloading update via git pull...');

            // Prüfe ob Git verfügbar ist
            try {
                await execAsync('git --version');
            } catch (error) {
                return {
                    success: false,
                    error: 'Git ist nicht installiert oder nicht verfügbar'
                };
            }

            // Prüfe ob es ein Git-Repository ist
            const projectRoot = path.join(__dirname, '..');
            const gitDir = path.join(projectRoot, '.git');

            if (!fs.existsSync(gitDir)) {
                return {
                    success: false,
                    error: 'Das Projekt ist kein Git-Repository. Bitte manuell von GitHub herunterladen.'
                };
            }

            // Git pull ausführen
            const { stdout, stderr } = await execAsync('git pull', { cwd: projectRoot });

            this.logger.info('Git pull output:', stdout);
            if (stderr) {
                this.logger.warn('Git pull stderr:', stderr);
            }

            // Prüfe ob npm install nötig ist
            if (stdout.includes('package.json') || stdout.includes('package-lock.json')) {
                this.logger.info('📦 Dependencies changed, running npm install...');
                const { stdout: npmOut, stderr: npmErr } = await execAsync('npm install', { cwd: projectRoot });

                this.logger.info('npm install output:', npmOut);
                if (npmErr) {
                    this.logger.warn('npm install stderr:', npmErr);
                }
            }

            return {
                success: true,
                message: 'Update erfolgreich heruntergeladen. Bitte Server neu starten.',
                output: stdout,
                needsRestart: true
            };
        } catch (error) {
            this.logger.error(`Failed to download update: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Anleitung für manuelles Update
     */
    getManualUpdateInstructions() {
        return {
            method: 'git',
            steps: [
                '1. Stoppe den Server (Ctrl+C)',
                '2. Führe "git pull" im Projektverzeichnis aus',
                '3. Falls package.json geändert wurde: "npm install"',
                '4. Starte den Server neu mit "npm start"'
            ],
            alternative: {
                method: 'download',
                steps: [
                    '1. Lade die neueste Version von GitHub herunter',
                    `2. https://github.com/${this.githubRepo}/releases/latest`,
                    '3. Entpacke das Archiv',
                    '4. Kopiere deine "user_data" und "user_configs" Ordner',
                    '5. Führe "npm install" aus',
                    '6. Starte den Server mit "npm start"'
                ]
            }
        };
    }
}

module.exports = UpdateChecker;
