/**
 * Topboard Plugin - Zeigt Top Gifts, Streaks und Donors im Overlay
 */
class TopboardPlugin {
    constructor(api) {
        this.api = api;
        this.topGifters = [];
        this.currentStreak = null;
        this.maxStreakCount = 0;
    }

    /**
     * Plugin-Initialisierung
     */
    async init() {
        this.api.log('Topboard Plugin initializing...');

        // API-Endpunkte registrieren
        this.registerRoutes();

        // Socket.io Events registrieren
        this.registerSocketEvents();

        // TikTok-Events registrieren
        this.registerTikTokEvents();

        // Config laden oder initialisieren
        let config = this.api.getConfig('config');
        if (!config) {
            config = {
                maxTopGifters: 10,
                minCoinsForTop: 100,
                streakTimeout: 60000, // 60 Sekunden
                enabled: true
            };
            this.api.setConfig('config', config);
        }

        this.config = config;
        this.api.log('Topboard Plugin initialized successfully');
    }

    /**
     * Registriert Express-Routes
     */
    registerRoutes() {
        // GET /api/topboard - Top Gifters abrufen
        this.api.registerRoute('GET', '/api/topboard', async (req, res) => {
            res.json({
                success: true,
                data: {
                    topGifters: this.topGifters,
                    currentStreak: this.currentStreak,
                    maxStreak: this.maxStreakCount
                }
            });
        });

        // GET /api/topboard/config - Config abrufen
        this.api.registerRoute('GET', '/api/topboard/config', async (req, res) => {
            res.json({
                success: true,
                config: this.config
            });
        });

        // POST /api/topboard/config - Config speichern
        this.api.registerRoute('POST', '/api/topboard/config', async (req, res) => {
            try {
                this.config = { ...this.config, ...req.body };
                this.api.setConfig('config', this.config);

                res.json({
                    success: true,
                    config: this.config
                });

                // Config-Update an Clients senden
                this.api.emit('topboard:config-update', this.config);
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // POST /api/topboard/reset - Daten zurücksetzen
        this.api.registerRoute('POST', '/api/topboard/reset', async (req, res) => {
            this.topGifters = [];
            this.currentStreak = null;
            this.maxStreakCount = 0;

            this.api.emit('topboard:reset', {});

            res.json({ success: true });
        });
    }

    /**
     * Registriert Socket.io Events
     */
    registerSocketEvents() {
        this.api.registerSocket('topboard:join', (socket) => {
            // Client möchte Topboard-Updates empfangen
            socket.join('topboard');
            this.api.log(`Client joined topboard room`);

            // Aktuelle Daten senden
            socket.emit('topboard:update', {
                topGifters: this.topGifters,
                currentStreak: this.currentStreak,
                maxStreak: this.maxStreakCount
            });
        });

        this.api.registerSocket('topboard:leave', (socket) => {
            socket.leave('topboard');
            this.api.log(`Client left topboard room`);
        });
    }

    /**
     * Registriert TikTok-Events
     */
    registerTikTokEvents() {
        // Gift-Event verarbeiten
        this.api.registerTikTokEvent('gift', async (data) => {
            if (!this.config.enabled) return;

            const { username, coins, giftName } = data;

            // Top Gifters aktualisieren
            this.updateTopGifters(username, coins, giftName);

            // Streak verarbeiten
            this.processStreak(username, coins);

            // Update an Clients senden
            this.broadcastUpdate();
        });
    }

    /**
     * Aktualisiert die Top-Gifters-Liste
     */
    updateTopGifters(username, coins, giftName) {
        // Existierenden Gifter finden
        let gifter = this.topGifters.find(g => g.username === username);

        if (gifter) {
            gifter.totalCoins += coins;
            gifter.giftCount++;
            gifter.lastGift = giftName;
            gifter.lastGiftAt = new Date().toISOString();
        } else {
            gifter = {
                username,
                totalCoins: coins,
                giftCount: 1,
                lastGift: giftName,
                lastGiftAt: new Date().toISOString()
            };
            this.topGifters.push(gifter);
        }

        // Liste sortieren (Top nach Coins)
        this.topGifters.sort((a, b) => b.totalCoins - a.totalCoins);

        // Nur Top X behalten
        this.topGifters = this.topGifters.slice(0, this.config.maxTopGifters);

        this.api.log(`Updated top gifters, ${username} now at ${gifter.totalCoins} coins`);
    }

    /**
     * Verarbeitet Gift-Streaks
     */
    processStreak(username, coins) {
        const now = Date.now();

        // Streak fortsetzen?
        if (this.currentStreak && this.currentStreak.username === username) {
            const timeSinceLastGift = now - this.currentStreak.lastGiftTime;

            if (timeSinceLastGift <= this.config.streakTimeout) {
                // Streak fortsetzen
                this.currentStreak.count++;
                this.currentStreak.totalCoins += coins;
                this.currentStreak.lastGiftTime = now;

                // Max-Streak aktualisieren?
                if (this.currentStreak.count > this.maxStreakCount) {
                    this.maxStreakCount = this.currentStreak.count;
                    this.api.log(`New max streak: ${this.maxStreakCount} by ${username}`);
                }
            } else {
                // Streak abgelaufen, neuen Streak starten
                this.startNewStreak(username, coins, now);
            }
        } else {
            // Neuen Streak starten
            this.startNewStreak(username, coins, now);
        }
    }

    /**
     * Startet einen neuen Streak
     */
    startNewStreak(username, coins, time) {
        this.currentStreak = {
            username,
            count: 1,
            totalCoins: coins,
            startTime: time,
            lastGiftTime: time
        };
    }

    /**
     * Sendet Update an alle Topboard-Clients
     */
    broadcastUpdate() {
        const io = this.api.getSocketIO();
        io.to('topboard').emit('topboard:update', {
            topGifters: this.topGifters,
            currentStreak: this.currentStreak,
            maxStreak: this.maxStreakCount
        });
    }

    /**
     * Plugin-Cleanup
     */
    async destroy() {
        this.api.log('Topboard Plugin shutting down...');
        this.topGifters = [];
        this.currentStreak = null;
        this.maxStreakCount = 0;
    }
}

module.exports = TopboardPlugin;
