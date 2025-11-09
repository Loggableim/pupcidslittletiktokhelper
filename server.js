const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

// Import Core Modules
const Database = require('./modules/database');
const TikTokConnector = require('./modules/tiktok');
const TTSEngine = require('./modules/tts');
const AlertManager = require('./modules/alerts');
const FlowEngine = require('./modules/flows');
const SoundboardManager = require('./modules/soundboard');
const { GoalManager } = require('./modules/goals');
const UserProfileManager = require('./modules/user-profiles');
const VDONinjaManager = require('./modules/vdoninja'); // PATCH: VDO.Ninja Integration

// Import New Modules
const logger = require('./modules/logger');
const { apiLimiter, authLimiter, uploadLimiter } = require('./modules/rate-limiter');
const OBSWebSocket = require('./modules/obs-websocket');
const i18n = require('./modules/i18n');
const SubscriptionTiers = require('./modules/subscription-tiers');
const Leaderboard = require('./modules/leaderboard');
const { setupSwagger } = require('./modules/swagger-config');
const PluginLoader = require('./modules/plugin-loader');
const { setupPluginRoutes } = require('./routes/plugin-routes');
const UpdateManager = require('./modules/update-manager');

// ========== EXPRESS APP ==========
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Middleware
app.use(express.json());

// CORS-Header für OBS-Kompatibilität
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Entferne X-Frame-Options für OBS Docks und Overlays
    const obsRoutes = ['/overlay.html', '/obs-dock.html', '/obs-dock-controls.html', '/obs-dock-goals.html', '/goal/', '/leaderboard-overlay.html', '/minigames-overlay.html'];
    const isOBSRoute = obsRoutes.some(route => req.path.includes(route));

    if (!isOBSRoute) {
        res.header('X-Frame-Options', 'SAMEORIGIN');
    }

    // CSP für OBS Browser Sources
    if (isOBSRoute) {
        res.header('Content-Security-Policy', "default-src 'self' 'unsafe-inline' 'unsafe-eval' ws: wss: http: https: data: blob:; frame-ancestors 'self' *;");
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

// Emoji Rain Upload Configuration
const emojiRainUploadDir = path.join(__dirname, 'public', 'uploads', 'emoji-rain');
if (!fs.existsSync(emojiRainUploadDir)) {
    fs.mkdirSync(emojiRainUploadDir, { recursive: true });
}

const emojiRainStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, emojiRainUploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'emoji-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const emojiRainUpload = multer({
    storage: emojiRainStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /png|jpg|jpeg|gif|webp|svg/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files (PNG, JPG, GIF, WebP, SVG) are allowed!'));
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
const flows = new FlowEngine(db, alerts, null, logger); // TTS wird später via Plugin injiziert
const soundboard = new SoundboardManager(db, io, logger);
const goals = new GoalManager(db, io, logger);

// New Modules
const obs = new OBSWebSocket(db, io, logger);
const subscriptionTiers = new SubscriptionTiers(db, io, logger);
const leaderboard = new Leaderboard(db, io, logger);

// Plugin-System initialisieren
const pluginsDir = path.join(__dirname, 'plugins');
const pluginLoader = new PluginLoader(pluginsDir, app, io, db, logger);
logger.info('🔌 Plugin Loader initialized');

// Plugin-System initialisieren
const pluginsDir = path.join(__dirname, 'plugins');
const pluginLoader = new PluginLoader(pluginsDir, app, io, db, logger);
logger.info('🔌 Plugin Loader initialized');

// Update-Manager initialisieren
const updateManager = new UpdateManager(logger);
logger.info('🔄 Update Manager initialized');

logger.info('✅ All core modules initialized');
logger.info('✅ All modules initialized');

// ========== SWAGGER DOCUMENTATION ==========
setupSwagger(app);
logger.info('📚 Swagger API Documentation available at /api-docs');

// ========== PLUGIN ROUTES ==========
setupPluginRoutes(app, pluginLoader, apiLimiter, uploadLimiter, logger);

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
 * POST /api/update/download - Lädt das Update herunter (git pull)
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

// ========== HELPER FUNCTIONS ==========

function generateGoalOverlay(key, config, state) {
    const style = config.style;

    return `<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${config.name} Goal</title>
    <script src="/socket.io/socket.io.js"></script>
    ${style.font_url ? `<link rel="stylesheet" href="${style.font_url}">` : ''}
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: transparent;
            overflow: hidden;
            font-family: ${style.font_family};
        }
        .wrap {
            width: ${style.width_pct}%;
            margin: 0 auto;
            padding: 16px;
        }
        .panel {
            position: relative;
            padding: 16px;
            border-radius: ${style.round_px}px;
            ${style.bg_mode === 'gradient'
                ? `background: linear-gradient(${style.bg_angle}deg, ${style.bg_color}, ${style.bg_color2});`
                : `background: ${style.bg_color};`
            }
            ${style.border_enabled ? `border: ${style.border_width}px solid ${style.border_color};` : ''}
            ${style.shadow_enabled ? `box-shadow: ${style.shadow_css};` : ''}
        }
        .bar {
            position: relative;
            height: ${style.bar_height_px}px;
            background: ${style.bar_bg};
            border-radius: ${style.round_px}px;
            overflow: hidden;
        }
        .fill {
            position: absolute;
            left: 0;
            top: 0;
            height: 100%;
            width: 0%;
            border-radius: ${style.round_px}px;
            transition: width ${style.anim_duration_ms}ms ease;
            ${style.fill_mode === 'solid' ? `background: ${style.fill_color1};` : ''}
            ${style.fill_mode === 'gradient' ? `background: linear-gradient(${style.fill_angle}deg, ${style.fill_color1}, ${style.fill_color2});` : ''}
        }
        .fill.stripes {
            background: ${style.fill_color1};
            background-image: linear-gradient(45deg, rgba(255,255,255,${style.stripes_alpha}) 25%, transparent 25%, transparent 50%, rgba(255,255,255,${style.stripes_alpha}) 50%, rgba(255,255,255,${style.stripes_alpha}) 75%, transparent 75%, transparent);
            background-size: 30px 30px;
            animation: move ${style.stripes_speed_s}s linear infinite;
        }
        @keyframes move {
            to { background-position: 60px 0; }
        }
        .label {
            margin-top: 8px;
            font-size: ${style.text_size_px}px;
            color: ${style.text_color};
            letter-spacing: ${style.letter_spacing_px}px;
            text-align: ${style.label_align};
            ${style.uppercase ? 'text-transform: uppercase;' : ''}
            font-weight: 800;
        }
        .inside {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: ${style.text_size_px}px;
            color: ${style.text_color};
            letter-spacing: ${style.letter_spacing_px}px;
            ${style.uppercase ? 'text-transform: uppercase;' : ''}
            font-weight: 800;
            pointer-events: none;
        }
        .pulse {
            animation: pulse 0.9s ease-out 1;
        }
        @keyframes pulse {
            0% { box-shadow: 0 0 0 0 rgba(255,255,255,0.8); }
            100% { box-shadow: 0 0 0 24px rgba(255,255,255,0); }
        }
        .hidden { display: none !important; }
    </style>
</head>
<body>
    <div class="wrap" id="wrap" style="${!state.show ? 'display:none;' : ''}">
        <div class="panel">
            <div class="bar" id="bar">
                <div class="fill ${style.fill_mode === 'stripes' ? 'stripes' : ''}" id="fill"></div>
                ${style.label_pos === 'inside' ? '<div class="inside" id="label"></div>' : ''}
            </div>
            ${style.label_pos === 'below' ? '<div class="label" id="label"></div>' : ''}
        </div>
    </div>

    <script>
        const socket = io();
        const key = '${key}';
        let total = ${state.total};
        let goal = ${state.goal};
        let show = ${state.show ? 'true' : 'false'};

        // Join goal room
        socket.emit('goal:join', key);

        // Listen for updates
        socket.on('goal:update', (data) => {
            total = data.total;
            goal = data.goal;
            show = data.show;
            render();
        });

        socket.on('goal:style', (data) => {
            // Reload page for style changes
            location.reload();
        });

        socket.on('goal:reached', (data) => {
            ${style.pulse_on_full ? `document.getElementById('bar').classList.add('pulse');
            setTimeout(() => document.getElementById('bar').classList.remove('pulse'), 900);` : ''}
            ${style.confetti_on_goal ? `console.log('🎉 Confetti!');` : ''}
        });

        function formatLabel(t, g, pc) {
            let tpl = ${JSON.stringify(style.label_template)};
            const parts = {
                total: ${style.show_total_num} ? t.toLocaleString() : '',
                goal: ${style.show_goal_num} ? g.toLocaleString() : '',
                percent: ${style.show_percent} ? pc : ''
            };
            let out = tpl
                .replace('{total}', parts.total)
                .replace('{goal}', parts.goal)
                .replace('{percent}', parts.percent);
            ${style.prefix_text ? `out = ${JSON.stringify(style.prefix_text)} + ' ' + out;` : ''}
            ${style.suffix_text ? `out = out + ' ' + ${JSON.stringify(style.suffix_text)};` : ''}
            return out.trim();
        }

        function render() {
            const wrap = document.getElementById('wrap');
            const fill = document.getElementById('fill');
            const label = document.getElementById('label');

            // Show/hide
            wrap.style.display = show ? 'block' : 'none';

            // Calculate percent
            const pct = goal > 0 ? Math.max(0, Math.min(100, (total / goal) * 100)) : 0;

            // Update fill
            fill.style.width = pct + '%';

            // Update label
            const text = formatLabel(total, goal, Math.round(pct));
            label.textContent = text;
        }

        // Initial render
        render();
    </script>
</body>
</html>`;
}

// ========== ROUTES ==========

// Haupt-Seite
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Goal Overlay Routes
app.get('/goal/:key', (req, res) => {
    const { key } = req.params;

    if (!goals.state[key]) {
        return res.status(404).send('Goal not found');
    }

    const config = goals.getGoalConfig(key);
    const state = goals.state[key];

    const html = generateGoalOverlay(key, config, state);
    res.send(html);
});

// ========== TIKTOK CONNECTION ROUTES ==========

app.post('/api/connect', authLimiter, async (req, res) => {
    const { username } = req.body;

    if (!username) {
        logger.warn('Connection attempt without username');
        return res.status(400).json({ success: false, error: 'Username is required' });
    }

    try {
        await tiktok.connect(username);
        logger.info(`✅ Connected to TikTok user: ${username}`);
        res.json({ success: true });
    } catch (error) {
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

// ========== VOICE MAPPING ROUTES ==========
// Moved to TTS Plugin (plugins/tts)

// ========== SETTINGS ROUTES ==========

app.get('/api/settings', apiLimiter, (req, res) => {
    const settings = db.getAllSettings();
    res.json(settings);
});

app.post('/api/settings', apiLimiter, (req, res) => {
    const settings = req.body;

    try {
        Object.entries(settings).forEach(([key, value]) => {
            db.setSetting(key, value);
        });
        logger.info('⚙️ Settings updated');
        res.json({ success: true });
    } catch (error) {
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
    const { username } = req.body;

    if (!username) {
        return res.status(400).json({ success: false, error: 'Username is required' });
    }

    try {
        const profile = profileManager.createProfile(username);
        logger.info(`👤 Created new profile: ${username}`);
        res.json({ success: true, profile });
    } catch (error) {
        logger.error('Error creating profile:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Profil löschen
app.delete('/api/profiles/:username', apiLimiter, (req, res) => {
    const { username } = req.params;

    try {
        profileManager.deleteProfile(username);
        logger.info(`🗑️ Deleted profile: ${username}`);
        res.json({ success: true });
    } catch (error) {
        logger.error('Error deleting profile:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Profil wechseln (erfordert Server-Neustart)
app.post('/api/profiles/switch', apiLimiter, (req, res) => {
    const { username } = req.body;

    if (!username) {
        return res.status(400).json({ success: false, error: 'Username is required' });
    }

    try {
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

// ========== TTS ROUTES ==========
// Moved to TTS Plugin (plugins/tts)

// ========== SOUNDBOARD ROUTES ==========

app.get('/api/soundboard/gifts', apiLimiter, (req, res) => {
    try {
        const gifts = soundboard.getAllGiftSounds();
        res.json(gifts);
    } catch (error) {
        logger.error('Error getting gift sounds:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/soundboard/gifts', apiLimiter, (req, res) => {
    const { giftId, label, mp3Url, volume, animationUrl, animationType } = req.body;

    if (!giftId || !label || !mp3Url) {
        return res.status(400).json({ success: false, error: 'giftId, label and mp3Url are required' });
    }

    try {
        const id = soundboard.setGiftSound(
            giftId,
            label,
            mp3Url,
            volume || 1.0,
            animationUrl || null,
            animationType || 'none'
        );
        logger.info(`🎵 Gift sound set: ${label} (ID: ${giftId})`);
        res.json({ success: true, id });
    } catch (error) {
        logger.error('Error setting gift sound:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/soundboard/gifts/:giftId', apiLimiter, (req, res) => {
    try {
        soundboard.deleteGiftSound(req.params.giftId);
        logger.info(`🗑️ Deleted gift sound: ${req.params.giftId}`);
        res.json({ success: true });
    } catch (error) {
        logger.error('Error deleting gift sound:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/soundboard/test', apiLimiter, async (req, res) => {
    const { url, volume } = req.body;

    if (!url) {
        return res.status(400).json({ success: false, error: 'url is required' });
    }

    try {
        await soundboard.testSound(url, volume || 1.0);
        logger.info(`🔊 Testing sound: ${url}`);
        res.json({ success: true });
    } catch (error) {
        logger.error('Error testing sound:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/soundboard/queue', apiLimiter, (req, res) => {
    try {
        const status = soundboard.getQueueStatus();
        res.json(status);
    } catch (error) {
        logger.error('Error getting queue status:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/soundboard/queue/clear', apiLimiter, (req, res) => {
    try {
        soundboard.clearQueue();
        logger.info('🧹 Soundboard queue cleared');
        res.json({ success: true });
    } catch (error) {
        logger.error('Error clearing queue:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/myinstants/search', apiLimiter, async (req, res) => {
    const { query, page, limit } = req.query;

    if (!query) {
        return res.status(400).json({ success: false, error: 'query is required' });
    }

    try {
        const results = await soundboard.searchMyInstants(query, page || 1, limit || 20);
        res.json({ success: true, results });
    } catch (error) {
        logger.error('Error searching MyInstants:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/myinstants/trending', apiLimiter, async (req, res) => {
    const { limit } = req.query;

    try {
        const results = await soundboard.getTrendingSounds(limit || 20);
        res.json({ success: true, results });
    } catch (error) {
        logger.error('Error getting trending sounds:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/myinstants/random', apiLimiter, async (req, res) => {
    const { limit } = req.query;

    try {
        const results = await soundboard.getRandomSounds(limit || 20);
        res.json({ success: true, results });
    } catch (error) {
        logger.error('Error getting random sounds:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/myinstants/resolve', apiLimiter, async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ success: false, error: 'url is required' });
    }

    // Wenn es bereits eine direkte MP3-URL ist, direkt zurückgeben
    if (url.match(/\.mp3($|\?)/i)) {
        return res.json({ success: true, mp3: url });
    }

    try {
        const mp3Url = await soundboard.resolveMyInstantsUrl(url);
        return res.json({ success: true, mp3: mp3Url });
    } catch (error) {
        logger.error('Error resolving MyInstants URL:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

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

app.get('/api/emoji-rain/config', apiLimiter, (req, res) => {
    try {
        const config = db.getEmojiRainConfig();
        res.json({ success: true, config });
    } catch (error) {
        logger.error('Error getting emoji rain config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/emoji-rain/config', apiLimiter, (req, res) => {
    const { config, enabled } = req.body;

    if (!config) {
        return res.status(400).json({ success: false, error: 'config is required' });
    }

    try {
        db.updateEmojiRainConfig(config, enabled !== undefined ? enabled : null);
        logger.info('🌧️ Emoji rain configuration updated');

        // Notify overlays about config change
        io.emit('emoji-rain:config-update', { config, enabled });

        res.json({ success: true, message: 'Emoji rain configuration updated' });
    } catch (error) {
        logger.error('Error updating emoji rain config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/emoji-rain/toggle', apiLimiter, (req, res) => {
    const { enabled } = req.body;

    if (enabled === undefined) {
        return res.status(400).json({ success: false, error: 'enabled is required' });
    }

    try {
        db.toggleEmojiRain(enabled);
        logger.info(`🌧️ Emoji rain ${enabled ? 'enabled' : 'disabled'}`);

        // Notify overlays about toggle
        io.emit('emoji-rain:toggle', { enabled });

        res.json({ success: true, message: `Emoji rain ${enabled ? 'enabled' : 'disabled'}` });
    } catch (error) {
        logger.error('Error toggling emoji rain:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/emoji-rain/test', apiLimiter, (req, res) => {
    const { count, emoji, x, y } = req.body;

    try {
        const config = db.getEmojiRainConfig();

        if (!config.enabled) {
            return res.status(400).json({ success: false, error: 'Emoji rain is disabled' });
        }

        // Create test spawn data
        const testData = {
            count: parseInt(count) || 1,
            emoji: emoji || config.emoji_set[Math.floor(Math.random() * config.emoji_set.length)],
            x: parseFloat(x) || Math.random(),
            y: parseFloat(y) || 0,
            username: 'Test User',
            reason: 'test'
        };

        logger.info(`🧪 Testing emoji rain: ${testData.count}x ${testData.emoji}`);

        // Emit to overlay
        io.emit('emoji-rain:spawn', testData);

        res.json({ success: true, message: 'Test emojis spawned', data: testData });
    } catch (error) {
        logger.error('Error testing emoji rain:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Upload custom emoji rain image
app.post('/api/emoji-rain/upload', uploadLimiter, emojiRainUpload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        const fileUrl = `/uploads/emoji-rain/${req.file.filename}`;
        logger.info(`📤 Emoji rain image uploaded: ${req.file.filename}`);

        res.json({
            success: true,
            message: 'Image uploaded successfully',
            url: fileUrl,
            filename: req.file.filename,
            size: req.file.size
        });
    } catch (error) {
        logger.error('Error uploading emoji rain image:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get list of uploaded emoji rain images
app.get('/api/emoji-rain/images', apiLimiter, (req, res) => {
    try {
        const files = fs.readdirSync(emojiRainUploadDir).map(filename => ({
            filename,
            url: `/uploads/emoji-rain/${filename}`,
            size: fs.statSync(path.join(emojiRainUploadDir, filename)).size,
            created: fs.statSync(path.join(emojiRainUploadDir, filename)).birthtime
        }));

        res.json({ success: true, images: files });
    } catch (error) {
        logger.error('Error listing emoji rain images:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete uploaded emoji rain image
app.delete('/api/emoji-rain/images/:filename', apiLimiter, (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(emojiRainUploadDir, filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, error: 'File not found' });
        }

        fs.unlinkSync(filePath);
        logger.info(`🗑️ Deleted emoji rain image: ${filename}`);

        res.json({ success: true, message: 'Image deleted successfully' });
    } catch (error) {
        logger.error('Error deleting emoji rain image:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

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

    // test:tts is now handled by TTS Plugin

    // VDO.Ninja Socket.IO Events are now handled by VDO.Ninja Plugin



    // Minigame events from client
    socket.on('minigame:request', async (data) => {
        logger.debug(`🎮 Minigame request: ${data.type} from ${data.username}`);
        // Handle minigame requests if needed
    });
});

// ========== EMOJI RAIN HELPER ==========

/**
 * Spawn emojis for emoji rain effect
 * @param {string} reason - Event type (gift, like, follow, etc.)
 * @param {object} data - Event data
 * @param {number} count - Number of emojis to spawn
 * @param {string} emoji - Optional specific emoji
 */
function spawnEmojiRain(reason, data, count, emoji = null) {
    try {
        const config = db.getEmojiRainConfig();

        if (!config.enabled) {
            return;
        }

        // Calculate count based on reason if not provided
        if (!count) {
            if (reason === 'gift' && data.coins) {
                count = config.gift_base_emojis + Math.floor(data.coins * config.gift_coin_multiplier);
                count = Math.min(config.gift_max_emojis, count);
            } else if (reason === 'like' && data.likeCount) {
                count = Math.floor(data.likeCount / config.like_count_divisor);
                count = Math.max(config.like_min_emojis, Math.min(config.like_max_emojis, count));
            } else {
                count = 3; // Default for follow, share, subscribe
            }
        }

        // Select random emoji from config if not specified
        if (!emoji && config.emoji_set && config.emoji_set.length > 0) {
            emoji = config.emoji_set[Math.floor(Math.random() * config.emoji_set.length)];
        }

        // Random horizontal position
        const x = Math.random();
        const y = 0;

        // Emit to overlay
        io.emit('emoji-rain:spawn', {
            count: count,
            emoji: emoji,
            x: x,
            y: y,
            username: data.username || 'Unknown',
            reason: reason
        });

        logger.debug(`🌧️ Emoji rain spawned: ${count}x ${emoji} for ${reason}`);
    } catch (error) {
        logger.error('Error spawning emoji rain:', error);
    }
}

// ========== TIKTOK EVENT-HANDLER ==========

// Gift Event
tiktok.on('gift', async (data) => {
    // Alert anzeigen (wenn konfiguriert)
    const minCoins = parseInt(db.getSetting('alert_gift_min_coins')) || 100;
    if (data.coins >= minCoins) {
        alerts.addAlert('gift', data);
    }

    // Soundboard: Gift-Sound abspielen
    const soundboardEnabled = db.getSetting('soundboard_enabled') === 'true';
    if (soundboardEnabled) {
        await soundboard.playGiftSound(data);
    }

    // Goals: Coins erhöhen (Event-Data enthält bereits korrekte Coins-Berechnung)
    // Der TikTok-Connector berechnet: diamondCount * 2 * repeatCount
    // und zählt nur bei Streak-Ende (bei streakable Gifts)
    await goals.incrementGoal('coins', data.coins || 0);

    // Leaderboard: Update user stats
    await leaderboard.trackGift(data.username, data.giftName, data.coins);

    // Emoji Rain: Spawn emojis based on gift value
    spawnEmojiRain('gift', data);

    // Flows verarbeiten
    await flows.processEvent('gift', data);
});

// Follow Event
tiktok.on('follow', async (data) => {
    alerts.addAlert('follow', data);

    // Soundboard: Follow-Sound abspielen
    const soundboardEnabled = db.getSetting('soundboard_enabled') === 'true';
    if (soundboardEnabled) {
        await soundboard.playFollowSound();
    }

    // Goals: Follower erhöhen
    await goals.incrementGoal('followers', 1);

    // Leaderboard: Track follow
    await leaderboard.trackFollow(data.username);

    // Emoji Rain: Spawn emojis for follow
    spawnEmojiRain('follow', data, 5, '💙');

    await flows.processEvent('follow', data);
});

// Subscribe Event
tiktok.on('subscribe', async (data) => {
    alerts.addAlert('subscribe', data);

    // Soundboard: Subscribe-Sound abspielen
    const soundboardEnabled = db.getSetting('soundboard_enabled') === 'true';
    if (soundboardEnabled) {
        await soundboard.playSubscribeSound();
    }

    // Goals: Subscriber erhöhen
    await goals.incrementGoal('subs', 1);

    // Subscription Tiers: Process subscription
    await subscriptionTiers.processSubscription(data);

    // Leaderboard: Track subscription
    await leaderboard.trackSubscription(data.username);

    // Emoji Rain: Spawn emojis for subscribe
    spawnEmojiRain('subscribe', data, 8, '⭐');

    await flows.processEvent('subscribe', data);
});

// Share Event
tiktok.on('share', async (data) => {
    alerts.addAlert('share', data);

    // Soundboard: Share-Sound abspielen
    const soundboardEnabled = db.getSetting('soundboard_enabled') === 'true';
    if (soundboardEnabled) {
        await soundboard.playShareSound();
    }

    // Leaderboard: Track share
    await leaderboard.trackShare(data.username);

    // Emoji Rain: Spawn emojis for share
    spawnEmojiRain('share', data, 5, '🔄');

    await flows.processEvent('share', data);
});

// Chat Event
tiktok.on('chat', async (data) => {
    // TTS für Chat ist jetzt im TTS-Plugin (plugins/tts)

    // Leaderboard: Track chat message
    await leaderboard.trackChat(data.username);

    // Flows verarbeiten
    await flows.processEvent('chat', data);
});

// Like Event
tiktok.on('like', async (data) => {
    // Soundboard: Like-Threshold prüfen
    const soundboardEnabled = db.getSetting('soundboard_enabled') === 'true';
    if (soundboardEnabled) {
        await soundboard.handleLikeEvent(data.likeCount || 1);
    }

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

    // Emoji Rain: Spawn emojis for likes
    spawnEmojiRain('like', data);

    // Flows verarbeiten
    // Likes normalerweise nicht als Alert (zu viele)
    // Aber Flows könnten darauf reagieren
    await flows.processEvent('like', data);
});

// ========== SERVER STARTEN ==========

const PORT = process.env.PORT || 3000;

server.listen(PORT, async () => {
    logger.info('\n' + '='.repeat(50));
    logger.info('🎥 TikTok Stream Tool');
    logger.info('='.repeat(50));
    logger.info(`\n✅ Server running on http://localhost:${PORT}`);
    logger.info(`\n📊 Dashboard:     http://localhost:${PORT}/dashboard.html`);
    logger.info(`🎵 Soundboard:    http://localhost:${PORT}/soundboard.html`);
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

    // Plugins laden
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
        } else {
            logger.info('ℹ️  No plugins found in /plugins directory');
        }
    } catch (error) {
        logger.error(`⚠️  Error loading plugins: ${error.message}`);
    }

    // Auto-Update-Check starten (alle 24 Stunden)
    updateChecker.startAutoCheck(24);

    // Browser automatisch öffnen (async)
    try {
        const open = (await import('open')).default;
        await open(`http://localhost:${PORT}/dashboard.html`);
    } catch (error) {
        logger.info('ℹ️  Browser konnte nicht automatisch geöffnet werden.');
        logger.info(`   Öffne manuell: http://localhost:${PORT}/dashboard.html\n`);
    }
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

module.exports = { app, server, io, db, tiktok, alerts, flows, soundboard, goals, obs, leaderboard, subscriptionTiers };
