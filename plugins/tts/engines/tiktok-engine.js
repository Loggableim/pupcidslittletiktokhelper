const axios = require('axios');

/**
 * TikTok TTS Engine
 * Uses TikTok's official API endpoints with SessionID authentication
 * Based on research from TikTok-Chat-Reader and community TTS projects
 * 
 * ✅ SOLUTION (November 2024):
 * TikTok TTS requires a valid SessionID from a logged-in TikTok account.
 * 
 * HOW TO GET YOUR SESSION ID:
 * 1. Log in to TikTok in your browser (https://www.tiktok.com)
 * 2. Open Developer Tools (F12)
 * 3. Go to Application > Cookies > https://www.tiktok.com
 * 4. Find the 'sessionid' cookie and copy its value
 * 5. Set it in the TTS plugin settings or environment variable TIKTOK_SESSION_ID
 * 
 * The SessionID must be refreshed periodically (weekly/monthly) as it expires.
 * 
 * ALTERNATIVE: If you don't want to use SessionID:
 * 1. Google Cloud TTS (requires API key, very reliable)
 * 2. ElevenLabs TTS (requires API key, high quality)
 * 3. Browser SpeechSynthesis (client-side, free, no setup)
 */
class TikTokEngine {
    constructor(logger, config = {}) {
        this.logger = logger;
        this.config = config;
        
        // Get SessionID from config, environment, or database
        this.sessionId = config.sessionId || process.env.TIKTOK_SESSION_ID || null;
        
        // Direct TikTok API endpoints (require SessionID for authentication)
        // These are the working endpoints as of November 2024
        this.apiEndpoints = [
            {
                url: 'https://api16-normal-useast5.us.tiktokv.com/media/api/text/speech/invoke',
                type: 'official',
                format: 'tiktok',
                requiresAuth: true
            },
            {
                url: 'https://api22-normal-c-alisg.tiktokv.com/media/api/text/speech/invoke',
                type: 'official',
                format: 'tiktok',
                requiresAuth: true
            },
            {
                url: 'https://api16-normal-c-useast2a.tiktokv.com/media/api/text/speech/invoke',
                type: 'official',
                format: 'tiktok',
                requiresAuth: true
            }
        ];
        
        this.currentEndpointIndex = 0;
        this.timeout = 10000; // 10s timeout
        this.maxRetries = 1; // One retry per endpoint
        this.maxChunkLength = 300; // TikTok API limit per request
        
        // Log SessionID status
        if (this.sessionId) {
            this.logger.info(`✅ TikTok SessionID configured (${this.sessionId.substring(0, 8)}...)`);
        } else {
            this.logger.warn('⚠️  No TikTok SessionID configured. TikTok TTS will not work.');
            this.logger.warn('💡 To fix: Set TIKTOK_SESSION_ID environment variable or configure in TTS settings.');
            this.logger.warn('📚 See: plugins/tts/engines/TIKTOK_TTS_STATUS.md for instructions.');
        }
    }

