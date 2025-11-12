/**
 * Soundboard Test Script
 *
 * Testet die Soundboard-Funktionalität durch Simulation von TikTok-Events
 *
 * Usage: node test-soundboard.js
 */

const io = require('socket.io-client');
const readline = require('readline');

// Server-Konfiguration
const SERVER_URL = 'http://localhost:3000';

// Socket.io Client
let socket;

// Console Interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Test-Sound-URLs (MyInstants)
const TEST_SOUNDS = {
    gift: 'https://www.myinstants.com/media/sounds/wow.mp3',
    follow: 'https://www.myinstants.com/media/sounds/tada-fanfare-a-6313.mp3',
    subscribe: 'https://www.myinstants.com/media/sounds/success-fanfare-trumpets-6185.mp3',
    share: 'https://www.myinstants.com/media/sounds/message-alert.mp3',
    like: 'https://www.myinstants.com/media/sounds/ding-sound-effect_2.mp3'
};

console.log('🎵 Soundboard Test Tool\n');
console.log('Connecting to server:', SERVER_URL);

// Verbinde mit Server
socket = io(SERVER_URL, {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5
});

socket.on('connect', () => {
    console.log('✅ Connected to server\n');
    showMenu();
});

socket.on('disconnect', () => {
    console.log('❌ Disconnected from server');
});

socket.on('connect_error', (error) => {
    console.error('❌ Connection error:', error.message);
    process.exit(1);
});

// Lausche auf Soundboard-Events (zur Verifikation)
socket.on('soundboard:play', (data) => {
    console.log('🔊 [SERVER] Soundboard event received:', {
        label: data.label,
        url: data.url,
        volume: data.volume
    });
});

function showMenu() {
    console.log('\n=== SOUNDBOARD TEST MENU ===');
    console.log('1. Test Gift Sound');
    console.log('2. Test Follow Sound');
    console.log('3. Test Subscribe Sound');
    console.log('4. Test Share Sound');
    console.log('5. Test Like Sound (with threshold)');
    console.log('6. Test Custom Sound URL');
    console.log('7. Test Multiple Sounds (Overlap)');
    console.log('8. Test Sequential Queue');
    console.log('9. Check Soundboard Status');
    console.log('0. Exit');
    console.log('============================\n');

    rl.question('Select option: ', (answer) => {
        handleMenuChoice(answer.trim());
    });
}

function handleMenuChoice(choice) {
    switch (choice) {
        case '1':
            testGiftSound();
            break;
        case '2':
            testFollowSound();
            break;
        case '3':
            testSubscribeSound();
            break;
        case '4':
            testShareSound();
            break;
        case '5':
            testLikeSound();
            break;
        case '6':
            testCustomSound();
            break;
        case '7':
            testMultipleSounds();
            break;
        case '8':
            testSequentialQueue();
            break;
        case '9':
            checkStatus();
            break;
        case '0':
            console.log('Exiting...');
            socket.disconnect();
            rl.close();
            process.exit(0);
            break;
        default:
            console.log('Invalid choice');
            showMenu();
    }
}

function testGiftSound() {
    console.log('\n🎁 Testing Gift Sound...');

    // Simuliere ein Gift-Event
    socket.emit('soundboard:play', {
        url: TEST_SOUNDS.gift,
        volume: 1.0,
        label: 'Test Gift Sound'
    });

    console.log('✅ Gift sound test triggered');

    setTimeout(showMenu, 2000);
}

function testFollowSound() {
    console.log('\n⭐ Testing Follow Sound...');

    socket.emit('soundboard:play', {
        url: TEST_SOUNDS.follow,
        volume: 1.0,
        label: 'Test Follow Sound'
    });

    console.log('✅ Follow sound test triggered');

    setTimeout(showMenu, 2000);
}

