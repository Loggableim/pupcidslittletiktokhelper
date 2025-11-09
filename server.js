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

// Import New Modules
const logger = require('./modules/logger');
const rateLimiter = require('./modules/rate-limiter');
const OBSWebSocket = require('./modules/obs-websocket');
const i18n = require('./modules/i18n');
const SubscriptionTiers = require('./modules/subscription-tiers');
const Leaderboard = require('./modules/leaderboard');
const { setupSwagger } = require('./modules/swagger-config');

// ========== EXPRESS APP ==========
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Middleware
app.use(express.json());
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
const tiktok = new TikTokConnector(io, db);
const tts = new TTSEngine(db, io);
const alerts = new AlertManager(io, db);
const flows = new FlowEngine(db, alerts, tts);
const soundboard = new SoundboardManager(db, io);
const goals = new GoalManager(db, io);

// New Modules
const obs = new OBSWebSocket(db, io);
const subscriptionTiers = new SubscriptionTiers(db, io);
const leaderboard = new Leaderboard(db, io);

logger.info('✅ All modules initialized');

// ========== SWAGGER DOCUMENTATION ==========
setupSwagger(app);
logger.info('📚 Swagger API Documentation available at /api-docs');

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

app.post('/api/connect', rateLimiter.apiLimiter, async (req, res) => {
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

app.post('/api/disconnect', rateLimiter.apiLimiter, (req, res) => {
    tiktok.disconnect();
    logger.info('🔌 Disconnected from TikTok');
    res.json({ success: true });
});

app.get('/api/status', rateLimiter.apiLimiter, (req, res) => {
    res.json({
        isConnected: tiktok.isActive(),
        username: tiktok.currentUsername,
        stats: tiktok.getStats()
    });
});

// ========== VOICE MAPPING ROUTES ==========

app.get('/api/voices', rateLimiter.apiLimiter, (req, res) => {
    const voices = db.getUserVoices();
    res.json(voices);
});

app.get('/api/voices/list', rateLimiter.apiLimiter, (req, res) => {
    const TTSModule = require('./modules/tts');
    const provider = req.query.provider || 'tiktok';
    res.json(TTSModule.getVoices(provider));
});

app.get('/api/voices/all', rateLimiter.apiLimiter, (req, res) => {
    const TTSModule = require('./modules/tts');
    res.json(TTSModule.getAllVoices());
});

app.post('/api/voices', rateLimiter.apiLimiter, (req, res) => {
    const { username, voice } = req.body;

    if (!username || !voice) {
        return res.status(400).json({ success: false, error: 'Username and voice are required' });
    }

    try {
        db.setUserVoice(username, voice);
        logger.info(`🎤 Voice set for user ${username}: ${voice}`);
        res.json({ success: true });
    } catch (error) {
        logger.error('Error setting voice:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/voices/:username', rateLimiter.apiLimiter, (req, res) => {
    try {
        db.deleteUserVoice(req.params.username);
        logger.info(`🗑️ Voice deleted for user: ${req.params.username}`);
        res.json({ success: true });
    } catch (error) {
        logger.error('Error deleting voice:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== SETTINGS ROUTES ==========

app.get('/api/settings', rateLimiter.apiLimiter, (req, res) => {
    const settings = db.getAllSettings();
    res.json(settings);
});

app.post('/api/settings', rateLimiter.apiLimiter, (req, res) => {
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
app.get('/api/profiles', rateLimiter.apiLimiter, (req, res) => {
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
app.get('/api/profiles/active', rateLimiter.apiLimiter, (req, res) => {
    try {
        const activeProfile = profileManager.getActiveProfile();
        res.json({ activeProfile });
    } catch (error) {
        logger.error('Error getting active profile:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Neues Profil erstellen
app.post('/api/profiles', rateLimiter.apiLimiter, (req, res) => {
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
app.delete('/api/profiles/:username', rateLimiter.apiLimiter, (req, res) => {
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
app.post('/api/profiles/switch', rateLimiter.apiLimiter, (req, res) => {
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
app.post('/api/profiles/:username/backup', rateLimiter.apiLimiter, (req, res) => {
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

app.get('/api/hud-config', rateLimiter.apiLimiter, (req, res) => {
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

app.post('/api/hud-config', rateLimiter.apiLimiter, (req, res) => {
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

app.post('/api/hud-config/element/:elementId', rateLimiter.apiLimiter, (req, res) => {
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

app.post('/api/hud-config/element/:elementId/toggle', rateLimiter.apiLimiter, (req, res) => {
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

app.get('/api/flows', rateLimiter.apiLimiter, (req, res) => {
    const flows = db.getFlows();
    res.json(flows);
});

app.get('/api/flows/:id', rateLimiter.apiLimiter, (req, res) => {
    const flow = db.getFlow(req.params.id);
    if (!flow) {
        return res.status(404).json({ success: false, error: 'Flow not found' });
    }
    res.json(flow);
});

app.post('/api/flows', rateLimiter.apiLimiter, (req, res) => {
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

app.put('/api/flows/:id', rateLimiter.apiLimiter, (req, res) => {
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

app.delete('/api/flows/:id', rateLimiter.apiLimiter, (req, res) => {
    try {
        db.deleteFlow(req.params.id);
        logger.info(`🗑️ Deleted flow: ${req.params.id}`);
        res.json({ success: true });
    } catch (error) {
        logger.error('Error deleting flow:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/flows/:id/toggle', rateLimiter.apiLimiter, (req, res) => {
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

app.post('/api/flows/:id/test', rateLimiter.apiLimiter, async (req, res) => {
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

app.get('/api/alerts', rateLimiter.apiLimiter, (req, res) => {
    const alertConfigs = db.getAllAlertConfigs();
    res.json(alertConfigs);
});

app.post('/api/alerts/:eventType', rateLimiter.apiLimiter, (req, res) => {
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

app.post('/api/alerts/test', rateLimiter.apiLimiter, (req, res) => {
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

app.post('/api/tts/test', rateLimiter.apiLimiter, async (req, res) => {
    const { username, text, voice } = req.body;

    if (!text) {
        return res.status(400).json({ success: false, error: 'Text is required' });
    }

    try {
        await tts.speak(username || 'TestUser', text, voice);
        logger.info(`🎤 TTS test: "${text}"`);
        res.json({ success: true });
    } catch (error) {
        logger.error('Error testing TTS:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== SOUNDBOARD ROUTES ==========

app.get('/api/soundboard/gifts', rateLimiter.apiLimiter, (req, res) => {
    try {
        const gifts = soundboard.getAllGiftSounds();
        res.json(gifts);
    } catch (error) {
        logger.error('Error getting gift sounds:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/soundboard/gifts', rateLimiter.apiLimiter, (req, res) => {
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

app.delete('/api/soundboard/gifts/:giftId', rateLimiter.apiLimiter, (req, res) => {
    try {
        soundboard.deleteGiftSound(req.params.giftId);
        logger.info(`🗑️ Deleted gift sound: ${req.params.giftId}`);
        res.json({ success: true });
    } catch (error) {
        logger.error('Error deleting gift sound:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/soundboard/test', rateLimiter.apiLimiter, async (req, res) => {
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

app.get('/api/soundboard/queue', rateLimiter.apiLimiter, (req, res) => {
    try {
        const status = soundboard.getQueueStatus();
        res.json(status);
    } catch (error) {
        logger.error('Error getting queue status:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/soundboard/queue/clear', rateLimiter.apiLimiter, (req, res) => {
    try {
        soundboard.clearQueue();
        logger.info('🧹 Soundboard queue cleared');
        res.json({ success: true });
    } catch (error) {
        logger.error('Error clearing queue:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/myinstants/search', rateLimiter.apiLimiter, async (req, res) => {
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

app.get('/api/myinstants/trending', rateLimiter.apiLimiter, async (req, res) => {
    const { limit } = req.query;

    try {
        const results = await soundboard.getTrendingSounds(limit || 20);
        res.json({ success: true, results });
    } catch (error) {
        logger.error('Error getting trending sounds:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/myinstants/random', rateLimiter.apiLimiter, async (req, res) => {
    const { limit } = req.query;

    try {
        const results = await soundboard.getRandomSounds(limit || 20);
        res.json({ success: true, results });
    } catch (error) {
        logger.error('Error getting random sounds:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/myinstants/resolve', rateLimiter.apiLimiter, async (req, res) => {
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

app.get('/api/gift-catalog', rateLimiter.apiLimiter, (req, res) => {
    try {
        const catalog = db.getGiftCatalog();
        const lastUpdate = db.getCatalogLastUpdate();
        res.json({ success: true, catalog, lastUpdate, count: catalog.length });
    } catch (error) {
        logger.error('Error getting gift catalog:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/gift-catalog/update', rateLimiter.apiLimiter, async (req, res) => {
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
app.get('/api/goals', rateLimiter.apiLimiter, (req, res) => {
    try {
        const status = goals.getStatus();
        res.json({ success: true, goals: status });
    } catch (error) {
        logger.error('Error getting goals:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get single goal
app.get('/api/goals/:key', rateLimiter.apiLimiter, (req, res) => {
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
app.post('/api/goals/:key/config', rateLimiter.apiLimiter, async (req, res) => {
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
app.post('/api/goals/:key/style', rateLimiter.apiLimiter, async (req, res) => {
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
app.post('/api/goals/:key/set', rateLimiter.apiLimiter, async (req, res) => {
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
app.post('/api/goals/:key/increment', rateLimiter.apiLimiter, async (req, res) => {
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
app.post('/api/goals/:key/reset', rateLimiter.apiLimiter, async (req, res) => {
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
app.post('/api/goals/reset', rateLimiter.apiLimiter, async (req, res) => {
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

app.get('/api/obs/status', rateLimiter.apiLimiter, (req, res) => {
    try {
        const status = obs.getStatus();
        res.json({ success: true, ...status });
    } catch (error) {
        logger.error('Error getting OBS status:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/obs/connect', rateLimiter.apiLimiter, async (req, res) => {
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

app.post('/api/obs/disconnect', rateLimiter.apiLimiter, async (req, res) => {
    try {
        await obs.disconnect();
        logger.info('🎬 Disconnected from OBS');
        res.json({ success: true, message: 'Disconnected from OBS' });
    } catch (error) {
        logger.error('Error disconnecting from OBS:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/obs/scene/:sceneName', rateLimiter.apiLimiter, async (req, res) => {
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

app.post('/api/obs/source/:sourceName/visibility', rateLimiter.apiLimiter, async (req, res) => {
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

app.post('/api/obs/filter/:sourceName/:filterName/toggle', rateLimiter.apiLimiter, async (req, res) => {
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

app.get('/api/obs/scenes', rateLimiter.apiLimiter, async (req, res) => {
    try {
        const scenes = await obs.getScenes();
        res.json({ success: true, scenes });
    } catch (error) {
        logger.error('Error getting OBS scenes:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/obs/sources', rateLimiter.apiLimiter, async (req, res) => {
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

app.get('/api/leaderboard/top/:category', rateLimiter.apiLimiter, async (req, res) => {
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

app.get('/api/leaderboard/user/:username', rateLimiter.apiLimiter, async (req, res) => {
    const { username } = req.params;

    try {
        const stats = await leaderboard.getUserStats(username);
        res.json({ success: true, username, stats });
    } catch (error) {
        logger.error('Error getting user stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/leaderboard/reset', rateLimiter.apiLimiter, async (req, res) => {
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

app.get('/api/leaderboard/all', rateLimiter.apiLimiter, async (req, res) => {
    try {
        const allStats = await leaderboard.getAllStats();
        res.json({ success: true, stats: allStats });
    } catch (error) {
        logger.error('Error getting all leaderboard stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== SUBSCRIPTION TIERS ROUTES ==========

app.get('/api/subscription-tiers', rateLimiter.apiLimiter, (req, res) => {
    try {
        const tiers = subscriptionTiers.getAllTiers();
        res.json({ success: true, tiers });
    } catch (error) {
        logger.error('Error getting subscription tiers:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/subscription-tiers', rateLimiter.apiLimiter, (req, res) => {
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

app.get('/api/subscription-tiers/:tier', rateLimiter.apiLimiter, (req, res) => {
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

app.post('/api/animations/upload', rateLimiter.apiLimiter, upload.single('animation'), (req, res) => {
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

app.get('/api/animations/list', rateLimiter.apiLimiter, (req, res) => {
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

app.delete('/api/animations/:filename', rateLimiter.apiLimiter, (req, res) => {
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

// ========== MINIGAMES ROUTES ==========

app.post('/api/minigames/roulette', rateLimiter.apiLimiter, (req, res) => {
    const { username, bet } = req.body;

    try {
        const result = Math.floor(Math.random() * 37); // 0-36
        const color = result === 0 ? 'green' : (result % 2 === 0 ? 'black' : 'red');

        logger.info(`🎰 Roulette: ${username} bet on ${bet}, result: ${result} (${color})`);

        io.emit('minigame:roulette', {
            username,
            bet,
            result,
            color,
            win: bet === result.toString() || bet === color
        });

        res.json({
            success: true,
            game: 'roulette',
            result,
            color,
            win: bet === result.toString() || bet === color
        });
    } catch (error) {
        logger.error('Error in roulette game:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/minigames/dice', rateLimiter.apiLimiter, (req, res) => {
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

app.post('/api/minigames/coinflip', rateLimiter.apiLimiter, (req, res) => {
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

// ========== SOCKET.IO EVENTS ==========

io.on('connection', (socket) => {
    logger.info(`🔌 Client connected: ${socket.id}`);

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

    socket.on('test:tts', async (data) => {
        await tts.speak(data.username || 'TestUser', data.text, data.voice);
    });

    // Minigame events from client
    socket.on('minigame:request', async (data) => {
        logger.debug(`🎮 Minigame request: ${data.type} from ${data.username}`);
        // Handle minigame requests if needed
    });
});

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

    // Goals: Coins erhöhen
    await goals.incrementGoal('coins', data.coins || 0);

    // Leaderboard: Update user stats
    await leaderboard.trackGift(data.username, data.giftName, data.coins);

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

    await flows.processEvent('share', data);
});

// Chat Event
tiktok.on('chat', async (data) => {
    // TTS für Chat (wenn aktiviert)
    const ttsEnabled = db.getSetting('tts_chat_enabled') === 'true';
    if (ttsEnabled) {
        const minCoins = parseInt(db.getSetting('tts_min_coins')) || 0;

        // Optional: Nur TTS für User mit mindestens X gespendeten Coins
        // (würde zusätzliche Tracking-Logik erfordern)

        await tts.speak(data.username, data.message);
    }

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

    // Goals: Total Likes setzen (wenn vorhanden)
    if (data.totalLikes !== undefined) {
        await goals.setGoal('likes', data.totalLikes);
    } else {
        // Fallback: inkrementieren
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
    const obsHost = db.getSetting('obs_host');
    const obsPort = db.getSetting('obs_port');
    const obsPassword = db.getSetting('obs_password');

    if (obsHost && obsPort) {
        logger.info(`🎬 Connecting to OBS at ${obsHost}:${obsPort}...`);
        try {
            await obs.connect(obsHost, obsPort, obsPassword);
            logger.info('✅ OBS connected successfully');
        } catch (error) {
            logger.warn('⚠️  Could not connect to OBS:', error.message);
            logger.info('   You can configure OBS connection in settings');
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

module.exports = { app, server, io, db, tiktok, tts, alerts, flows, soundboard, goals, obs, leaderboard, subscriptionTiers };
