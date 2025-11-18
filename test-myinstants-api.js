/**
 * Test script to check MyInstants API
 */

const axios = require('axios');

async function testCurrentAPI() {
    console.log('Testing current MyInstants API (myinstants-api.vercel.app)...\n');
    
    try {
        const response = await axios.get('https://myinstants-api.vercel.app/search', {
            params: {
                q: 'wow',
                page: 1,
                limit: 5
            },
            timeout: 10000
        });
        
        console.log('✅ API Response Status:', response.status);
        console.log('✅ API Response Structure:');
        console.log(JSON.stringify(response.data, null, 2));
        
        if (response.data && response.data.data && Array.isArray(response.data.data)) {
            console.log('\n✅ Found', response.data.data.length, 'sounds');
            response.data.data.forEach((sound, idx) => {
                console.log(`\nSound ${idx + 1}:`);
                console.log('  Name:', sound.title || sound.name);
                console.log('  MP3 URL:', sound.mp3 || sound.sound);
                console.log('  ID:', sound.id);
            });
        }
    } catch (error) {
        console.log('❌ API Error:', error.message);
        if (error.response) {
            console.log('Response Status:', error.response.status);
            console.log('Response Data:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

async function testTrendingAPI() {
    console.log('\n\nTesting trending endpoint...\n');
    
    try {
        const response = await axios.get('https://myinstants-api.vercel.app/trending', {
            params: { limit: 5 },
            timeout: 10000
        });
        
        console.log('✅ Trending API Response Status:', response.status);
        console.log('✅ Trending API Response Structure:');
        console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.log('❌ Trending API Error:', error.message);
        if (error.response) {
            console.log('Response Status:', error.response.status);
        }
    }
}

async function main() {
    await testCurrentAPI();
    await testTrendingAPI();
}

main();
