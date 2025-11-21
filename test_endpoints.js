const axios = require('axios');

// Test endpoints to check which ones are working
const endpoints = [
    // Current endpoints in code
    'https://api16-core-c-useast1a.tiktokv.com/media/api/text/speech/invoke/',
    'https://api19-core-c-useast1a.tiktokv.com/media/api/text/speech/invoke/',
    'https://api16-core-useast5.us.tiktokv.com/media/api/text/speech/invoke/',
    'https://api22-core-c-alisg.tiktokv.com/media/api/text/speech/invoke/',
    
    // Normal variants from web search
    'https://api16-normal-c-useast1a.tiktokv.com/media/api/text/speech/invoke/',
    'https://api19-normal-c-useast1a.tiktokv.com/media/api/text/speech/invoke/',
    'https://api16-normal-useast5.us.tiktokv.com/media/api/text/speech/invoke/',
    'https://api22-normal-c-alisg.tiktokv.com/media/api/text/speech/invoke/',
    
    // Additional variants
    'https://api16-normal-c-alisg.tiktokv.com/media/api/text/speech/invoke/',
    'https://api16-core-c-alisg.tiktokv.com/media/api/text/speech/invoke/',
    'https://api16-normal-c-useast2a.tiktokv.com/media/api/text/speech/invoke/',
];

const testSessionId = 'd0613ed4ad91345d1b376a1d21f6dd1a'; // Fallback from code

async function testEndpoint(url) {
    const params = new URLSearchParams({
        text_speaker: 'en_us_001',
        req_text: 'test',
        speaker_map_type: '0',
        aid: '1233'
    });
    
    try {
        const response = await axios.post(url, params.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'com.zhiliaoapp.musically/2023400040 (Linux; U; Android 13; en_US; Pixel 7; Build/TQ3A.230805.001; tt-ok/3.12.13.4)',
                'Accept': '*/*',
                'Cookie': `sessionid=${testSessionId}`
            },
            timeout: 5000,
            responseType: 'json'
        });
        
        if (response.data && response.data.status_code === 0) {
            return { working: true, status: response.status, message: 'SUCCESS' };
        } else {
            return { working: false, status: response.status, message: `Status code: ${response.data?.status_code || 'unknown'}` };
        }
    } catch (error) {
        if (error.response) {
            return { working: false, status: error.response.status, message: error.response.statusText || error.message };
        } else {
            return { working: false, status: 'TIMEOUT/ERROR', message: error.message };
        }
    }
}

async function testAllEndpoints() {
    console.log('Testing TikTok TTS endpoints...\n');
    
    for (const endpoint of endpoints) {
        const result = await testEndpoint(endpoint);
        const status = result.working ? '✅ WORKING' : '❌ FAILED';
        console.log(`${status} [${result.status}] ${endpoint}`);
        console.log(`   ${result.message}\n`);
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 500));
    }
}

testAllEndpoints().catch(console.error);
