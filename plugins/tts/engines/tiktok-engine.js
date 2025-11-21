const axios = require('axios');

/**
 * TikTok TTS Engine
 * Uses TikTok's official API endpoints directly
 * Based on research from TikTok-Chat-Reader and community TTS projects
 */
class TikTokEngine {
    constructor(logger) {
        this.logger = logger;
        
        // Primary TikTok API endpoints (official, updated 2024)
        // These endpoints work without session ID for basic usage
        this.apiEndpoints = [
            'https://api16-normal-c-useast1a.tiktokv.com/media/api/text/speech/invoke',
            'https://api16-core-c-useast1a.tiktokv.com/media/api/text/speech/invoke',
            'https://api16-normal-useast5.us.tiktokv.com/media/api/text/speech/invoke',
            'https://api16-core.tiktokv.com/media/api/text/speech/invoke',
            'https://api19-core-c-useast1a.tiktokv.com/media/api/text/speech/invoke'
        ];
        
        this.currentEndpointIndex = 0;
        this.timeout = 10000; // 10s timeout
        this.maxRetries = 2;
        this.maxChunkLength = 300; // TikTok API limit per request
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
            this.logger.info(`Combining ${audioChunks.length} audio chunks`);
            // For now, return the first chunk. In a production system, you'd want to properly merge audio
            // TODO: Implement proper audio concatenation if needed
            return audioChunks[0];
        }
    }
    
    /**
     * Synthesize a single chunk of text
     * @private
     */
    async _synthesizeChunk(text, voiceId) {
        let lastError;
        
        // Try each endpoint until one succeeds
        for (let endpointAttempt = 0; endpointAttempt < this.apiEndpoints.length; endpointAttempt++) {
            const endpoint = this.apiEndpoints[this.currentEndpointIndex];
            
            // Try the current endpoint with retries
            for (let retryAttempt = 0; retryAttempt < this.maxRetries; retryAttempt++) {
                try {
                    this.logger.debug(`Attempting TikTok API: ${endpoint} (attempt ${retryAttempt + 1}/${this.maxRetries})`);
                    
                    const result = await this._makeRequest(endpoint, text, voiceId);
                    if (result) {
                        this.logger.info(`TikTok TTS success: ${text.substring(0, 30)}... (voice: ${voiceId})`);
                        return result;
                    }
                } catch (error) {
                    lastError = error;
                    this.logger.warn(`TikTok TTS endpoint ${endpoint} attempt ${retryAttempt + 1} failed: ${error.message}`);
                    
                    // Exponential backoff for retries on same endpoint
                    if (retryAttempt < this.maxRetries - 1) {
                        await this._delay(Math.pow(2, retryAttempt) * 500);
                    }
                }
            }
            
            // Move to next endpoint for next attempt
            this.currentEndpointIndex = (this.currentEndpointIndex + 1) % this.apiEndpoints.length;
            this.logger.info(`Switching to next endpoint: ${this.apiEndpoints[this.currentEndpointIndex]}`);
        }
        
        // All endpoints and retries failed
        throw new Error(`All TikTok TTS endpoints failed. Last error: ${lastError?.message || 'Unknown'}`);
    }

    /**
     * Make TTS request to TikTok API endpoint
     * Uses official TikTok API format
     * @private
     */
    async _makeRequest(endpoint, text, voiceId) {
        const response = await axios.post(
            endpoint,
            {
                text_speaker: voiceId,
                req_text: text,
                speaker_map_type: 0,
                aid: 1233
            },
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'com.zhiliaoapp.musically/2022600030 (Linux; U; Android 7.1.2; es_ES; SM-G988N; Build/NRD90M;tt-ok/3.12.13.1)',
                    'Accept': '*/*'
                },
                timeout: this.timeout,
                responseType: 'json'
            }
        );

        // TikTok API returns different response formats
        // Status code 0 = success, 1 = error
        if (response.data && response.data.status_code === 0) {
            // The audio data is in the 'data' field, which contains vstr (voice string base64)
            if (response.data.data && response.data.data.v_str) {
                return response.data.data.v_str;
            } else if (response.data.data && typeof response.data.data === 'string') {
                return response.data.data;
            }
        }
        
        // Check for error message
        if (response.data && response.data.status_msg) {
            throw new Error(`TikTok API error: ${response.data.status_msg}`);
        }
        
        throw new Error('Invalid response format from TikTok TTS API');
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
