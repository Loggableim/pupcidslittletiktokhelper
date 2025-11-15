// Load environment variables first
require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');

// Import Core Modules
const Database = require('./modules/database');
const TikTokConnector = require('./modules/tiktok');
const AlertManager = require('./modules/alerts');
const FlowEngine = require('./modules/flows');
const { GoalManager } = require('./modules/goals');
const UserProfileManager = require('./modules/user-profiles');
const VDONinjaManager = require('./modules/vdoninja'); // PATCH: VDO.Ninja Integration

// Import New Modules
const logger = require('./modules/logger');
const { apiLimiter, authLimiter, uploadLimiter } = require('./modules/rate-limiter');
// OBS WebSocket will be integrated later
// const OBSWebSocket = require('./modules/obs-websocket');
const i18n = require('./modules/i18n');
const SubscriptionTiers = require('./modules/subscription-tiers');
const Leaderboard = require('./modules/leaderboard');
const { setupSwagger } = require('./modules/swagger-config');
const PluginLoader = require('./modules/plugin-loader');
const { setupPluginRoutes } = require('./routes/plugin-routes');
const UpdateManager = require('./modules/update-manager');
const { Validators, ValidationError } = require('./modules/validators');
const getAutoStartManager = require('./modules/auto-start');
const PresetManager = require('./modules/preset-manager');

// ========== EXPRESS APP ==========
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Middleware
app.use(express.json());

// CORS-Header mit Whitelist
const ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:8080',
    'http://127.0.0.1:8080',
    'null'
];

app.use((req, res, next) => {
    const origin = req.headers.origin;

    // Whitelist-basiertes CORS
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Access-Control-Allow-Credentials', 'true');
    } else if (!origin) {
        // Requests ohne Origin (z.B. Server-to-Server)
        res.header('Access-Control-Allow-Origin', 'null');
    }

    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Generiere CSP Nonce für jeden Request
    const nonce = crypto.randomBytes(16).toString('base64');
    res.locals.cspNonce = nonce;

    // No overlay routes anymore (OBS integration will be added later)
    const isOverlayRoute = false;

    // Dashboard and plugin UIs need relaxed CSP for inline scripts
    const isDashboard = req.path === '/' || req.path.includes('/dashboard.html');
    const isPluginUI = req.path.includes('/goals/ui') || req.path.includes('/goals/overlay') ||
                       req.path.includes('/emoji-rain/ui') || req.path.includes('/gift-milestone/ui') ||
                       req.path.includes('/plugins/') ||
                       req.path.includes('/openshock/');

    if (isDashboard || isPluginUI) {
        res.header('X-Frame-Options', 'SAMEORIGIN');
        // Dashboard & Plugin UI CSP: Allow inline scripts for functionality
        res.header('Content-Security-Policy',
            `default-src 'self'; ` +
            `script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com; ` +
            `script-src-attr 'unsafe-inline'; ` +
            `style-src 'self' 'unsafe-inline'; ` +
            `img-src 'self' data: blob: https:; ` +
            `font-src 'self' data:; ` +
            `connect-src 'self' ws: wss:; ` +
            `media-src 'self' blob: data: https:; ` +
            `object-src 'none'; ` +
            `base-uri 'self'; ` +
            `form-action 'self'; ` +
            `frame-ancestors 'self';`
        );
    } else {
        res.header('X-Frame-Options', 'SAMEORIGIN');
        // Strict CSP for other routes
        res.header('Content-Security-Policy',
            `default-src 'self'; ` +
            `script-src 'self'; ` +
            `style-src 'self' 'unsafe-inline'; ` +
            `img-src 'self' data: blob: https:; ` +
            `font-src 'self' data:; ` +
            `connect-src 'self' ws: wss:; ` +
            `media-src 'self' blob: data: https:; ` +
            `object-src 'none'; ` +
            `base-uri 'self'; ` +
            `form-action 'self'; ` +
            `frame-ancestors 'self';`
        );
    }

    next();
});

app.use(express.static('public'));

// i18n Middleware
app.use(i18n.init);

// ========== MULTER CONFIGURATION FOR FILE UPLOADS ==========
const uploadDir = path.join(__dirname, 'uploads', 'animations');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'animation-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /webm|gif|mp4|png|jpg|jpeg/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only video and image files are allowed!'));
        }
    }
});


// ========== USER PROFILE INITIALISIEREN ==========
const profileManager = new UserProfileManager();

logger.info('🔧 Initializing User Profile Manager...');

// Startup-Logik für User-Profile
let activeProfile = profileManager.getActiveProfile();
const oldDbPath = path.join(__dirname, 'database.db');

// Falls kein aktives Profil existiert
if (!activeProfile) {
    // Prüfe, ob eine alte database.db existiert (Migration)
    if (fs.existsSync(oldDbPath)) {
        logger.info('📦 Alte database.db gefunden - Migration wird durchgeführt...');
        const defaultUsername = 'default';
        profileManager.migrateOldDatabase(defaultUsername);
        profileManager.setActiveProfile(defaultUsername);
        activeProfile = defaultUsername;

        // Alte Datenbank umbenennen als Backup
        const backupPath = path.join(__dirname, 'database.db.backup');
        fs.renameSync(oldDbPath, backupPath);

        // WAL und SHM Dateien auch umbenennen
        const walPath = `${oldDbPath}-wal`;
        const shmPath = `${oldDbPath}-shm`;
        if (fs.existsSync(walPath)) {
            fs.renameSync(walPath, `${backupPath}-wal`);
        }
        if (fs.existsSync(shmPath)) {
            fs.renameSync(shmPath, `${backupPath}-shm`);
        }

        logger.info(`✅ Migration abgeschlossen - Profil "${defaultUsername}" erstellt`);
        logger.info(`   Alte Datenbank als Backup gespeichert: ${backupPath}`);
    } else {
        // Erstelle ein neues Default-Profil
        const defaultUsername = 'default';
        logger.info(`📝 Erstelle neues Profil: ${defaultUsername}`);
        profileManager.createProfile(defaultUsername);
        profileManager.setActiveProfile(defaultUsername);
        activeProfile = defaultUsername;
    }
}