    /**
     * Get all available voices for TikTok TTS
     */
    static getVoices() {
        return {
            // English - Characters/Disney
            'en_us_ghostface': { name: 'Ghostface (Scream)', lang: 'en', gender: 'male', style: 'character' },
            'en_us_chewbacca': { name: 'Chewbacca', lang: 'en', gender: 'male', style: 'character' },
            'en_us_c3po': { name: 'C3PO', lang: 'en', gender: 'male', style: 'character' },
            'en_us_stitch': { name: 'Stitch', lang: 'en', gender: 'male', style: 'character' },
            'en_us_stormtrooper': { name: 'Stormtrooper', lang: 'en', gender: 'male', style: 'character' },
            'en_us_rocket': { name: 'Rocket', lang: 'en', gender: 'male', style: 'character' },

            // English - Standard
            'en_male_narration': { name: 'Male Narrator', lang: 'en', gender: 'male', style: 'narration' },
            'en_male_funny': { name: 'Male Funny', lang: 'en', gender: 'male', style: 'funny' },
            'en_female_emotional': { name: 'Female Emotional', lang: 'en', gender: 'female', style: 'emotional' },
            'en_female_samc': { name: 'Female Friendly', lang: 'en', gender: 'female', style: 'friendly' },
            'en_us_001': { name: 'US Female 1', lang: 'en', gender: 'female', style: 'standard' },
            'en_us_002': { name: 'US Female 2', lang: 'en', gender: 'female', style: 'standard' },
            'en_us_006': { name: 'US Male 1', lang: 'en', gender: 'male', style: 'standard' },
            'en_us_007': { name: 'US Male 2', lang: 'en', gender: 'male', style: 'standard' },
            'en_us_009': { name: 'US Male 3', lang: 'en', gender: 'male', style: 'standard' },
            'en_us_010': { name: 'US Male 4', lang: 'en', gender: 'male', style: 'standard' },
            'en_uk_001': { name: 'UK Male 1', lang: 'en', gender: 'male', style: 'british' },
            'en_uk_003': { name: 'UK Female 1', lang: 'en', gender: 'female', style: 'british' },
            'en_au_001': { name: 'Australian Female', lang: 'en', gender: 'female', style: 'australian' },
            'en_au_002': { name: 'Australian Male', lang: 'en', gender: 'male', style: 'australian' },

            // German
            'de_001': { name: 'Deutsch Männlich', lang: 'de', gender: 'male', style: 'standard' },
            'de_002': { name: 'Deutsch Weiblich', lang: 'de', gender: 'female', style: 'standard' },

            // Spanish
            'es_002': { name: 'Español Male', lang: 'es', gender: 'male', style: 'standard' },
            'es_mx_002': { name: 'Español MX Female', lang: 'es', gender: 'female', style: 'mexican' },

            // French
            'fr_001': { name: 'Français Male', lang: 'fr', gender: 'male', style: 'standard' },
            'fr_002': { name: 'Français Female', lang: 'fr', gender: 'female', style: 'standard' },

            // Portuguese
            'pt_female': { name: 'Português Female', lang: 'pt', gender: 'female', style: 'standard' },
            'br_003': { name: 'Português BR Female', lang: 'pt', gender: 'female', style: 'brazilian' },
            'br_004': { name: 'Português BR Male', lang: 'pt', gender: 'male', style: 'brazilian' },
            'br_005': { name: 'Português BR Friendly', lang: 'pt', gender: 'female', style: 'friendly' },

            // Italian
            'it_male_m18': { name: 'Italiano Male', lang: 'it', gender: 'male', style: 'standard' },

            // Japanese
            'jp_001': { name: '日本語 Female', lang: 'ja', gender: 'female', style: 'standard' },
            'jp_003': { name: '日本語 Male', lang: 'ja', gender: 'male', style: 'standard' },
            'jp_005': { name: '日本語 Energetic', lang: 'ja', gender: 'female', style: 'energetic' },
            'jp_006': { name: '日本語 Calm', lang: 'ja', gender: 'male', style: 'calm' },

            // Korean
            'kr_002': { name: '한국어 Male', lang: 'ko', gender: 'male', style: 'standard' },
            'kr_003': { name: '한국어 Female', lang: 'ko', gender: 'female', style: 'standard' },
            'kr_004': { name: '한국어 Bright', lang: 'ko', gender: 'female', style: 'bright' },

            // Indonesian
            'id_001': { name: 'Bahasa Indonesia Female', lang: 'id', gender: 'female', style: 'standard' },

            // Others
            'nl_001': { name: 'Nederlands Male', lang: 'nl', gender: 'male', style: 'standard' },
            'pl_001': { name: 'Polski Female', lang: 'pl', gender: 'female', style: 'standard' },
            'ru_female': { name: 'Русский Female', lang: 'ru', gender: 'female', style: 'standard' },
            'tr_female': { name: 'Türkçe Female', lang: 'tr', gender: 'female', style: 'standard' },
            'vi_female': { name: 'Tiếng Việt Female', lang: 'vi', gender: 'female', style: 'standard' },
            'th_female': { name: 'ภาษาไทย Female', lang: 'th', gender: 'female', style: 'standard' },
            'ar_male': { name: 'العربية Male', lang: 'ar', gender: 'male', style: 'standard' },
            'zh_CN_female': { name: '中文 Female', lang: 'zh', gender: 'female', style: 'standard' },
            'zh_CN_male': { name: '中文 Male', lang: 'zh', gender: 'male', style: 'standard' }
        };
    }

    /**
     * Get default voice for a language
     */
    static getDefaultVoiceForLanguage(langCode) {
        const languageDefaults = {
            'de': 'de_002',
            'en': 'en_us_001',
            'es': 'es_002',
            'fr': 'fr_002',
            'pt': 'br_003',
            'it': 'it_male_m18',
            'ja': 'jp_001',
            'ko': 'kr_003',
            'zh': 'zh_CN_female',
            'ru': 'ru_female',
            'ar': 'ar_male',
            'tr': 'tr_female',
            'vi': 'vi_female',
            'th': 'th_female',
            'nl': 'nl_001',
            'pl': 'pl_001',
            'id': 'id_001'
        };

        return languageDefaults[langCode] || 'en_us_001';
    }

