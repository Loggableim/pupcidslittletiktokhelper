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

console.log('✅ All modules initialized');

// ========== ROUTES ==========

// Haupt-Seite
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
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

// ========== SOCKET.IO EVENTS ==========

io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);

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

    // Flows verarbeiten
    await flows.processEvent('gift', data);
});

// Follow Event
tiktok.on('follow', async (data) => {
    alerts.addAlert('follow', data);
    await flows.processEvent('follow', data);
});

// Subscribe Event
tiktok.on('subscribe', async (data) => {
    alerts.addAlert('subscribe', data);
    await flows.processEvent('subscribe', data);
});

// Share Event
tiktok.on('share', async (data) => {
    alerts.addAlert('share', data);
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
    // Likes normalerweise nicht als Alert (zu viele)
    // Aber Flows könnten darauf reagieren
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

module.exports = { app, server, io, db, tiktok, tts, alerts, flows };
