const axios = require('axios');

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

class TTSEngine {
    constructor(db, io) {
        this.db = db;
        this.io = io;
        this.queue = [];
        this.isPlaying = false;
        this.currentAudio = null;
        this.ttsApiUrl = 'https://tiktok-tts.weilnet.workers.dev/api/generation';
        this.blacklist = ['http', 'https', 'www.', '.com', '.de', '.org'];
        this.maxTextLength = 300;
    }

    static getVoices() {
        return TIKTOK_VOICES;
    }

    async speak(username, text, voiceOverride = null) {
        try {
            // Text filtern
            const filteredText = this.filterText(text);
            if (!filteredText || filteredText.trim().length === 0) {
                console.log('⚠️ TTS: Text filtered out or empty');
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

            // Audio generieren
            const audioData = await this.generateTTS(filteredText, voice);

            if (audioData) {
                // In Queue einreihen
                this.queue.push({
                    username,
                    text: filteredText,
                    voice,
                    audioData,
                    timestamp: Date.now()
                });

                console.log(`🔊 TTS queued: "${filteredText}" (Voice: ${voice})`);

                // Verarbeitung starten
                this.processQueue();
            }

        } catch (error) {
            console.error('❌ TTS Error:', error.message);
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

    async generateTTS(text, voice) {
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
                console.error('❌ TTS API: Invalid response format');
                return null;
            }

        } catch (error) {
            console.error('❌ TTS API Error:', error.message);

            // Fallback: Web Speech API könnte hier verwendet werden
            // aber das funktioniert nur im Browser, nicht auf Server-Seite

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

        console.log(`▶️ TTS playing: "${item.text}"`);

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
        console.log('🗑️ TTS queue cleared');
    }

    getQueueLength() {
        return this.queue.length;
    }

    setBlacklist(words) {
        this.blacklist = words;
    }

    addToBlacklist(word) {
        if (!this.blacklist.includes(word)) {
            this.blacklist.push(word);
        }
    }
}

module.exports = TTSEngine;