    /**
     * Generate TTS audio from text
     * @param {string} text - Text to synthesize
     * @param {string} voiceId - TikTok voice ID
     * @returns {Promise<string>} Base64-encoded MP3 audio
     */
    async synthesize(text, voiceId) {
        // Split text into chunks if it exceeds the limit
        const chunks = this._splitTextIntoChunks(text, this.maxChunkLength);
        
        if (chunks.length > 1) {
            this.logger.info(`Text split into ${chunks.length} chunks for TTS processing`);
        }
        
        // Process each chunk and combine results
        const audioChunks = [];
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            this.logger.debug(`Processing chunk ${i + 1}/${chunks.length}: "${chunk.substring(0, 30)}..."`);
            
            const audioData = await this._synthesizeChunk(chunk, voiceId);
            audioChunks.push(audioData);
        }
        
        // If multiple chunks, concatenate them (simple concatenation for base64)
        // Note: This is a simple approach. For perfect audio joining, decode->join->encode would be better
        if (audioChunks.length === 1) {
            return audioChunks[0];
        } else {
            this.logger.warn(`Text was split into ${audioChunks.length} chunks. Only the first chunk will be returned.`);
            this.logger.warn(`For best results, keep TTS messages under 300 characters.`);
            // TODO: Implement proper audio concatenation by decoding base64, joining MP3 files, re-encoding
            // For now, return the first chunk to ensure some audio is played
            return audioChunks[0];
        }
    }
    
    /**
     * Synthesize a single chunk of text
     * @private
     */
    async _synthesizeChunk(text, voiceId) {
        // Check if SessionID is required and available
        if (!this.sessionId) {
            const errorMessage = 'TikTok TTS requires a SessionID. Please configure TIKTOK_SESSION_ID environment variable or set it in TTS settings.';
            this.logger.error(errorMessage);
            this.logger.error('📚 Instructions: See plugins/tts/engines/TIKTOK_TTS_STATUS.md');
            this.logger.error('💡 Alternative: Use Google Cloud TTS, ElevenLabs, or browser SpeechSynthesis instead.');
            throw new Error(errorMessage);
        }
        
        let lastError;
        
        // Try each endpoint until one succeeds
        for (let endpointAttempt = 0; endpointAttempt < this.apiEndpoints.length; endpointAttempt++) {
            const endpointConfig = this.apiEndpoints[this.currentEndpointIndex];
            
            // Try the current endpoint with retries
            for (let retryAttempt = 0; retryAttempt < this.maxRetries; retryAttempt++) {
                try {
                    this.logger.debug(`Attempting ${endpointConfig.type} TTS: ${endpointConfig.url} (attempt ${retryAttempt + 1}/${this.maxRetries})`);
                    
                    const result = await this._makeRequest(endpointConfig, text, voiceId);
                    if (result) {
                        this.logger.info(`✅ TikTok TTS success via ${endpointConfig.type}: ${text.substring(0, 30)}... (voice: ${voiceId})`);
                        return result;
                    }
                } catch (error) {
                    lastError = error;
                    this.logger.warn(`TikTok TTS ${endpointConfig.type} endpoint failed: ${error.message}`);
                    
                    // Small backoff for retries on same endpoint
                    if (retryAttempt < this.maxRetries - 1) {
                        await this._delay(500);
                    }
                }
            }
            
            // Move to next endpoint for next attempt
            this.currentEndpointIndex = (this.currentEndpointIndex + 1) % this.apiEndpoints.length;
        }
        
        // All endpoints and retries failed
        const errorMessage = `All TikTok TTS endpoints failed. Last error: ${lastError?.message || 'Unknown'}`;
        this.logger.error(errorMessage);
        this.logger.error('Tried endpoints:', this.apiEndpoints.map(e => `${e.type}:${e.url}`).join(', '));
        this.logger.error('❌ TikTok TTS failed. Possible causes:');
        this.logger.error('   1. Invalid or expired SessionID - Get a fresh one from TikTok cookies');
        this.logger.error('   2. TikTok changed their API - Check for updates');
        this.logger.error('   3. Network/firewall blocking TikTok domains');
        this.logger.error('💡 Quick fix: Update your TIKTOK_SESSION_ID in settings');
        this.logger.error('📚 See: plugins/tts/engines/TIKTOK_TTS_STATUS.md for full instructions');
        throw new Error(errorMessage);
    }

    /**
     * Make TTS request to endpoint
     * Handles different API formats (proxy services vs official TikTok API)
     * @private
     */
    async _makeRequest(endpointConfig, text, voiceId) {
        const { url, type, format } = endpointConfig;
        
        let requestConfig;
        let requestData;
        
        // Configure request based on endpoint format
        switch (format) {
            case 'weilnet':
                // Weilnet Workers endpoint format
                requestData = {
                    text: text,
                    voice: voiceId
                };
                requestConfig = {
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'TikTokLiveStreamTool/2.0'
                    },
                    timeout: this.timeout,
                    responseType: 'json'
                };
                break;
                
            case 'tikapi':
                // TikAPI format
                requestData = {
                    text: text,
                    voice: voiceId
                };
                requestConfig = {
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'TikTokLiveStreamTool/2.0'
                    },
                    timeout: this.timeout,
                    responseType: 'json'
                };
                break;
                
            case 'tiktok':
                // Official TikTok API format with SessionID authentication
                // Note: aid (Application ID) parameter is required by TikTok's internal API
                // Common values: 1233 (TikTok app), 1180 (TikTok Lite)
                const params = new URLSearchParams({
                    text_speaker: voiceId,
                    req_text: text,
                    speaker_map_type: '0',
                    aid: '1233' // Application ID for TikTok
                });
                requestData = params.toString();
                requestConfig = {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        // Using a recent Android User-Agent string
                        // Format: app_name/version (OS; device_info; Build/build_id; api_version)
                        'User-Agent': 'com.zhiliaoapp.musically/2023400040 (Linux; U; Android 13; en_US; Pixel 7; Build/TQ3A.230805.001; tt-ok/3.12.13.4)',
                        'Accept': '*/*',
                        // CRITICAL: SessionID cookie is required for authentication
                        'Cookie': `sessionid=${this.sessionId}`
                    },
                    timeout: this.timeout,
                    responseType: 'json'
                };
                break;
                
            default:
                throw new Error(`Unknown endpoint format: ${format}`);
        }
        
        const response = await axios.post(url, requestData, requestConfig);
        
        // Handle different response formats
        return this._extractAudioData(response.data, format);
    }
    
    /**
     * Extract audio data from response based on format
     * @private
     */
    _extractAudioData(data, format) {
        switch (format) {
            case 'weilnet':
                // Weilnet returns: { success: true, data: "base64..." }
                if (data && data.success && data.data) {
                    return data.data;
                } else if (data && data.data) {
                    return data.data;
                }
                break;
                
            case 'tikapi':
                // TikAPI returns: { audio: "base64..." } or { audioContent: "base64..." }
                if (data && data.audio) {
                    return data.audio;
                } else if (data && data.audioContent) {
                    return data.audioContent;
                }
                break;
                
            case 'tiktok':
                // Official TikTok API returns: { status_code: 0, data: { v_str: "base64..." } }
                if (data && data.status_code === 0) {
                    if (data.data && data.data.v_str) {
                        return data.data.v_str;
                    } else if (data.data && typeof data.data === 'string') {
                        return data.data;
                    }
                }
                // Check for error message
                if (data && data.status_msg) {
                    throw new Error(`TikTok API error: ${data.status_msg}`);
                }
                break;
        }
        
        // Fallback: try to find base64 data in common response fields
        if (typeof data === 'string' && data.length > 100) {
            return data;
        }
        
        throw new Error(`Invalid response format from ${format} TTS endpoint`);
    }
    
    /**
     * Split text into chunks that fit within TikTok's character limit
     * @private
     */
    _splitTextIntoChunks(text, maxLength) {
        if (text.length <= maxLength) {
            return [text];
        }
        
        const chunks = [];
        let currentChunk = '';
        
        // Split by sentences first (period, exclamation, question mark)
        const sentences = text.split(/([.!?]+\s+)/);
        
        for (const sentence of sentences) {
            if ((currentChunk + sentence).length <= maxLength) {
                currentChunk += sentence;
            } else {
                if (currentChunk) {
                    chunks.push(currentChunk.trim());
                }
                
                // If a single sentence is too long, split by words
                if (sentence.length > maxLength) {
                    const words = sentence.split(' ');
                    currentChunk = '';
                    
                    for (const word of words) {
                        if ((currentChunk + ' ' + word).length <= maxLength) {
                            currentChunk += (currentChunk ? ' ' : '') + word;
                        } else {
                            if (currentChunk) {
                                chunks.push(currentChunk.trim());
                            }
                            currentChunk = word;
                        }
                    }
                } else {
                    currentChunk = sentence;
                }
            }
        }
        
        if (currentChunk) {
            chunks.push(currentChunk.trim());
        }
        
        return chunks.filter(c => c.length > 0);
    }

    /**
     * Helper: Delay promise
     */
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Test if engine is available
     */
    async test() {
        try {
            await this.synthesize('Test', 'en_us_001');
            return true;
        } catch (error) {
            this.logger.error(`TikTok TTS engine test failed: ${error.message}`);
            return false;
        }
    }
}

module.exports = TikTokEngine;
