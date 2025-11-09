/**
 * Launcher - Platform-agnostisches Launcher-Modul
 * Prüft Node.js, npm, Dependencies und Updates vor Server-Start
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const TTYLogger = require('./tty-logger');

class Launcher {
    constructor() {
        this.log = new TTYLogger();
        this.projectRoot = path.join(__dirname, '..');
        this.minNodeVersion = 18;
        this.maxNodeVersion = 23;
    }

    /**
     * Haupt-Launch-Routine
     */
    async launch() {
        try {
            this.log.clear();
            this.log.header('TikTok Stream Tool - Launcher');

            // 1. Node.js prüfen
            this.log.step(1, 5, 'Prüfe Node.js Installation...');
            await this.checkNode();
            this.log.newLine();

            // 2. npm prüfen
            this.log.step(2, 5, 'Prüfe npm Installation...');
            await this.checkNpm();
            this.log.newLine();

            // 3. Dependencies prüfen
            this.log.step(3, 5, 'Prüfe Dependencies...');
            await this.checkDependencies();
            this.log.newLine();

            // 4. Update-Check (optional)
            this.log.step(4, 5, 'Prüfe auf Updates...');
            await this.checkUpdates();
            this.log.newLine();

            // 5. Server starten
            this.log.step(5, 5, 'Starte Server...');
            await this.startServer();

        } catch (error) {
            this.log.error(`Launcher-Fehler: ${error.message}`);
            this.log.newLine();
            this.log.warn('Drücke eine Taste zum Beenden...');

            // Warte auf Benutzer-Input
            await this.waitForKey();
            process.exit(1);
        }
    }

    /**
     * Prüft Node.js Installation und Version
     */
    async checkNode() {
        // Prüfe ob Node verfügbar ist (sollte immer true sein, da wir in Node laufen)
        const nodeVersion = process.version; // z.B. "v20.10.0"
        this.log.success(`Node.js gefunden: ${nodeVersion}`);

        // Parse Version
        const versionMatch = nodeVersion.match(/^v?(\d+)\.(\d+)\.(\d+)/);
        if (!versionMatch) {
            throw new Error(`Ungültige Node.js Version: ${nodeVersion}`);
        }

        const major = parseInt(versionMatch[1]);
        const minor = parseInt(versionMatch[2]);
        const patch = parseInt(versionMatch[3]);

        // Validiere Version
        if (major < this.minNodeVersion) {
            this.log.error(`Node.js Version ${nodeVersion} ist zu alt!`);
            this.log.info(`Erforderlich: Node.js ${this.minNodeVersion}.x bis ${this.maxNodeVersion}.x`);
            this.log.info('Bitte update Node.js von https://nodejs.org');
            throw new Error(`Node.js Version zu alt: ${nodeVersion}`);
        }

        if (major > this.maxNodeVersion) {
            this.log.warn(`Node.js Version ${nodeVersion} ist sehr neu!`);
            this.log.warn(`Empfohlen: Node.js ${this.minNodeVersion}.x bis ${this.maxNodeVersion}.x`);
            this.log.warn('Das Tool könnte instabil sein.');
            this.log.newLine();
        }

        this.log.keyValue('Node Version', `${major}.${minor}.${patch}`, 'green');
        this.log.keyValue('Plattform', process.platform);
        this.log.keyValue('Architektur', process.arch);
    }

    /**
     * Prüft npm Installation und Version
     */
    async checkNpm() {
        try {
            const npmVersion = execSync('npm -v', {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe']
            }).trim();

            this.log.success(`npm gefunden: v${npmVersion}`);
            this.log.keyValue('npm Version', npmVersion, 'green');
        } catch (error) {
            this.log.error('npm ist nicht installiert oder nicht verfügbar!');
            this.log.info('npm sollte normalerweise mit Node.js installiert sein.');
            this.log.info('Bitte reinstalliere Node.js von https://nodejs.org');
            throw new Error('npm nicht gefunden');
        }
    }

    /**
     * Prüft und installiert Dependencies
     */
    async checkDependencies() {
        const nodeModulesPath = path.join(this.projectRoot, 'node_modules');
        const packageLockPath = path.join(this.projectRoot, 'package-lock.json');

        // Prüfe ob node_modules existiert
        if (!fs.existsSync(nodeModulesPath)) {
            this.log.warn('Dependencies nicht gefunden. Installiere...');
            this.log.newLine();

            await this.installDependencies();

            this.log.newLine();
            this.log.success('Dependencies erfolgreich installiert!');
        } else {
            // Prüfe ob package-lock.json neuer ist als node_modules
            const nodeModulesStat = fs.statSync(nodeModulesPath);
            const packageLockStat = fs.existsSync(packageLockPath)
                ? fs.statSync(packageLockPath)
                : null;

            if (packageLockStat && packageLockStat.mtimeMs > nodeModulesStat.mtimeMs) {
                this.log.warn('package-lock.json wurde aktualisiert. Reinstalliere Dependencies...');
                this.log.newLine();

                await this.installDependencies();

                this.log.newLine();
                this.log.success('Dependencies aktualisiert!');
            } else {
                this.log.success('Dependencies bereits installiert');
            }
        }
    }

    /**
     * Installiert Dependencies
     */
    async installDependencies() {
        const packageLockPath = path.join(this.projectRoot, 'package-lock.json');
        const useCI = fs.existsSync(packageLockPath);

        const command = useCI ? 'npm ci' : 'npm install';
        this.log.info(`Führe "${command}" aus...`);

        try {
            // Spinner starten (nur bei TTY)
            const spinner = this.log.spinner('Installiere Dependencies...');

            execSync(command, {
                cwd: this.projectRoot,
                stdio: ['pipe', 'pipe', 'pipe'],
                encoding: 'utf8'
            });

            spinner.stop();
            this.log.success('Installation erfolgreich!');
        } catch (error) {
            this.log.error('Installation fehlgeschlagen!');
            this.log.error(`Fehler: ${error.message}`);
            this.log.newLine();
            this.log.info(`Versuche es manuell mit: ${command}`);
            throw new Error('Dependency-Installation fehlgeschlagen');
        }
    }

    /**
     * Prüft auf Updates (nutzt Update-Manager falls vorhanden)
     */
    async checkUpdates() {
        try {
            // Versuche Update-Manager zu laden
            const UpdateManager = require('./update-manager');
            const updateManager = new UpdateManager(this.log);

            const updateInfo = await updateManager.checkForUpdates();

            if (updateInfo.available) {
                this.log.warn(`Neue Version verfügbar: ${updateInfo.latestVersion} (aktuell: ${updateInfo.currentVersion})`);
                this.log.info('Öffne das Dashboard um das Update zu installieren.');
                this.log.info(`Oder führe manuell aus: ${updateInfo.updateCommand || 'git pull && npm install'}`);
            } else {
                this.log.success(`Bereits auf dem neuesten Stand: ${updateInfo.currentVersion}`);
            }
        } catch (error) {
            // Update-Manager nicht verfügbar oder Fehler
            this.log.warn('Update-Check übersprungen (Update-Manager nicht verfügbar)');
            this.log.debug(`Grund: ${error.message}`);
        }
    }

    /**
     * Startet den Server
     */
    async startServer() {
        this.log.newLine();
        this.log.header(`${this.log.symbols.rocket} TikTok Stream Tool läuft!`);

        this.log.box('Wichtige URLs', [
            `Dashboard: http://localhost:3000/dashboard.html`,
            `Overlay:   http://localhost:3000/overlay.html`,
            '',
            `${this.log.symbols.warning} WICHTIG: Öffne das Overlay und klicke '${this.log.symbols.success} Audio aktivieren'!`
        ]);

        this.log.newLine();
        this.log.info('Zum Beenden: Strg+C drücken');
        this.log.separator();
        this.log.newLine();

        // Browser öffnen (nach 2 Sekunden)
        setTimeout(() => {
            this.openBrowser('http://localhost:3000/dashboard.html');
        }, 2000);

        // Server starten (blockierend)
        const serverPath = path.join(this.projectRoot, 'server.js');

        try {
            // Server als Child Process starten
            const { spawn } = require('child_process');

            const serverProcess = spawn('node', [serverPath], {
                cwd: this.projectRoot,
                stdio: 'inherit' // Output direkt an Console
            });

            // Cleanup bei Exit
            process.on('SIGINT', () => {
                this.log.newLine();
                this.log.separator();
                this.log.info('Server wird beendet...');
                serverProcess.kill('SIGINT');
                process.exit(0);
            });

            process.on('SIGTERM', () => {
                serverProcess.kill('SIGTERM');
                process.exit(0);
            });

            // Warte auf Server-Exit
            serverProcess.on('exit', (code) => {
                this.log.newLine();
                this.log.separator();
                this.log.info(`Server wurde beendet (Exit Code: ${code || 0})`);
                this.log.separator();
                process.exit(code || 0);
            });

        } catch (error) {
            this.log.error(`Server konnte nicht gestartet werden: ${error.message}`);
            throw error;
        }
    }

    /**
     * Öffnet Browser (platform-spezifisch)
     */
    openBrowser(url) {
        try {
            const platform = process.platform;
            let command;

            if (platform === 'win32') {
                command = `start ${url}`;
            } else if (platform === 'darwin') {
                command = `open "${url}"`;
            } else {
                command = `xdg-open "${url}"`;
            }

            execSync(command, {
                stdio: 'ignore',
                windowsHide: true
            });

            this.log.info(`Browser geöffnet: ${url}`);
        } catch (error) {
            // Ignoriere Fehler (Browser könnte nicht verfügbar sein)
            this.log.debug(`Browser konnte nicht geöffnet werden: ${error.message}`);
        }
    }

    /**
     * Wartet auf Tastendruck (für Error-Handling)
     */
    async waitForKey() {
        return new Promise((resolve) => {
            if (process.stdin.isTTY) {
                process.stdin.setRawMode(true);
                process.stdin.resume();
                process.stdin.once('data', () => {
                    process.stdin.setRawMode(false);
                    process.stdin.pause();
                    resolve();
                });
            } else {
                // Non-TTY: Warte 5 Sekunden
                setTimeout(resolve, 5000);
            }
        });
    }
}

module.exports = Launcher;
