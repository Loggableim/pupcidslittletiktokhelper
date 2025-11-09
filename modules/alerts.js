class AlertManager {
    constructor(io, db) {
        this.io = io;
        this.db = db;
        this.queue = [];
        this.isProcessing = false;
        this.currentAlert = null;
    }

    addAlert(type, data, customConfig = null) {
        try {
            // Alert-Konfiguration aus DB oder Custom-Config
            let config = customConfig;
            if (!config) {
                config = this.db.getAlertConfig(type);
            }

            // Wenn kein Config vorhanden, Default-Config erstellen
            if (!config) {
                config = this.getDefaultConfig(type);
            }

            // Alert nur hinzufügen wenn enabled
            if (!config.enabled) {
                console.log(`⚠️ Alert für ${type} ist deaktiviert`);
                return;
            }

            // Text-Template mit Daten rendern
            const renderedText = this.renderTemplate(config.text_template || '', data);

            // Alert-Objekt erstellen
            const alert = {
                type: type,
                data: data,
                text: renderedText,
                soundFile: config.sound_file,
                soundVolume: config.sound_volume || 80,
                duration: (config.duration || 5) * 1000, // in Millisekunden
                image: data.giftPictureUrl || data.profilePictureUrl || null,
                timestamp: Date.now()
            };

            // In Queue einreihen
            this.queue.push(alert);
            console.log(`🔔 Alert queued: ${type} - ${renderedText}`);

            // Verarbeitung starten
            this.processQueue();

        } catch (error) {
            console.error('❌ Alert Error:', error.message);
        }
    }

    processQueue() {
        // Wenn bereits Processing oder Queue leer
        if (this.isProcessing || this.queue.length === 0) {
            return;
        }

        this.isProcessing = true;
        this.currentAlert = this.queue.shift();

        // Alert an Overlay senden
        this.io.emit('alert:show', {
            type: this.currentAlert.type,
            text: this.currentAlert.text,
            soundFile: this.currentAlert.soundFile,
            soundVolume: this.currentAlert.soundVolume,
            duration: this.currentAlert.duration,
            image: this.currentAlert.image,
            data: this.currentAlert.data
        });

        console.log(`🔔 Alert showing: ${this.currentAlert.type}`);

        // Nach Alert-Dauer nächsten Alert anzeigen
        setTimeout(() => {
            this.isProcessing = false;
            this.currentAlert = null;
            this.processQueue(); // Rekursiv nächsten Alert
        }, this.currentAlert.duration + 500); // +500ms Puffer zwischen Alerts
    }

    renderTemplate(template, data) {
        if (!template) {
            return this.getDefaultText(data);
        }

        let rendered = template;

        // Verfügbare Variablen
        const variables = {
            '{username}': data.username || data.uniqueId || 'Unknown',
            '{nickname}': data.nickname || data.username || 'Unknown',
            '{message}': data.message || '',
            '{gift_name}': data.giftName || '',
            '{coins}': data.coins || 0,
            '{repeat_count}': data.repeatCount || 1,
            '{like_count}': data.likeCount || 1,
            '{total_coins}': data.totalCoins || 0
        };

        // Variablen ersetzen
        Object.entries(variables).forEach(([key, value]) => {
            rendered = rendered.replace(new RegExp(key, 'g'), value);
        });

        return rendered;
    }

    getDefaultText(data) {
        // Default-Texte basierend auf Event-Typ
        if (data.giftName) {
            return `${data.username} sent ${data.giftName}${data.repeatCount > 1 ? ' x' + data.repeatCount : ''}!`;
        } else if (data.message) {
            return `${data.username}: ${data.message}`;
        } else {
            return `${data.username}`;
        }
    }

    getDefaultConfig(type) {
        const defaults = {
            'gift': {
                event_type: 'gift',
                sound_file: null,
                sound_volume: 80,
                text_template: '{username} sent {gift_name} x{repeat_count}! ({coins} coins)',
                duration: 5,
                enabled: true
            },
            'follow': {
                event_type: 'follow',
                sound_file: null,
                sound_volume: 80,
                text_template: '{username} followed!',
                duration: 4,
                enabled: true
            },
            'subscribe': {
                event_type: 'subscribe',
                sound_file: null,
                sound_volume: 100,
                text_template: '{username} subscribed!',
                duration: 6,
                enabled: true
            },
            'share': {
                event_type: 'share',
                sound_file: null,
                sound_volume: 80,
                text_template: '{username} shared the stream!',
                duration: 4,
                enabled: true
            },
            'like': {
                event_type: 'like',
                sound_file: null,
                sound_volume: 50,
                text_template: '{username} liked!',
                duration: 2,
                enabled: false // Likes normalerweise deaktiviert (zu viele)
            }
        };

        return defaults[type] || {
            event_type: type,
            sound_file: null,
            sound_volume: 80,
            text_template: '{username}',
            duration: 5,
            enabled: true
        };
    }

    clearQueue() {
        this.queue = [];
        this.currentAlert = null;
        this.isProcessing = false;
        console.log('🗑️ Alert queue cleared');
    }

    skipCurrent() {
        if (this.currentAlert) {
            console.log('⏭️ Skipping current alert');
            this.io.emit('alert:hide');
            this.isProcessing = false;
            this.currentAlert = null;
            this.processQueue();
        }
    }

    getQueueLength() {
        return this.queue.length;
    }

    testAlert(type, testData = {}) {
        // Test-Daten für verschiedene Alert-Typen
        const testDataDefaults = {
            gift: {
                username: 'TestUser',
                nickname: 'Test User',
                giftName: 'Rose',
                repeatCount: 5,
                coins: 50,
                giftPictureUrl: null
            },
            follow: {
                username: 'NewFollower',
                nickname: 'New Follower'
            },
            subscribe: {
                username: 'Subscriber123',
                nickname: 'Subscriber 123'
            },
            share: {
                username: 'ShareUser',
                nickname: 'Share User'
            }
        };

        const data = { ...testDataDefaults[type], ...testData };
        this.addAlert(type, data);
    }
}

module.exports = AlertManager;
