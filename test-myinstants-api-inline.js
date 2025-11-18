const axios = require('axios');

async function testAPI() {
    console.log('Testing MyInstants API endpoints...\n');
    
    // Test 1: Search
    console.log('1. Testing search endpoint...');
    try {
        const searchRes = await axios.get('https://myinstants-api.vercel.app/search', {
            params: { q: 'test', limit: 2 },
            timeout: 5000
        });
        console.log('✅ Search API works!');
        console.log('Response:', JSON.stringify(searchRes.data, null, 2));
    } catch (error) {
        console.log('❌ Search API failed:', error.message);
        if (error.response) {
            console.log('Status:', error.response.status);
            console.log('Data:', error.response.data);
        }
    }
    
    console.log('\n2. Testing trending endpoint...');
    try {
        const trendingRes = await axios.get('https://myinstants-api.vercel.app/trending', {
            params: { limit: 2 },
            timeout: 5000
        });
        console.log('✅ Trending API works!');
        console.log('Response:', JSON.stringify(trendingRes.data, null, 2));
    } catch (error) {
        console.log('❌ Trending API failed:', error.message);
    }
    
    console.log('\n3. Testing random endpoint...');
    try {
        const randomRes = await axios.get('https://myinstants-api.vercel.app/random', {
            params: { limit: 2 },
            timeout: 5000
        });
        console.log('✅ Random API works!');
        console.log('Response:', JSON.stringify(randomRes.data, null, 2));
    } catch (error) {
        console.log('❌ Random API failed:', error.message);
    }
    
    // Test alternative: Direct scraping
    console.log('\n4. Testing direct MyInstants.com scraping...');
    try {
        const pageRes = await axios.get('https://www.myinstants.com/en/search/?name=wow', {
            timeout: 5000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        console.log('✅ Direct scraping works!');
        console.log('Page length:', pageRes.data.length);
        
        // Try to find sound buttons
        const soundMatches = pageRes.data.match(/onclick="play\('([^']+)'/g);
        if (soundMatches) {
            console.log('Found', soundMatches.length, 'sound buttons');
            console.log('First match:', soundMatches[0]);
        }
    } catch (error) {
        console.log('❌ Direct scraping failed:', error.message);
    }
}

testAPI();
