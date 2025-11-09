const axios = require('axios');

// Verfügbare Google TTS Stimmen (Auswahl der beliebtesten)
const GOOGLE_VOICES = {
    // Deutsch
    'de-DE-Wavenet-A': 'Deutsch (Weiblich, Wavenet A)',
    'de-DE-Wavenet-B': 'Deutsch (Männlich, Wavenet B)',
    'de-DE-Wavenet-C': 'Deutsch (Weiblich, Wavenet C)',
    'de-DE-Wavenet-D': 'Deutsch (Männlich, Wavenet D)',
    'de-DE-Standard-A': 'Deutsch (Weiblich, Standard A)',
    'de-DE-Standard-B': 'Deutsch (Männlich, Standard B)',

    // Englisch (US)
    'en-US-Wavenet-A': 'English US (Männlich, Wavenet A)',
    'en-US-Wavenet-B': 'English US (Männlich, Wavenet B)',
    'en-US-Wavenet-C': 'English US (Weiblich, Wavenet C)',
    'en-US-Wavenet-D': 'English US (Männlich, Wavenet D)',
    'en-US-Wavenet-E': 'English US (Weiblich, Wavenet E)',
    'en-US-Wavenet-F': 'English US (Weiblich, Wavenet F)',
    'en-US-Standard-A': 'English US (Männlich, Standard A)',
    'en-US-Standard-B': 'English US (Männlich, Standard B)',
    'en-US-Standard-C': 'English US (Weiblich, Standard C)',
    'en-US-Standard-D': 'English US (Männlich, Standard D)',

    // Englisch (GB)
    'en-GB-Wavenet-A': 'English GB (Weiblich, Wavenet A)',
    'en-GB-Wavenet-B': 'English GB (Männlich, Wavenet B)',
    'en-GB-Wavenet-C': 'English GB (Weiblich, Wavenet C)',
    'en-GB-Wavenet-D': 'English GB (Männlich, Wavenet D)',

    // Weitere Sprachen
    'es-ES-Wavenet-A': 'Español (Weiblich)',
    'fr-FR-Wavenet-A': 'Français (Weiblich)',
    'it-IT-Wavenet-A': 'Italiano (Weiblich)',
    'ja-JP-Wavenet-A': 'Japanese (Weiblich)',
    'ko-KR-Wavenet-A': 'Korean (Weiblich)',
};

// Verfügbare TikTok TTS Stimmen
const TIKTOK_VOICES = {
    // Englisch - Disney/Characters
    'en_us_ghostface': 'Ghostface (Scream)',
    'en_us_chewbacca': 'Chewbacca (Star Wars)',
    'en_us_c3po': 'C3PO (Star Wars)',
    'en_us_stitch': 'Stitch (Lilo & Stitch)',
    'en_us_stormtrooper': 'Stormtrooper (Star Wars)',
    'en_us_rocket': 'Rocket (Guardians)',

    // Englisch - Standard
    'en_male_narration': 'Male Narrator',
    'en_male_funny': 'Male Funny',
    'en_female_emotional': 'Female Emotional',
    'en_female_samc': 'Female Friendly',
    'en_us_001': 'US Female 1',
    'en_us_002': 'US Female 2',
    'en_us_006': 'US Male 1',
    'en_us_007': 'US Male 2',
    'en_us_009': 'US Male 3',
    'en_us_010': 'US Male 4',

    // Deutsch
    'de_001': 'Deutsch Männlich',
    'de_002': 'Deutsch Weiblich',

    // Weitere Sprachen
    'es_002': 'Spanisch Male',
    'fr_001': 'Französisch Male',
    'fr_002': 'Französisch Female',
    'pt_female': 'Portugiesisch Female',
    'br_003': 'Portugiesisch BR Female',
    'id_001': 'Indonesisch Female',
    'jp_001': 'Japanisch Female',
    'jp_003': 'Japanisch Male',
    'kr_002': 'Koreanisch Male'
};

/**
 * TTS Plugin - Text-to-Speech Engine
 */
class TTSPlugin {
    constructor(api) {
        this.api = api;
        this.db = api.getDatabase();
        this.io = api.getSocketIO();

        this.queue = [];
        this.isPlaying = false;
        this.currentAudio = null;
        this.ttsApiUrl = 'https://tiktok-tts.weilnet.workers.dev/api/generation';
        this.blacklist = ['http', 'https', 'www.', '.com', '.de', '.org'];
        this.maxTextLength = 300;
        this.MAX_QUEUE_SIZE = 100;
        this.QUEUE_WARNING_THRESHOLD = 80; // 80%
    }

    async init() {
        this.api.log('TTS Plugin initializing...');

        // API-Routen registrieren
        this.registerRoutes();

        // TikTok-Events registrieren
        this.registerTikTokEvents();

        this.api.log('TTS Plugin initialized successfully');
    }

