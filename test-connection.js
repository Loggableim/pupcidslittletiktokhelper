const { TikTokLiveConnection } = require('tiktok-live-connector');

// Test connection to a known live user
const username = 'pupcid'; // or another username you know is live

console.log(`Testing connection to @${username}...`);

const connection = new TikTokLiveConnection(username, {
    processInitialData: true,
    enableExtendedGiftInfo: true,
    requestPollingIntervalMs: 1000
});

connection.connect()
    .then(state => {
        console.log('✅ Connected successfully!');
        console.log('Room ID:', state.roomId);
        console.log('Room Info keys:', Object.keys(state.roomInfo || {}));
        
        // Disconnect after 5 seconds
        setTimeout(() => {
            connection.disconnect();
            console.log('Disconnected');
            process.exit(0);
        }, 5000);
    })
    .catch(err => {
        console.error('❌ Connection failed:', err.message);
        console.error('Full error:', err);
        process.exit(1);
    });

connection.on('connected', () => {
    console.log('Event: connected');
});

connection.on('disconnected', () => {
    console.log('Event: disconnected');
});

connection.on('error', (err) => {
    console.error('Event: error', err);
});

