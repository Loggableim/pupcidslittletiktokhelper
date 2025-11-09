const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const open = require('open');

// Import Modules
const Database = require('./modules/database');
const TikTokConnector = require('./modules/tiktok');
const TTSEngine = require('./modules/tts');
const AlertManager = require('./modules/alerts');
const FlowEngine = require('./modules/flows');
const SoundboardManager = require('./modules/soundboard');
const { GoalManager } = require('./modules/goals');

// ========== EXPRESS APP ==========
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Middleware
app.use(express.json());
app.use(express.static('public'));

// ========== DATABASE INITIALISIEREN ==========
const db = new Database('./database.db');
console.log('✅ Database initialized');

// ========== MODULE INITIALISIEREN ==========
const tiktok = new TikTokConnector(io, db);
const tts = new TTSEngine(db, io);
const alerts = new AlertManager(io, db);
const flows = new FlowEngine(db, alerts, tts);
const soundboard = new SoundboardManager(db, io);
const goals = new GoalManager(db, io);

console.log('✅ All modules initialized');

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

app.post('/api/connect', async (req, res) => {
    const { username } = req.body;

    if (!username) {
        return res.status(400).json({ success: false, error: 'Username is required' });
    }

    try {
        await tiktok.connect(username);
        res.json({ success: true });
    } catch (error) {
        console.error('Connection error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/disconnect', (req, res) => {
    tiktok.disconnect();
    res.json({ success: true });
});

app.get('/api/status', (req, res) => {
    res.json({
        isConnected: tiktok.isActive(),
        username: tiktok.currentUsername,
        stats: tiktok.getStats()
    });
});

// ========== VOICE MAPPING ROUTES ==========

app.get('/api/voices', (req, res) => {
    const voices = db.getUserVoices();
    res.json(voices);
});

app.get('/api/voices/list', (req, res) => {
    const TTSModule = require('./modules/tts');
    res.json(TTSModule.getVoices());
});

app.post('/api/voices', (req, res) => {
    const { username, voice } = req.body;

    if (!username || !voice) {
        return res.status(400).json({ success: false, error: 'Username and voice are required' });
    }

    try {
        db.setUserVoice(username, voice);
        res.json({ success: true });
    } catch (error) {
        console.error('Error setting voice:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/voices/:username', (req, res) => {
    try {
        db.deleteUserVoice(req.params.username);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting voice:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== SETTINGS ROUTES ==========

app.get('/api/settings', (req, res) => {
    const settings = db.getAllSettings();
    res.json(settings);
});

app.post('/api/settings', (req, res) => {
    const settings = req.body;

    try {
        Object.entries(settings).forEach(([key, value]) => {
            db.setSetting(key, value);
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Error saving settings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== FLOWS ROUTES ==========

app.get('/api/flows', (req, res) => {
    const flows = db.getFlows();
    res.json(flows);
});

app.get('/api/flows/:id', (req, res) => {
    const flow = db.getFlow(req.params.id);
    if (!flow) {
        return res.status(404).json({ success: false, error: 'Flow not found' });
    }
    res.json(flow);
});

app.post('/api/flows', (req, res) => {
    const flow = req.body;

    if (!flow.name || !flow.trigger_type || !flow.actions) {
        return res.status(400).json({
            success: false,
            error: 'Name, trigger_type and actions are required'
        });
    }

    try {
        const id = db.createFlow(flow);
        res.json({ success: true, id });
    } catch (error) {
        console.error('Error creating flow:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/flows/:id', (req, res) => {
    const flow = req.body;

    try {
        db.updateFlow(req.params.id, flow);
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating flow:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/flows/:id', (req, res) => {
    try {
        db.deleteFlow(req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting flow:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/flows/:id/toggle', (req, res) => {
    const { enabled } = req.body;

    try {
        db.toggleFlow(req.params.id, enabled);
        res.json({ success: true });
    } catch (error) {
        console.error('Error toggling flow:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/flows/:id/test', async (req, res) => {
    const testData = req.body;

    try {
        await flows.testFlow(req.params.id, testData);
        res.json({ success: true });
    } catch (error) {
        console.error('Error testing flow:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== ALERT ROUTES ==========

app.get('/api/alerts', (req, res) => {
    const alertConfigs = db.getAllAlertConfigs();
    res.json(alertConfigs);
});

app.post('/api/alerts/:eventType', (req, res) => {
    const { eventType } = req.params;
    const config = req.body;

    try {
        db.setAlertConfig(eventType, config);
        res.json({ success: true });
    } catch (error) {
        console.error('Error setting alert config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/alerts/test', (req, res) => {
    const { type, data } = req.body;

    try {
        alerts.testAlert(type, data);
        res.json({ success: true });
    } catch (error) {
        console.error('Error testing alert:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== TTS ROUTES ==========

app.post('/api/tts/test', async (req, res) => {
    const { username, text, voice } = req.body;

    if (!text) {
        return res.status(400).json({ success: false, error: 'Text is required' });
    }

    try {
        await tts.speak(username || 'TestUser', text, voice);
        res.json({ success: true });
    } catch (error) {
        console.error('Error testing TTS:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== SOUNDBOARD ROUTES ==========

app.get('/api/soundboard/gifts', (req, res) => {
    try {
        const gifts = soundboard.getAllGiftSounds();
        res.json(gifts);
    } catch (error) {
        console.error('Error getting gift sounds:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/soundboard/gifts', (req, res) => {
    const { giftId, label, mp3Url, volume } = req.body;

    if (!giftId || !label || !mp3Url) {
        return res.status(400).json({ success: false, error: 'giftId, label and mp3Url are required' });
    }

    try {
        const id = soundboard.setGiftSound(giftId, label, mp3Url, volume || 1.0);
        res.json({ success: true, id });
    } catch (error) {
        console.error('Error setting gift sound:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/soundboard/gifts/:giftId', (req, res) => {
    try {
        soundboard.deleteGiftSound(req.params.giftId);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting gift sound:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/soundboard/test', async (req, res) => {
    const { url, volume } = req.body;

    if (!url) {
        return res.status(400).json({ success: false, error: 'url is required' });
    }

    try {
        await soundboard.testSound(url, volume || 1.0);
        res.json({ success: true });
    } catch (error) {
        console.error('Error testing sound:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/soundboard/queue', (req, res) => {
    try {
        const status = soundboard.getQueueStatus();
        res.json(status);
    } catch (error) {
        console.error('Error getting queue status:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/soundboard/queue/clear', (req, res) => {
    try {
        soundboard.clearQueue();
        res.json({ success: true });
    } catch (error) {
        console.error('Error clearing queue:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/myinstants/search', async (req, res) => {
    const { query, page } = req.query;

    if (!query) {
        return res.status(400).json({ success: false, error: 'query is required' });
    }

    try {
        const results = await soundboard.searchMyInstants(query, page || 1);
        res.json({ success: true, results });
    } catch (error) {
        console.error('Error searching MyInstants:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== GOALS ROUTES ==========

// Get all goals
app.get('/api/goals', (req, res) => {
    try {
        const status = goals.getStatus();
        res.json({ success: true, goals: status });
    } catch (error) {
        console.error('Error getting goals:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get single goal
app.get('/api/goals/:key', (req, res) => {
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
        console.error('Error getting goal:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update goal config
app.post('/api/goals/:key/config', async (req, res) => {
    try {
        const { key } = req.params;
        const updates = req.body;

        const config = await goals.updateGoalConfig(key, updates);

        if (!config) {
            return res.status(404).json({ success: false, error: 'Goal not found' });
        }

        res.json({ success: true, message: `Goal ${key} updated`, config });
    } catch (error) {
        console.error('Error updating goal config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update goal style
app.post('/api/goals/:key/style', async (req, res) => {
    try {
        const { key } = req.params;
        const { style } = req.body;

        const updatedStyle = await goals.updateStyle(key, style);

        if (!updatedStyle) {
            return res.status(404).json({ success: false, error: 'Goal not found' });
        }

        res.json({ success: true, message: `Style for ${key} updated`, style: updatedStyle });
    } catch (error) {
        console.error('Error updating style:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Set goal total (manual)
app.post('/api/goals/:key/set', async (req, res) => {
    try {
        const { key } = req.params;
        const { total } = req.body;

        if (total === undefined) {
            return res.status(400).json({ success: false, error: 'total is required' });
        }

        await goals.setGoal(key, total);

        res.json({ success: true, message: `Goal ${key} set to ${total}` });
    } catch (error) {
        console.error('Error setting goal:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Increment goal
app.post('/api/goals/:key/increment', async (req, res) => {
    try {
        const { key } = req.params;
        const { delta } = req.body;

        if (delta === undefined) {
            return res.status(400).json({ success: false, error: 'delta is required' });
        }

        await goals.incrementGoal(key, delta);

        res.json({ success: true, message: `Goal ${key} incremented by ${delta}` });
    } catch (error) {
        console.error('Error incrementing goal:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Reset goal
app.post('/api/goals/:key/reset', async (req, res) => {
    try {
        const { key } = req.params;

        await goals.resetGoal(key);

        res.json({ success: true, message: `Goal ${key} reset` });
    } catch (error) {
        console.error('Error resetting goal:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Reset all goals
app.post('/api/goals/reset', async (req, res) => {
    try {
        await goals.resetAllGoals();

        res.json({ success: true, message: 'All goals reset' });
    } catch (error) {
        console.error('Error resetting all goals:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== SOCKET.IO EVENTS ==========

io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);

    // Goal Room Join
    socket.on('goal:join', (key) => {
        socket.join(`goal_${key}`);
        console.log(`📊 Client joined goal room: goal_${key}`);

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

    // Client disconnect
    socket.on('disconnect', () => {
        console.log('🔌 Client disconnected:', socket.id);
    });

    // Test Events (für Testing vom Dashboard)
    socket.on('test:alert', (data) => {
        alerts.testAlert(data.type, data.testData);
    });

    socket.on('test:tts', async (data) => {
        await tts.speak(data.username || 'TestUser', data.text, data.voice);
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

    // Flows verarbeiten
    await flows.processEvent('like', data);
});

// ========== SERVER STARTEN ==========

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log('\n' + '='.repeat(50));
    console.log('🎥 TikTok Stream Tool');
    console.log('='.repeat(50));
    console.log(`\n✅ Server running on http://localhost:${PORT}`);
    console.log(`\n📊 Dashboard: http://localhost:${PORT}/dashboard.html`);
    console.log(`🖼️  Overlay:   http://localhost:${PORT}/overlay.html`);
    console.log('\n' + '='.repeat(50) + '\n');

    // Browser automatisch öffnen
    open(`http://localhost:${PORT}/dashboard.html`).catch(() => {
        console.log('⚠️  Could not open browser automatically');
    });
});

// Graceful Shutdown
process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down gracefully...');

    // TikTok-Verbindung trennen
    if (tiktok.isActive()) {
        tiktok.disconnect();
    }

    // Datenbank schließen
    db.close();

    // Server schließen
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

// Error Handling
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = { app, server, io, db, tiktok, tts, alerts, flows, soundboard, goals };