    registerRoutes() {
        // GET /api/voices - User-Voice-Mappings
        this.api.registerRoute('GET', '/api/voices', (req, res) => {
            const voices = this.db.getAllUserVoices();
            res.json(voices);
        });

        // GET /api/voices/list - Liste aller verfügbaren Stimmen (TikTok)
        this.api.registerRoute('GET', '/api/voices/list', (req, res) => {
            res.json(TIKTOK_VOICES);
        });

        // GET /api/voices/all - Alle verfügbaren Stimmen (TikTok + Google)
        this.api.registerRoute('GET', '/api/voices/all', (req, res) => {
            res.json({
                tiktok: TIKTOK_VOICES,
                google: GOOGLE_VOICES
            });
        });

        // POST /api/voices - User-spezifische Voice setzen
        this.api.registerRoute('POST', '/api/voices', (req, res) => {
            const { username, voice } = req.body;

            if (!username || !voice) {
                return res.status(400).json({
                    success: false,
                    error: 'Username and voice are required'
                });
            }

            this.db.setUserVoice(username, voice);
            res.json({
                success: true,
                message: `Voice ${voice} set for user ${username}`
            });
        });

        // DELETE /api/voices/:username - User-Voice löschen
        this.api.registerRoute('DELETE', '/api/voices/:username', (req, res) => {
            const { username } = req.params;
            const deleted = this.db.deleteUserVoice(username);

            if (deleted) {
                res.json({
                    success: true,
                    message: `Voice mapping for ${username} deleted`
                });
            } else {
                res.status(404).json({
                    success: false,
                    error: 'Voice mapping not found'
                });
            }
        });

        // POST /api/tts/test - TTS testen
        this.api.registerRoute('POST', '/api/tts/test', async (req, res) => {
            try {
                const { text, voice } = req.body;

                if (!text || !voice) {
                    return res.status(400).json({
                        success: false,
                        error: 'Text and voice are required'
                    });
                }

                await this.speak('Test', text, voice);

                res.json({
                    success: true,
                    message: 'TTS test queued'
                });
            } catch (error) {
                this.api.log(`TTS test failed: ${error.message}`, 'error');
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });
    }

    registerTikTokEvents() {
        // Chat-Event für Auto-TTS
        this.api.registerTikTokEvent('chat', async (data) => {
            const ttsEnabled = this.db.getSetting('tts_chat_enabled') === 'true';

            if (ttsEnabled && data.message) {
                await this.speak(data.username, data.message, null, {
                    teamMemberLevel: data.teamMemberLevel
                });
            }
        });

        // Gift-Event für TTS (falls gewünscht)
        this.api.registerTikTokEvent('gift', async (data) => {
            const ttsGiftEnabled = this.db.getSetting('tts_gift_enabled') === 'true';
            const minCoins = parseInt(this.db.getSetting('tts_min_coins')) || 100;

            if (ttsGiftEnabled && data.coins >= minCoins) {
                const message = `${data.username} sent ${data.giftName} for ${data.coins} coins`;
                await this.speak('System', message, null, {});
            }
        });
    }

    async speak(username, text, voiceOverride = null, userMetadata = {}) {
        try {
            // Teamlevel-Prüfung (falls aktiviert)
            const minTeamLevel = parseInt(this.db.getSetting('tts_min_team_level')) || 0;
            if (minTeamLevel > 0) {
                const userTeamLevel = userMetadata.teamMemberLevel || userMetadata.teamLevel || 0;
                if (userTeamLevel < minTeamLevel) {
                    this.api.log(`User ${username} has teamLevel ${userTeamLevel}, but min required is ${minTeamLevel}`);
                    return;
                }
            }

            // Text filtern
            const filteredText = this.filterText(text);
            if (!filteredText || filteredText.trim().length === 0) {
                this.api.log('Text filtered out or empty');
                return;
            }

            // Voice bestimmen
            let voice = voiceOverride;
            if (!voice) {
                // User-spezifische Voice aus DB holen
                voice = this.db.getUserVoice(username);
                if (voice) {
                    this.db.updateUserVoiceLastUsed(username);
                }
            }

            // Fallback zu Default-Voice
            if (!voice) {
                voice = this.db.getSetting('default_voice') || 'en_us_ghostface';
            }

            // TTS Provider bestimmen
            const provider = this.db.getSetting('tts_provider') || 'tiktok';

            // Audio generieren
            const audioData = await this.generateTTS(filteredText, voice, provider);

            if (audioData) {
                // Queue-Size-Limit prüfen
                if (this.queue.length >= this.MAX_QUEUE_SIZE) {
                    const removed = this.queue.shift(); // Ältestes Element entfernen
                    this.api.log(`TTS queue full (${this.MAX_QUEUE_SIZE}), removed oldest item: "${removed.text}"`, 'warn');
                }

                // Warning bei 80% Füllung
                if (this.queue.length >= this.MAX_QUEUE_SIZE * (this.QUEUE_WARNING_THRESHOLD / 100)) {
                    this.api.log(`TTS queue at ${this.queue.length}/${this.MAX_QUEUE_SIZE} capacity (${Math.round(this.queue.length / this.MAX_QUEUE_SIZE * 100)}%)`, 'warn');
                }

                // In Queue einreihen
                this.queue.push({
                    username,
                    text: filteredText,
                    voice,
                    audioData,
                    timestamp: Date.now()
                });

                this.api.log(`TTS queued: "${filteredText}" (Voice: ${voice}, Queue: ${this.queue.length}/${this.MAX_QUEUE_SIZE})`);

                // Verarbeitung starten
                this.processQueue();
            }

        } catch (error) {
            this.api.log(`TTS Error: ${error.message}`, 'error');
        }
    }

    filterText(text) {
        if (!text) return '';

        // Blacklist-Wörter entfernen
        let filtered = text;
        this.blacklist.forEach(word => {
            const regex = new RegExp(word, 'gi');
            filtered = filtered.replace(regex, '');
        });

        // URLs entfernen (einfaches Pattern)
        filtered = filtered.replace(/https?:\/\/\S+/gi, '');
        filtered = filtered.replace(/www\.\S+/gi, '');

        // Spezielle Zeichen entfernen/ersetzen
        filtered = filtered.replace(/[<>{}[\]]/g, '');

        // Zeichen-Limit
        if (filtered.length > this.maxTextLength) {
            filtered = filtered.substring(0, this.maxTextLength) + '...';
        }

        return filtered.trim();
    }

    async generateTTS(text, voice, provider = 'tiktok') {
        if (provider === 'google') {
            return await this.generateGoogleTTS(text, voice);
        } else {
            return await this.generateTikTokTTS(text, voice);
        }
    }

    async generateTikTokTTS(text, voice) {
        try {
            const response = await axios.post(
                this.ttsApiUrl,
                {
                    text: text,
                    voice: voice
                },
                {
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000 // 10 Sekunden Timeout
                }
            );

            if (response.data && response.data.data) {
                // Base64-encoded Audio zurückgeben
                return response.data.data;
            } else {
                this.api.log('TikTok TTS API: Invalid response format', 'error');
                return null;
            }

        } catch (error) {
            this.api.log(`TikTok TTS API Error: ${error.message}`, 'error');
            return null;
        }
    }

    async generateGoogleTTS(text, voice) {
        try {
            const apiKey = this.db.getSetting('google_tts_api_key');

            if (!apiKey) {
                this.api.log('Google TTS: No API key configured', 'error');
                return null;
            }

            // Parse language code from voice (e.g., "de-DE-Wavenet-A" -> "de-DE")
            const languageCode = voice.substring(0, 5);

            const response = await axios.post(
                `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
                {
                    input: { text: text },
                    voice: {
                        languageCode: languageCode,
                        name: voice
                    },
                    audioConfig: {
                        audioEncoding: 'MP3'
                    }
                },
                {
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                }
            );

            if (response.data && response.data.audioContent) {
                // Base64-encoded Audio zurückgeben
                return response.data.audioContent;
            } else {
                this.api.log('Google TTS API: Invalid response format', 'error');
                return null;
            }

        } catch (error) {
            this.api.log(`Google TTS API Error: ${error.response?.data?.error?.message || error.message}`, 'error');
            return null;
        }
    }

    processQueue() {
        // Wenn bereits etwas spielt oder Queue leer, nichts tun
        if (this.isPlaying || this.queue.length === 0) {
            return;
        }

        this.isPlaying = true;
        const item = this.queue.shift();

        // TTS-Settings abrufen
        const volume = parseInt(this.db.getSetting('tts_volume')) || 80;
        const speed = parseFloat(this.db.getSetting('tts_speed')) || 1.0;

        // Audio-Daten an Frontend senden
        this.io.emit('tts:play', {
            username: item.username,
            text: item.text,
            voice: item.voice,
            audioData: item.audioData, // Base64-encoded MP3
            volume: volume,
            speed: speed
        });

        this.api.log(`TTS playing: "${item.text}"`);

        // Geschätzte Dauer berechnen (ca. 0.5 Sekunden pro 10 Zeichen + 1 Sekunde Puffer)
        const estimatedDuration = Math.ceil(item.text.length / 10 * 500) + 1000;

        // Nach geschätzter Dauer nächstes Item abspielen
        setTimeout(() => {
            this.isPlaying = false;
            this.processQueue(); // Rekursiv nächstes Item
        }, estimatedDuration);
    }

    clearQueue() {
        this.queue = [];
        this.api.log('TTS queue cleared');
    }

    async destroy() {
        this.api.log('TTS Plugin shutting down...');
        this.clearQueue();
    }
}

module.exports = TTSPlugin;