function testSubscribeSound() {
    console.log('\n🌟 Testing Subscribe Sound...');

    socket.emit('soundboard:play', {
        url: TEST_SOUNDS.subscribe,
        volume: 1.0,
        label: 'Test Subscribe Sound'
    });

    console.log('✅ Subscribe sound test triggered');

    setTimeout(showMenu, 2000);
}

function testShareSound() {
    console.log('\n🔄 Testing Share Sound...');

    socket.emit('soundboard:play', {
        url: TEST_SOUNDS.share,
        volume: 1.0,
        label: 'Test Share Sound'
    });

    console.log('✅ Share sound test triggered');

    setTimeout(showMenu, 2000);
}

function testLikeSound() {
    console.log('\n👍 Testing Like Sound...');

    socket.emit('soundboard:play', {
        url: TEST_SOUNDS.like,
        volume: 1.0,
        label: 'Test Like Sound'
    });

    console.log('✅ Like sound test triggered');

    setTimeout(showMenu, 2000);
}

function testCustomSound() {
    rl.question('\nEnter sound URL: ', (url) => {
        if (!url) {
            console.log('❌ URL required');
            showMenu();
            return;
        }

        rl.question('Enter volume (0.0-1.0, default 1.0): ', (volumeStr) => {
            const volume = parseFloat(volumeStr) || 1.0;

            console.log(`\n🔊 Testing Custom Sound: ${url}`);

            socket.emit('soundboard:play', {
                url: url,
                volume: volume,
                label: 'Custom Test Sound'
            });

            console.log('✅ Custom sound test triggered');

            setTimeout(showMenu, 2000);
        });
    });
}

function testMultipleSounds() {
    console.log('\n🎶 Testing Multiple Overlapping Sounds...');

    const sounds = [
        { url: TEST_SOUNDS.gift, label: 'Sound 1' },
        { url: TEST_SOUNDS.follow, label: 'Sound 2' },
        { url: TEST_SOUNDS.subscribe, label: 'Sound 3' }
    ];

    sounds.forEach((sound, index) => {
        setTimeout(() => {
            socket.emit('soundboard:play', {
                url: sound.url,
                volume: 0.7,
                label: sound.label
            });
            console.log(`✅ Triggered ${sound.label}`);
        }, index * 500); // 500ms zwischen jedem Sound
    });

    console.log('✅ Multiple sounds test triggered');

    setTimeout(showMenu, 3000);
}

function testSequentialQueue() {
    console.log('\n📋 Testing Sequential Queue...');
    console.log('(Note: Queue mode must be set to "sequential" in frontend)');

    const sounds = [
        { url: TEST_SOUNDS.gift, label: 'Queue Sound 1' },
        { url: TEST_SOUNDS.follow, label: 'Queue Sound 2' },
        { url: TEST_SOUNDS.subscribe, label: 'Queue Sound 3' }
    ];

    sounds.forEach((sound, index) => {
        setTimeout(() => {
            socket.emit('soundboard:play', {
                url: sound.url,
                volume: 1.0,
                label: sound.label
            });
            console.log(`✅ Queued ${sound.label}`);
        }, index * 100); // 100ms zwischen jedem Sound
    });

    console.log('✅ Sequential queue test triggered');

    setTimeout(showMenu, 2000);
}

function checkStatus() {
    console.log('\n📊 Checking Soundboard Status...');

    // Frage Audio-Status an
    socket.emit('audio:get-status');

    socket.once('audio:status', (status) => {
        console.log('Audio Engine Status:', status);
    });

    // Frage Queue-Status an (via HTTP)
    fetch(`${SERVER_URL}/api/soundboard/queue`)
        .then(res => res.json())
        .then(data => {
            console.log('Queue Status:', data);
        })
        .catch(err => {
            console.error('❌ Error fetching queue status:', err.message);
        })
        .finally(() => {
            setTimeout(showMenu, 2000);
        });
}

// Graceful Shutdown
process.on('SIGINT', () => {
    console.log('\n\nShutting down...');
    socket.disconnect();
    rl.close();
    process.exit(0);
});