logger.info(`👤 Aktives User-Profil: ${activeProfile}`);

// ========== DATABASE INITIALISIEREN ==========
const dbPath = profileManager.getProfilePath(activeProfile);
const db = new Database(dbPath);
logger.info(`✅ Database initialized: ${dbPath}`);

// ========== MODULE INITIALISIEREN ==========
const tiktok = new TikTokConnector(io, db, logger);
const alerts = new AlertManager(io, db, logger);
const flows = new FlowEngine(db, alerts, logger);
const goals = new GoalManager(db, io, logger);

// New Modules
// OBS WebSocket will be integrated later
// const obs = new OBSWebSocket(db, io, logger);
const subscriptionTiers = new SubscriptionTiers(db, io, logger);
const leaderboard = new Leaderboard(db, io, logger);

// Plugin-System initialisieren
const pluginsDir = path.join(__dirname, 'plugins');
const pluginLoader = new PluginLoader(pluginsDir, app, io, db, logger);
logger.info('🔌 Plugin Loader initialized');

// PluginLoader an AlertManager übergeben (um doppelte Sounds zu vermeiden)
alerts.setPluginLoader(pluginLoader);

// Update-Manager initialisieren
const updateManager = new UpdateManager(logger);
logger.info('🔄 Update Manager initialized');

// Auto-Start Manager initialisieren
const autoStartManager = getAutoStartManager();
logger.info('🚀 Auto-Start Manager initialized');

// Preset-Manager initialisieren
const presetManager = new PresetManager(db.db);
logger.info('📦 Preset Manager initialized');

logger.info('✅ All modules initialized');

// ========== SWAGGER DOCUMENTATION ==========
setupSwagger(app);
logger.info('📚 Swagger API Documentation available at /api-docs');

// ========== PLUGIN ROUTES ==========
setupPluginRoutes(app, pluginLoader, apiLimiter, uploadLimiter, logger);

// ========== PLUGIN STATIC FILES ==========
// Serve static files from plugin directories
app.use('/plugins', express.static(path.join(__dirname, 'plugins')));
logger.info('📂 Plugin static files served from /plugins/*');

// ========== UPDATE ROUTES ==========

/**
 * GET /api/update/check - Prüft auf neue Versionen
 */
app.get('/api/update/check', apiLimiter, async (req, res) => {
    try {
        const updateInfo = await updateManager.checkForUpdates();
        res.json(updateInfo);
    } catch (error) {
        logger.error(`Update check failed: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/update/current - Gibt die aktuelle Version zurück
 */
app.get('/api/update/current', apiLimiter, (req, res) => {
    res.json({
        success: true,
        version: updateManager.currentVersion
    });
});

/**
 * POST /api/update/download - Führt Update durch (Git Pull oder ZIP Download)
 */
app.post('/api/update/download', authLimiter, async (req, res) => {
    try {
        const result = await updateManager.performUpdate();
        res.json(result);
    } catch (error) {
        logger.error(`Update download failed: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/update/instructions - Gibt Anleitung für manuelles Update
 */
app.get('/api/update/instructions', apiLimiter, (req, res) => {
    // Manual update instructions
    const instructions = {
        method: updateManager.isGitRepo ? 'git' : 'download',
        steps: updateManager.isGitRepo
            ? [
                '1. Stoppe den Server (Ctrl+C)',
                '2. Führe "git pull" im Projektverzeichnis aus',
                '3. Falls package.json geändert wurde: "npm install"',
                '4. Starte den Server neu mit "npm start" oder "node launch.js"'
              ]
            : [
                '1. Lade die neueste Version von GitHub herunter',
                `2. https://github.com/${updateManager.githubRepo}/releases/latest`,
                '3. Entpacke das Archiv',
                '4. Kopiere deine "user_data" und "user_configs" Ordner',
                '5. Führe "npm install" aus',
                '6. Starte den Server mit "npm start" oder "node launch.js"'
              ]
    };

    res.json({
        success: true,
        instructions
    });
});

// ========== AUTO-START ROUTES ==========

/**
 * GET /api/autostart/status - Gibt Auto-Start Status zurück
 */
app.get('/api/autostart/status', apiLimiter, async (req, res) => {
    try {
        const status = await autoStartManager.getStatus();
        res.json({
            success: true,
            ...status
        });
    } catch (error) {
        logger.error(`Auto-start status check failed: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/autostart/toggle - Aktiviert/Deaktiviert Auto-Start
 */
app.post('/api/autostart/toggle', authLimiter, async (req, res) => {
    try {
        const { enabled, hidden } = req.body;

        // Validate input
        if (typeof enabled !== 'boolean') {
            return res.status(400).json({
                success: false,
                error: 'enabled must be a boolean'
            });
        }

        const result = await autoStartManager.toggle(enabled, hidden || false);

        if (result) {
            logger.info(`Auto-start ${enabled ? 'enabled' : 'disabled'} (hidden: ${hidden})`);
            res.json({
                success: true,
                enabled,
                hidden: hidden || false
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Failed to toggle auto-start'
            });
        }
    } catch (error) {
        logger.error(`Auto-start toggle failed: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/autostart/platform - Gibt Plattform-Informationen zurück
 */
app.get('/api/autostart/platform', apiLimiter, (req, res) => {
    try {
        const platformInfo = autoStartManager.getPlatformInfo();
        res.json({
            success: true,
            ...platformInfo,
            supported: autoStartManager.isSupported()
        });
    } catch (error) {
        logger.error(`Platform info failed: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ========== PRESET ROUTES ==========

/**
 * POST /api/presets/export - Exportiert aktuelle Konfiguration
 */
app.post('/api/presets/export', authLimiter, async (req, res) => {
    try {
        const options = {
            name: req.body.name || 'My Preset',
            description: req.body.description || '',
            author: req.body.author || 'Unknown',
            includeSettings: req.body.includeSettings !== false,
            includeFlows: req.body.includeFlows !== false,
            includeAlerts: req.body.includeAlerts !== false,
            includeGiftSounds: req.body.includeGiftSounds !== false,
            includeVoiceMappings: req.body.includeVoiceMappings !== false,
            includePluginConfigs: req.body.includePluginConfigs !== false,
        };

        const preset = await presetManager.exportPreset(options);

        logger.info(`Preset exported: ${preset.metadata.name}`);
        res.json({
            success: true,
            preset
        });
    } catch (error) {
        logger.error(`Preset export failed: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/presets/import - Importiert eine Konfiguration
 */
app.post('/api/presets/import', authLimiter, async (req, res) => {
    try {
        const { preset, options } = req.body;

        if (!preset) {
            return res.status(400).json({
                success: false,
                error: 'No preset data provided'
            });
        }

        const importOptions = {
            overwrite: options?.overwrite || false,
            createBackup: options?.createBackup !== false,
            includeSettings: options?.includeSettings !== false,
            includeFlows: options?.includeFlows !== false,
            includeAlerts: options?.includeAlerts !== false,
            includeGiftSounds: options?.includeGiftSounds !== false,
            includeVoiceMappings: options?.includeVoiceMappings !== false,
            includePluginConfigs: options?.includePluginConfigs !== false,
        };

        const result = await presetManager.importPreset(preset, importOptions);

        logger.info(`Preset imported: ${preset.metadata?.name || 'Unknown'}`, {
            imported: result.imported,
            errors: result.errors
        });

        res.json({
            success: result.success,
            imported: result.imported,
            errors: result.errors
        });
    } catch (error) {
        logger.error(`Preset import failed: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ========== HELPER FUNCTIONS ==========
// (OBS overlay generation will be added later)

// ========== ROUTES ==========

// Haupt-Seite
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// ========== TIKTOK CONNECTION ROUTES ==========

app.post('/api/connect', authLimiter, async (req, res) => {
    try {
        const username = Validators.string(req.body.username, {
            required: true,
            minLength: 1,
            maxLength: 100,
            pattern: /^[a-zA-Z0-9._-]+$/,
            fieldName: 'username'
        });

        await tiktok.connect(username);
        logger.info(`✅ Connected to TikTok user: ${username}`);
        res.json({ success: true });
    } catch (error) {
        if (error instanceof ValidationError) {
            logger.warn(`Invalid connection attempt: ${error.message}`);
            return res.status(400).json({ success: false, error: error.message });
        }
        logger.error('Connection error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/disconnect', authLimiter, (req, res) => {
    tiktok.disconnect();
    logger.info('🔌 Disconnected from TikTok');
    res.json({ success: true });
});

app.get('/api/status', apiLimiter, (req, res) => {
    res.json({
        isConnected: tiktok.isActive(),
        username: tiktok.currentUsername,
        stats: tiktok.getStats()
    });
});

// ========== PLUGIN ROUTES ==========
// Plugin routes are set up in routes/plugin-routes.js (setupPluginRoutes)

// ========== SETTINGS ROUTES ==========

app.get('/api/settings', apiLimiter, (req, res) => {
    const settings = db.getAllSettings();
    res.json(settings);
});

app.post('/api/settings', apiLimiter, (req, res) => {
    try {
        const settings = Validators.object(req.body, {
            required: true,
            fieldName: 'settings'
        });

        // Validate settings object is not too large
        const keys = Object.keys(settings);
        if (keys.length > 200) {
            throw new ValidationError('Too many settings (max 200)', 'settings');
        }

        // Validate each key and value
        Object.entries(settings).forEach(([key, value]) => {
            // Validate key format
            const validKey = Validators.string(key, {
                required: true,
                maxLength: 100,
                pattern: /^[a-zA-Z0-9._-]+$/,
                fieldName: 'setting key'
            });

            // Validate value is not too large (prevent memory issues)
            if (typeof value === 'string' && value.length > 50000) {
                throw new ValidationError(`Setting ${validKey} value too large (max 50000 chars)`, validKey);
            }

            db.setSetting(validKey, value);
        });

        logger.info('⚙️ Settings updated');
        res.json({ success: true });
    } catch (error) {
        if (error instanceof ValidationError) {
            logger.warn(`Invalid settings update: ${error.message}`);
            return res.status(400).json({ success: false, error: error.message });
        }
        logger.error('Error saving settings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== USER PROFILE ROUTES ==========

// Liste aller verfügbaren Profile
app.get('/api/profiles', apiLimiter, (req, res) => {
    try {
        const profiles = profileManager.listProfiles();
        const activeProfile = profileManager.getActiveProfile();

        res.json({
            profiles: profiles.map(p => ({
                username: p.username,
                created: p.created,
                modified: p.modified,
                size: p.size,
                isActive: p.username === activeProfile
            })),
            activeProfile
        });
    } catch (error) {
        logger.error('Error listing profiles:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Aktuelles aktives Profil
app.get('/api/profiles/active', apiLimiter, (req, res) => {
    try {
        const activeProfile = profileManager.getActiveProfile();
        res.json({ activeProfile });
    } catch (error) {
        logger.error('Error getting active profile:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Neues Profil erstellen
app.post('/api/profiles', apiLimiter, (req, res) => {
    try {
        const username = Validators.string(req.body.username, {
            required: true,
            minLength: 1,
            maxLength: 50,
            pattern: /^[a-zA-Z0-9_-]+$/,
            fieldName: 'username'
        });

        const profile = profileManager.createProfile(username);
        logger.info(`👤 Created new profile: ${username}`);
        res.json({ success: true, profile });
    } catch (error) {
        if (error instanceof ValidationError) {
            logger.warn(`Invalid profile creation: ${error.message}`);
            return res.status(400).json({ success: false, error: error.message });
        }
        logger.error('Error creating profile:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Profil löschen
app.delete('/api/profiles/:username', apiLimiter, (req, res) => {
    try {
        const username = Validators.string(req.params.username, {
            required: true,
            minLength: 1,
            maxLength: 50,
            pattern: /^[a-zA-Z0-9_-]+$/,
            fieldName: 'username'
        });

        profileManager.deleteProfile(username);
        logger.info(`🗑️ Deleted profile: ${username}`);
        res.json({ success: true });
    } catch (error) {
        if (error instanceof ValidationError) {
            logger.warn(`Invalid profile deletion: ${error.message}`);
            return res.status(400).json({ success: false, error: error.message });
        }
        logger.error('Error deleting profile:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Profil wechseln (erfordert Server-Neustart)
app.post('/api/profiles/switch', apiLimiter, (req, res) => {
    try {
        const username = Validators.string(req.body.username, {
            required: true,
            minLength: 1,
            maxLength: 50,
            pattern: /^[a-zA-Z0-9_-]+$/,
            fieldName: 'username'
        });

        if (!profileManager.profileExists(username)) {
            return res.status(404).json({ success: false, error: 'Profile not found' });
        }

        profileManager.setActiveProfile(username);
        logger.info(`🔄 Switched to profile: ${username} (restart required)`);

        res.json({
            success: true,
            message: 'Profile switched. Please restart the application.',
            requiresRestart: true
        });
    } catch (error) {
        if (error instanceof ValidationError) {
            logger.warn(`Invalid profile switch: ${error.message}`);
            return res.status(400).json({ success: false, error: error.message });
        }
        logger.error('Error switching profile:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Profil-Backup erstellen
app.post('/api/profiles/:username/backup', apiLimiter, (req, res) => {
    const { username } = req.params;

    try {
        const backup = profileManager.backupProfile(username);
        logger.info(`💾 Created backup for profile: ${username}`);
        res.json({ success: true, backup });
    } catch (error) {
        logger.error('Error creating backup:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== HUD CONFIGURATION ROUTES ==========

app.get('/api/hud-config', apiLimiter, (req, res) => {
    try {
        const elements = db.getAllHudElements();
        const resolution = db.getSetting('hud_resolution') || '1920x1080';
        const orientation = db.getSetting('hud_orientation') || 'landscape';

        res.json({
            success: true,
            elements,
            resolution,
            orientation
        });
    } catch (error) {
        logger.error('Error getting HUD config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/hud-config', apiLimiter, (req, res) => {
    const { elements, resolution, orientation } = req.body;

    try {
        // Update resolution and orientation if provided
        if (resolution) {
            db.setSetting('hud_resolution', resolution);
        }
        if (orientation) {
            db.setSetting('hud_orientation', orientation);
        }

        // Update each element's configuration
        if (elements && Array.isArray(elements)) {
            elements.forEach(element => {
                db.setHudElement(element.element_id, {
                    enabled: element.enabled,
                    position_x: element.position_x,
                    position_y: element.position_y,
                    position_unit: element.position_unit || 'px',
                    anchor: element.anchor || 'top-left'
                });
            });
        }

        logger.info('🖼️ HUD configuration updated');
        res.json({ success: true });
    } catch (error) {
        logger.error('Error saving HUD config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/hud-config/element/:elementId', apiLimiter, (req, res) => {
    const { elementId } = req.params;
    const config = req.body;

    try {
        db.setHudElement(elementId, config);
        res.json({ success: true });
    } catch (error) {
        logger.error('Error updating HUD element:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/hud-config/element/:elementId/toggle', apiLimiter, (req, res) => {
    const { elementId } = req.params;
    const { enabled } = req.body;

    try {
        db.toggleHudElement(elementId, enabled);
        res.json({ success: true });
    } catch (error) {
        logger.error('Error toggling HUD element:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== FLOWS ROUTES ==========

app.get('/api/flows', apiLimiter, (req, res) => {
    const flows = db.getFlows();
    res.json(flows);
});

app.get('/api/flows/:id', apiLimiter, (req, res) => {
    const flow = db.getFlow(req.params.id);
    if (!flow) {
        return res.status(404).json({ success: false, error: 'Flow not found' });
    }
    res.json(flow);
});

app.post('/api/flows', apiLimiter, (req, res) => {
    const flow = req.body;

    if (!flow.name || !flow.trigger_type || !flow.actions) {
        return res.status(400).json({
            success: false,
            error: 'Name, trigger_type and actions are required'
        });
    }

    try {
        const id = db.createFlow(flow);
        logger.info(`➕ Created flow: ${flow.name}`);
        res.json({ success: true, id });
    } catch (error) {
        logger.error('Error creating flow:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/flows/:id', apiLimiter, (req, res) => {
    const flow = req.body;

    try {
        db.updateFlow(req.params.id, flow);
        logger.info(`✏️ Updated flow: ${req.params.id}`);
        res.json({ success: true });
    } catch (error) {
        logger.error('Error updating flow:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/flows/:id', apiLimiter, (req, res) => {
    try {
        db.deleteFlow(req.params.id);
        logger.info(`🗑️ Deleted flow: ${req.params.id}`);
        res.json({ success: true });
    } catch (error) {
        logger.error('Error deleting flow:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/flows/:id/toggle', apiLimiter, (req, res) => {
    const { enabled } = req.body;

    try {
        db.toggleFlow(req.params.id, enabled);
        logger.info(`🔄 Toggled flow ${req.params.id}: ${enabled}`);
        res.json({ success: true });
    } catch (error) {
        logger.error('Error toggling flow:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/flows/:id/test', apiLimiter, async (req, res) => {
    const testData = req.body;

    try {
        await flows.testFlow(req.params.id, testData);
        logger.info(`🧪 Tested flow: ${req.params.id}`);
        res.json({ success: true });
    } catch (error) {
        logger.error('Error testing flow:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== ALERT ROUTES ==========

app.get('/api/alerts', apiLimiter, (req, res) => {
    const alertConfigs = db.getAllAlertConfigs();
    res.json(alertConfigs);
});

app.post('/api/alerts/:eventType', apiLimiter, (req, res) => {
    const { eventType } = req.params;
    const config = req.body;

    try {
        db.setAlertConfig(eventType, config);
        logger.info(`🔔 Alert config updated: ${eventType}`);
        res.json({ success: true });
    } catch (error) {
        logger.error('Error setting alert config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/alerts/test', apiLimiter, (req, res) => {
    const { type, data } = req.body;

    try {
        alerts.testAlert(type, data);
        logger.info(`🧪 Testing alert: ${type}`);
        res.json({ success: true });
    } catch (error) {
        logger.error('Error testing alert:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== SOUNDBOARD ROUTES ==========
// Moved to Soundboard Plugin (plugins/soundboard)

// ========== GIFT CATALOG ROUTES ==========

app.get('/api/gift-catalog', apiLimiter, (req, res) => {
    try {
        const catalog = db.getGiftCatalog();
        const lastUpdate = db.getCatalogLastUpdate();
        res.json({ success: true, catalog, lastUpdate, count: catalog.length });
    } catch (error) {
        logger.error('Error getting gift catalog:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/gift-catalog/update', apiLimiter, async (req, res) => {
    try {
        const result = await tiktok.updateGiftCatalog();
        logger.info('🎁 Gift catalog updated');
        res.json({ success: true, ...result });
    } catch (error) {
        logger.error('Error updating gift catalog:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== GOALS ROUTES ==========
// DISABLED: Old goals routes - now using Goals Plugin instead
// The Goals Plugin (plugins/goals/) provides a complete replacement with:
// - Coin, Likes, Follower, and Custom goal types
// - Event API integration
// - Real-time overlays
// - Advanced progression modes
//
// All /api/goals/* routes are now handled by the plugin

/* COMMENTED OUT - OLD GOALS SYSTEM
// Get all goals
app.get('/api/goals', apiLimiter, (req, res) => {
    try {
        const status = goals.getStatus();
        res.json({ success: true, goals: status });
    } catch (error) {
        logger.error('Error getting goals:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get single goal
app.get('/api/goals/:key', apiLimiter, (req, res) => {
    try {
        const { key } = req.params;
        const config = goals.getGoalConfig(key);
        const state = goals.state[key];

        if (!config || !state) {
            return res.status(404).json({ success: false, error: 'Goal not found' });
        }

        res.json({
            success: true,
            goal: {
                ...config,
                ...state,
                percent: Math.round(goals.getPercent(key) * 100)
            }
        });
    } catch (error) {
        logger.error('Error getting goal:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update goal config
app.post('/api/goals/:key/config', apiLimiter, async (req, res) => {
    try {
        const { key } = req.params;
        const updates = req.body;

        const config = await goals.updateGoalConfig(key, updates);

        if (!config) {
            return res.status(404).json({ success: false, error: 'Goal not found' });
        }

        logger.info(`📊 Goal config updated: ${key}`);
        res.json({ success: true, message: `Goal ${key} updated`, config });
    } catch (error) {
        logger.error('Error updating goal config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update goal style
app.post('/api/goals/:key/style', apiLimiter, async (req, res) => {
    try {
        const { key } = req.params;
        const { style } = req.body;

        const updatedStyle = await goals.updateStyle(key, style);

        if (!updatedStyle) {
            return res.status(404).json({ success: false, error: 'Goal not found' });
        }

        logger.info(`🎨 Goal style updated: ${key}`);
        res.json({ success: true, message: `Style for ${key} updated`, style: updatedStyle });
    } catch (error) {
        logger.error('Error updating style:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Set goal total (manual)
app.post('/api/goals/:key/set', apiLimiter, async (req, res) => {
    try {
        const { key } = req.params;
        const { total } = req.body;

        if (total === undefined) {
            return res.status(400).json({ success: false, error: 'total is required' });
        }

        await goals.setGoal(key, total);
        logger.info(`📊 Goal set: ${key} = ${total}`);

        res.json({ success: true, message: `Goal ${key} set to ${total}` });
    } catch (error) {
        logger.error('Error setting goal:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Increment goal
app.post('/api/goals/:key/increment', apiLimiter, async (req, res) => {
    try {
        const { key } = req.params;
        const { delta } = req.body;

        if (delta === undefined) {
            return res.status(400).json({ success: false, error: 'delta is required' });
        }

        await goals.incrementGoal(key, delta);

        res.json({ success: true, message: `Goal ${key} incremented by ${delta}` });
    } catch (error) {
        logger.error('Error incrementing goal:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Reset goal
app.post('/api/goals/:key/reset', apiLimiter, async (req, res) => {
    try {
        const { key } = req.params;

        await goals.resetGoal(key);
        logger.info(`🔄 Goal reset: ${key}`);

        res.json({ success: true, message: `Goal ${key} reset` });
    } catch (error) {
        logger.error('Error resetting goal:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Reset all goals
app.post('/api/goals/reset', apiLimiter, async (req, res) => {
    try {
        await goals.resetAllGoals();
        logger.info('🔄 All goals reset');

        res.json({ success: true, message: 'All goals reset' });
    } catch (error) {
        logger.error('Error resetting all goals:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});
END OF OLD GOALS ROUTES */

// ========== OBS WEBSOCKET ROUTES ==========

app.get('/api/obs/status', apiLimiter, (req, res) => {
    try {
        const status = obs.getStatus();
        res.json({ success: true, ...status });
    } catch (error) {
        logger.error('Error getting OBS status:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/obs/connect', apiLimiter, async (req, res) => {
    const { host, port, password } = req.body;

    try {
        await obs.connect(host, port, password);
        logger.info(`🎬 Connected to OBS at ${host}:${port}`);
        res.json({ success: true, message: 'Connected to OBS' });
    } catch (error) {
        logger.error('Error connecting to OBS:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/obs/disconnect', apiLimiter, async (req, res) => {
    try {
        await obs.disconnect();
        logger.info('🎬 Disconnected from OBS');
        res.json({ success: true, message: 'Disconnected from OBS' });
    } catch (error) {
        logger.error('Error disconnecting from OBS:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/obs/scene/:sceneName', apiLimiter, async (req, res) => {
    const { sceneName } = req.params;

    try {
        await obs.setScene(sceneName);
        logger.info(`🎬 OBS scene changed to: ${sceneName}`);
        res.json({ success: true, message: `Scene changed to ${sceneName}` });
    } catch (error) {
        logger.error('Error changing OBS scene:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/obs/source/:sourceName/visibility', apiLimiter, async (req, res) => {
    const { sourceName } = req.params;
    const { visible, sceneName } = req.body;

    try {
        await obs.setSourceVisibility(sourceName, visible, sceneName);
        logger.info(`🎬 OBS source ${sourceName} visibility: ${visible}`);
        res.json({ success: true, message: `Source ${sourceName} visibility set to ${visible}` });
    } catch (error) {
        logger.error('Error setting source visibility:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/obs/filter/:sourceName/:filterName/toggle', apiLimiter, async (req, res) => {
    const { sourceName, filterName } = req.params;
    const { enabled } = req.body;

    try {
        await obs.setFilterEnabled(sourceName, filterName, enabled);
        logger.info(`🎬 OBS filter ${filterName} on ${sourceName}: ${enabled}`);
        res.json({ success: true, message: `Filter ${filterName} set to ${enabled}` });
    } catch (error) {
        logger.error('Error toggling filter:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/obs/scenes', apiLimiter, async (req, res) => {
    try {
        const scenes = await obs.getScenes();
        res.json({ success: true, scenes });
    } catch (error) {
        logger.error('Error getting OBS scenes:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/obs/sources', apiLimiter, async (req, res) => {
    const { sceneName } = req.query;

    try {
        const sources = await obs.getSources(sceneName);
        res.json({ success: true, sources });
    } catch (error) {
        logger.error('Error getting OBS sources:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== LEADERBOARD ROUTES ==========

app.get('/api/leaderboard/top/:category', apiLimiter, async (req, res) => {
    const { category } = req.params;
    const { limit } = req.query;

    try {
        const top = await leaderboard.getTop(category, parseInt(limit) || 10);
        res.json({ success: true, category, top });
    } catch (error) {
        logger.error('Error getting leaderboard:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Dedicated routes for overlay compatibility
app.get('/api/leaderboard/gifters', apiLimiter, async (req, res) => {
    const { limit } = req.query;

    try {
        const gifters = await leaderboard.getTop('gifters', parseInt(limit) || 10);
        res.json({ success: true, gifters });
    } catch (error) {
        logger.error('Error getting gifters leaderboard:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/leaderboard/chatters', apiLimiter, async (req, res) => {
    const { limit } = req.query;

    try {
        const chatters = await leaderboard.getTop('chatters', parseInt(limit) || 10);
        res.json({ success: true, chatters });
    } catch (error) {
        logger.error('Error getting chatters leaderboard:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/leaderboard/user/:username', apiLimiter, async (req, res) => {
    const { username } = req.params;

    try {
        const stats = await leaderboard.getUserStats(username);
        res.json({ success: true, username, stats });
    } catch (error) {
        logger.error('Error getting user stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/leaderboard/reset', apiLimiter, async (req, res) => {
    const { category } = req.body;

    try {
        await leaderboard.reset(category);
        logger.info(`📊 Leaderboard reset: ${category || 'all'}`);
        res.json({ success: true, message: `Leaderboard ${category || 'all'} reset` });
    } catch (error) {
        logger.error('Error resetting leaderboard:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/leaderboard/all', apiLimiter, async (req, res) => {
    try {
        const allStats = await leaderboard.getAllStats();
        res.json({ success: true, stats: allStats });
    } catch (error) {
        logger.error('Error getting all leaderboard stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== SUBSCRIPTION TIERS ROUTES ==========

app.get('/api/subscription-tiers', apiLimiter, (req, res) => {
    try {
        const tiers = subscriptionTiers.getAllTiers();
        res.json({ success: true, tiers });
    } catch (error) {
        logger.error('Error getting subscription tiers:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/subscription-tiers', apiLimiter, (req, res) => {
    const { tier, config } = req.body;

    if (!tier || !config) {
        return res.status(400).json({ success: false, error: 'tier and config are required' });
    }

    try {
        subscriptionTiers.setTierConfig(tier, config);
        logger.info(`💎 Subscription tier configured: ${tier}`);
        res.json({ success: true, message: `Tier ${tier} configured` });
    } catch (error) {
        logger.error('Error setting subscription tier:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/subscription-tiers/:tier', apiLimiter, (req, res) => {
    const { tier } = req.params;

    try {
        const config = subscriptionTiers.getTierConfig(tier);
        res.json({ success: true, tier, config });
    } catch (error) {
        logger.error('Error getting subscription tier:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== ANIMATION UPLOAD ROUTES ==========

app.post('/api/animations/upload', uploadLimiter, upload.single('animation'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        const fileUrl = `/uploads/animations/${req.file.filename}`;
        logger.info(`📤 Animation uploaded: ${req.file.filename}`);

        res.json({
            success: true,
            message: 'Animation uploaded successfully',
            url: fileUrl,
            filename: req.file.filename,
            size: req.file.size,
            mimetype: req.file.mimetype
        });
    } catch (error) {
        logger.error('Error uploading animation:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/animations/list', apiLimiter, (req, res) => {
    try {
        const files = fs.readdirSync(uploadDir).map(filename => ({
            filename,
            url: `/uploads/animations/${filename}`,
            size: fs.statSync(path.join(uploadDir, filename)).size,
            created: fs.statSync(path.join(uploadDir, filename)).birthtime
        }));

        res.json({ success: true, animations: files });
    } catch (error) {
        logger.error('Error listing animations:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/animations/:filename', apiLimiter, (req, res) => {
    const { filename } = req.params;
    const filePath = path.join(uploadDir, filename);

    try {
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, error: 'Animation not found' });
        }

        fs.unlinkSync(filePath);
        logger.info(`🗑️ Animation deleted: ${filename}`);
        res.json({ success: true, message: 'Animation deleted' });
    } catch (error) {
        logger.error('Error deleting animation:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ========== EMOJI RAIN ROUTES ==========
// Moved to Emoji Rain Plugin (plugins/emoji-rain)

// ========== MINIGAMES ROUTES ==========

app.post('/api/minigames/roulette', apiLimiter, (req, res) => {
    const { username, bet } = req.body;

    try {
        const result = Math.floor(Math.random() * 37); // 0-36
        const color = result === 0 ? 'green' : (result % 2 === 0 ? 'black' : 'red');
        const win = bet === result.toString() || bet === color;

        logger.info(`🎰 Roulette: ${username} bet on ${bet}, result: ${result} (${color})`);

        io.emit('minigame:roulette', {
            username,
            bet,
            result,
            color,
            win,
            winner: win ? username : null
        });

        res.json({
            success: true,
            game: 'roulette',
            result,
            color,
            win,
            winner: win ? username : null
        });
    } catch (error) {
        logger.error('Error in roulette game:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/minigames/dice', apiLimiter, (req, res) => {
    const { username, sides } = req.body;

    try {
        const sidesCount = parseInt(sides) || 6;
        const result = Math.floor(Math.random() * sidesCount) + 1;

        logger.info(`🎲 Dice: ${username} rolled ${result} (${sidesCount}-sided)`);

        io.emit('minigame:dice', {
            username,
            sides: sidesCount,
            result
        });

        res.json({
            success: true,
            game: 'dice',
            result,
            sides: sidesCount
        });
    } catch (error) {
        logger.error('Error in dice game:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/minigames/coinflip', apiLimiter, (req, res) => {
    const { username, bet } = req.body;

    try {
        const result = Math.random() < 0.5 ? 'heads' : 'tails';
        const win = bet === result;

        logger.info(`🪙 Coinflip: ${username} bet on ${bet}, result: ${result}`);

        io.emit('minigame:coinflip', {
            username,
            bet,
            result,
            win
        });

        res.json({
            success: true,
            game: 'coinflip',
            result,
            win
        });
    } catch (error) {
        logger.error('Error in coinflip game:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== PATCH: VDO.NINJA API ROUTES ==========
// Moved to VDO.Ninja Plugin (plugins/vdoninja)

// ========== SOCKET.IO EVENTS ==========

io.on('connection', (socket) => {
    logger.info(`🔌 Client connected: ${socket.id}`);

    // Plugin Socket Events registrieren
    pluginLoader.registerPluginSocketEvents(socket);

    // Goal Room Join
    socket.on('goal:join', (key) => {
        socket.join(`goal_${key}`);
        logger.debug(`📊 Client joined goal room: goal_${key}`);

        // Send initial state
        const s = goals.state[key];
        const config = goals.getGoalConfig(key);
        if (s && config) {
            socket.emit('goal:update', {
                type: 'goal',
                total: s.total,
                goal: s.goal,
                show: s.show,
                pct: goals.getPercent(key),
                style: config.style
            });
        }
    });

    // Leaderboard Room Join
    socket.on('leaderboard:join', () => {
        socket.join('leaderboard');
        logger.debug('📊 Client joined leaderboard room');
    });

    // Client disconnect
    socket.on('disconnect', () => {
        logger.info(`🔌 Client disconnected: ${socket.id}`);
    });

    // Test Events (für Testing vom Dashboard)
    socket.on('test:alert', (data) => {
        alerts.testAlert(data.type, data.testData);
    });

    // VDO.Ninja Socket.IO Events are now handled by VDO.Ninja Plugin



    // Minigame events from client
    socket.on('minigame:request', async (data) => {
        logger.debug(`🎮 Minigame request: ${data.type} from ${data.username}`);
        // Handle minigame requests if needed
    });
});

// ========== EMOJI RAIN HELPER ==========
// Moved to Emoji Rain Plugin (plugins/emoji-rain)

// ========== TIKTOK EVENT-HANDLER ==========

// Gift Event
tiktok.on('gift', async (data) => {
    // Alert anzeigen (wenn konfiguriert)
    const minCoins = parseInt(db.getSetting('alert_gift_min_coins')) || 100;
    if (data.coins >= minCoins) {
        alerts.addAlert('gift', data);
    }

    // Goals: Coins erhöhen (Event-Data enthält bereits korrekte Coins-Berechnung)
    // Der TikTok-Connector berechnet: diamondCount * 2 * repeatCount
    // und zählt nur bei Streak-Ende (bei streakable Gifts)
    await goals.incrementGoal('coins', data.coins || 0);

    // Leaderboard: Update user stats
    await leaderboard.trackGift(data.username, data.giftName, data.coins);

    // Flows verarbeiten
    await flows.processEvent('gift', data);
});

// Follow Event
tiktok.on('follow', async (data) => {
    alerts.addAlert('follow', data);

    // Goals: Follower erhöhen
    await goals.incrementGoal('followers', 1);

    // Leaderboard: Track follow
    await leaderboard.trackFollow(data.username);

    await flows.processEvent('follow', data);
});

// Subscribe Event
tiktok.on('subscribe', async (data) => {
    alerts.addAlert('subscribe', data);

    // Goals: Subscriber erhöhen
    await goals.incrementGoal('subs', 1);

    // Subscription Tiers: Process subscription
    await subscriptionTiers.processSubscription(data);

    // Leaderboard: Track subscription
    await leaderboard.trackSubscription(data.username);

    await flows.processEvent('subscribe', data);
});

// Share Event
tiktok.on('share', async (data) => {
    alerts.addAlert('share', data);

    // Leaderboard: Track share
    await leaderboard.trackShare(data.username);

    await flows.processEvent('share', data);
});

// Chat Event
tiktok.on('chat', async (data) => {
    // Leaderboard: Track chat message
    await leaderboard.trackChat(data.username);

    // Flows verarbeiten
    await flows.processEvent('chat', data);
});

// Like Event
tiktok.on('like', async (data) => {
    // Goals: Total Likes setzen (Event-Data enthält bereits robustes totalLikes)
    // Der TikTok-Connector extrahiert totalLikes aus verschiedenen Properties
    if (data.totalLikes !== undefined && data.totalLikes !== null) {
        await goals.setGoal('likes', data.totalLikes);
    } else {
        // Sollte nicht mehr vorkommen, da Connector immer totalLikes liefert
        await goals.incrementGoal('likes', data.likeCount || 1);
    }

    // Leaderboard: Track likes
    await leaderboard.trackLike(data.username, data.likeCount || 1);

    // Flows verarbeiten
    // Likes normalerweise nicht als Alert (zu viele)
    // Aber Flows könnten darauf reagieren
    await flows.processEvent('like', data);
});

// ========== SERVER STARTEN ==========

const PORT = process.env.PORT || 3000;

// Async Initialisierung vor Server-Start
(async () => {
    // Plugins laden VOR Server-Start, damit alle Routen verfügbar sind
    logger.info('🔌 Loading plugins...');
    try {
        await pluginLoader.loadAllPlugins();

        // TikTok-Events für Plugins registrieren
        pluginLoader.registerPluginTikTokEvents(tiktok);

        const loadedCount = pluginLoader.plugins.size;
        if (loadedCount > 0) {
            logger.info(`✅ ${loadedCount} plugin(s) loaded successfully`);

            // Plugin-Injektionen in Flows
            const vdoninjaPlugin = pluginLoader.getPluginInstance('vdoninja');
            if (vdoninjaPlugin && vdoninjaPlugin.getManager) {
                flows.vdoninjaManager = vdoninjaPlugin.getManager();
                logger.info('✅ VDO.Ninja Manager injected into Flows');
            }

            // OSC-Bridge Plugin Injektion
            const oscBridgePlugin = pluginLoader.getPluginInstance('osc-bridge');
            if (oscBridgePlugin && oscBridgePlugin.getOSCBridge) {
                flows.oscBridge = oscBridgePlugin.getOSCBridge();
                logger.info('✅ OSC-Bridge injected into Flows');
            }

            // TTS Plugin Injektion
            const ttsPlugin = pluginLoader.getPluginInstance('tts');
            if (ttsPlugin) {
                flows.ttsEngine = ttsPlugin;
                logger.info('✅ TTS injected into Flows');
            }
        } else {
            logger.info('ℹ️  No plugins found in /plugins directory');
        }
    } catch (error) {
        logger.error(`⚠️  Error loading plugins: ${error.message}`);
    }

    // Jetzt Server starten
    server.listen(PORT, async () => {
        logger.info('\n' + '='.repeat(50));
        logger.info('🎥 TikTok Stream Tool');
        logger.info('='.repeat(50));
        logger.info(`\n✅ Server running on http://localhost:${PORT}`);
        logger.info(`\n📊 Dashboard:     http://localhost:${PORT}/dashboard.html`);
        logger.info(`🖼️  Overlay:      http://localhost:${PORT}/overlay.html`);
        logger.info(`📚 API Docs:      http://localhost:${PORT}/api-docs`);
        logger.info('\n' + '='.repeat(50));
        logger.info('\n⚠️  WICHTIG: Öffne das Overlay und klicke auf "🔊 Audio aktivieren"!');
        logger.info('   Browser Autoplay Policy erfordert User-Interaktion.\n');

        // OBS WebSocket auto-connect (if configured)
    const obsConfigStr = db.getSetting('obs_websocket_config');
    if (obsConfigStr) {
        try {
            const obsConfig = JSON.parse(obsConfigStr);
            if (obsConfig.enabled && obsConfig.host && obsConfig.port) {
                logger.info(`🎬 Connecting to OBS at ${obsConfig.host}:${obsConfig.port}...`);
                try {
                    await obs.connect(obsConfig.host, obsConfig.port, obsConfig.password);
                    logger.info('✅ OBS connected successfully');
                } catch (error) {
                    logger.warn('⚠️  Could not connect to OBS:', error.message);
                    logger.info('   You can configure OBS connection in settings');
                }
            }
        } catch (error) {
            logger.warn('⚠️  Failed to parse OBS config:', error.message);
        }
    }

    // Gift-Katalog automatisch beim Start aktualisieren (falls Username konfiguriert)
    const savedUsername = db.getSetting('last_connected_username');
    if (savedUsername) {
        logger.info(`🎁 Aktualisiere Gift-Katalog für @${savedUsername}...`);
        setTimeout(async () => {
            try {
                const result = await tiktok.updateGiftCatalog({
                    preferConnected: true,
                    username: savedUsername
                });
                if (result.ok) {
                    logger.info(`✅ ${result.message}`);
                } else {
                    logger.info(`ℹ️  Gift-Katalog-Update: ${result.message}`);
                }
            } catch (error) {
                logger.warn('⚠️  Gift-Katalog konnte nicht automatisch aktualisiert werden:', error.message);
                logger.info('   Dies ist normal wenn der Stream nicht live ist.');
            }
        }, 3000);
    }

        // Auto-Update-Check starten (alle 24 Stunden)
        updateManager.startAutoCheck(24);

        // Browser automatisch öffnen (async)
        try {
            const open = (await import('open')).default;
            await open(`http://localhost:${PORT}/dashboard.html`);
        } catch (error) {
            logger.info('ℹ️  Browser konnte nicht automatisch geöffnet werden.');
            logger.info(`   Öffne manuell: http://localhost:${PORT}/dashboard.html\n`);
        }
    });
})(); // Schließe async IIFE

// ========== ERROR HANDLING MIDDLEWARE ==========
// Catch-all error handler - ensures JSON responses for API routes
app.use((err, req, res, next) => {
    logger.error('Express Error Handler:', err);

    // Always return JSON for API routes
    if (req.path.startsWith('/api/')) {
        return res.status(err.status || 500).json({
            success: false,
            error: err.message || 'Internal Server Error'
        });
    }

    // For non-API routes, return JSON if Accept header indicates JSON
    if (req.accepts('json') && !req.accepts('html')) {
        return res.status(err.status || 500).json({
            success: false,
            error: err.message || 'Internal Server Error'
        });
    }

    // Default: return generic error page
    res.status(err.status || 500).send('Internal Server Error');
});

// 404 handler - ensures JSON responses for API routes
app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({
            success: false,
            error: 'API endpoint not found'
        });
    }

    if (req.accepts('json') && !req.accepts('html')) {
        return res.status(404).json({
            success: false,
            error: 'Not found'
        });
    }

    res.status(404).send('Page not found');
});

// Graceful Shutdown
process.on('SIGINT', async () => {
    logger.info('\n\n🛑 Shutting down gracefully...');

    // TikTok-Verbindung trennen
    if (tiktok.isActive()) {
        tiktok.disconnect();
    }

    // OBS-Verbindung trennen
    if (obs.isConnected()) {
        await obs.disconnect();
    }

    // Datenbank schließen
    db.close();

    // Server schließen
    server.close(() => {
        logger.info('✅ Server closed');
        process.exit(0);
    });
});

// Error Handling
process.on('uncaughtException', (error) => {
    logger.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = { app, server, io, db, tiktok, alerts, flows, goals, leaderboard, subscriptionTiers };
