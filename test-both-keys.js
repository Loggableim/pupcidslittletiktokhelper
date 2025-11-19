/**
 * Test beide EulerStream Schlüssel
 * Findet heraus welcher Schlüssel für WebSocket-Verbindungen funktioniert
 */

const { WebcastEventEmitter, createWebSocketUrl, ClientCloseCode } = require('@eulerstream/euler-websocket-sdk');
const WebSocket = require('ws');

// Die beiden verschiedenen Schlüssel
const API_KEY = 'euler_NTI1MTFmMmJkZmE2MTFmODA4Njk5NWVjZDA1NDk1OTUxZDMyNzE0NDIyYzJmZDVlZDRjOWU2';
const WEBHOOK_SECRET = '69247cb1f28bac46e315f650c64507e828acb4f61718b2bf5526c5fbbdebb7a8';
const USERNAME = 'tiktok'; // Fallback username

console.log('='.repeat(80));
console.log('EulerStream Schlüssel-Test');
console.log('='.repeat(80));
console.log('Teste beide Schlüssel um herauszufinden welcher für WebSocket funktioniert\n');

async function testKey(keyName, keyValue, username) {
    return new Promise((resolve) => {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`TEST: ${keyName}`);
        console.log(`${'='.repeat(80)}`);
        console.log(`Schlüssel: ${keyValue.substring(0, 20)}...${keyValue.substring(keyValue.length - 10)}`);
        console.log(`Username: @${username}`);
        console.log('');

        try {
            // Erstelle WebSocket URL
            const wsUrl = createWebSocketUrl({
                uniqueId: username,
                apiKey: keyValue,
                features: {
                    useEnterpriseApi: true
                }
            });

            console.log('✅ WebSocket URL erfolgreich erstellt');
            console.log(`   URL-Parameter enthalten: apiKey=${keyValue.substring(0, 15)}...`);
            console.log('');
            console.log('⏳ Verbinde zum WebSocket...');

            const ws = new WebSocket(wsUrl);
            let connected = false;
            let messagesReceived = 0;

            const timeout = setTimeout(() => {
                if (!connected) {
                    console.log('⏱️  Timeout - Keine Verbindung nach 10 Sekunden');
                    ws.close();
                }
            }, 10000);

            ws.on('open', () => {
                connected = true;
                clearTimeout(timeout);
                console.log('✅ WebSocket VERBUNDEN!');
                console.log('⏳ Warte auf Daten (10 Sekunden)...');
                
                setTimeout(() => {
                    console.log(`\n📊 ERGEBNIS: ${messagesReceived} Nachrichten empfangen`);
                    ws.close();
                }, 10000);
            });

            ws.on('close', (code, reason) => {
                clearTimeout(timeout);
                const reasonText = Buffer.isBuffer(reason) ? reason.toString('utf-8') : (reason || '');
                
                console.log('');
                console.log('🔴 WebSocket geschlossen');
                console.log(`   Code: ${code} (${ClientCloseCode[code] || 'UNKNOWN'})`);
                if (reasonText) {
                    console.log(`   Grund: ${reasonText}`);
                }
                console.log(`   Nachrichten empfangen: ${messagesReceived}`);
                
                let success = false;
                let errorMessage = '';

                if (code === 4401) {
                    errorMessage = '❌ INVALID_AUTH - Schlüssel ist ungültig oder falsch';
                } else if (code === 4400) {
                    errorMessage = '❌ INVALID_OPTIONS - Verbindungsparameter sind falsch';
                } else if (code === 4404) {
                    errorMessage = '⚠️  NOT_LIVE - User ist nicht live (aber Authentifizierung OK!)';
                    success = true; // Auth war erfolgreich
                } else if (code === 1000) {
                    errorMessage = '✅ Normale Beendigung';
                    success = true;
                } else {
                    errorMessage = `⚠️  Unbekannter Code: ${code}`;
                }

                console.log(`   ${errorMessage}`);
                
                resolve({
                    keyName,
                    success: success || messagesReceived > 0,
                    code,
                    messagesReceived,
                    errorMessage,
                    connected
                });
            });

            ws.on('error', (err) => {
                clearTimeout(timeout);
                console.log('❌ WebSocket Fehler:', err.message);
                resolve({
                    keyName,
                    success: false,
                    error: err.message,
                    messagesReceived: 0,
                    connected: false
                });
            });

            ws.on('message', (data) => {
                messagesReceived++;
                if (messagesReceived === 1) {
                    console.log('📨 Empfange Nachrichten vom Server!');
                }
                if (messagesReceived <= 3) {
                    const preview = data.toString().substring(0, 100);
                    console.log(`   Nachricht #${messagesReceived}: ${preview}...`);
                }
            });

            // Event Emitter testen
            const eventEmitter = new WebcastEventEmitter(ws);
            
            let eventsReceived = 0;
            const eventTypes = ['chat', 'gift', 'like', 'roomUser', 'social', 'share'];
            
            eventTypes.forEach(eventType => {
                eventEmitter.on(eventType, (data) => {
                    eventsReceived++;
                    console.log(`🎉 Event empfangen: ${eventType} (insgesamt ${eventsReceived} Events)`);
                });
            });

        } catch (error) {
            console.log('❌ FEHLER beim Erstellen der WebSocket URL:', error.message);
            resolve({
                keyName,
                success: false,
                error: error.message,
                messagesReceived: 0,
                connected: false
            });
        }
    });
}

// Teste beide Schlüssel nacheinander
async function runTests() {
    const results = [];
    
    // Test 1: API Key (euler_...)
    console.log('\n📋 TEST 1: API KEY (beginnt mit "euler_")');
    const result1 = await testKey('API Key (euler_...)', API_KEY, USERNAME);
    results.push(result1);
    
    // Kurze Pause
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 2: Webhook Secret
    console.log('\n📋 TEST 2: WEBHOOK SECRET (hexadezimal)');
    const result2 = await testKey('Webhook Secret', WEBHOOK_SECRET, USERNAME);
    results.push(result2);
    
    // Zusammenfassung
    console.log('\n\n');
    console.log('='.repeat(80));
    console.log('ZUSAMMENFASSUNG');
    console.log('='.repeat(80));
    console.log('');
    
    results.forEach((result, index) => {
        console.log(`${index + 1}. ${result.keyName}:`);
        if (result.success) {
            console.log(`   ✅ FUNKTIONIERT!`);
            console.log(`   - Verbindung: ${result.connected ? 'Ja' : 'Nein'}`);
            console.log(`   - Nachrichten: ${result.messagesReceived}`);
            if (result.code) {
                console.log(`   - Close Code: ${result.code} (${ClientCloseCode[result.code] || 'UNKNOWN'})`);
            }
        } else {
            console.log(`   ❌ FUNKTIONIERT NICHT`);
            if (result.error) {
                console.log(`   - Fehler: ${result.error}`);
            }
            if (result.errorMessage) {
                console.log(`   - ${result.errorMessage}`);
            }
        }
        console.log('');
    });
    
    // Empfehlung
    console.log('='.repeat(80));
    console.log('EMPFEHLUNG');
    console.log('='.repeat(80));
    
    const workingKey = results.find(r => r.success);
    if (workingKey) {
        console.log(`\n✅ Verwende: ${workingKey.keyName}`);
        console.log('\nSetze in deiner Konfiguration:');
        if (workingKey.keyName.includes('API Key')) {
            console.log(`   EULER_API_KEY=${API_KEY}`);
            console.log('\nODER in der Dashboard-Einstellung:');
            console.log(`   tiktok_euler_api_key = ${API_KEY}`);
        } else {
            console.log(`   EULER_API_KEY=${WEBHOOK_SECRET}`);
            console.log('\nODER in der Dashboard-Einstellung:');
            console.log(`   tiktok_euler_api_key = ${WEBHOOK_SECRET}`);
        }
    } else {
        console.log('\n❌ KEINER der Schlüssel funktioniert!');
        console.log('\nMögliche Gründe:');
        console.log('1. Beide Schlüssel sind abgelaufen oder ungültig');
        console.log('2. EulerStream Account hat keine Berechtigung');
        console.log('3. Netzwerk-/Firewall-Problem');
        console.log('\nÜberprüfe deine Schlüssel auf: https://www.eulerstream.com');
    }
    
    console.log('\n' + '='.repeat(80));
    process.exit(0);
}

runTests().catch(error => {
    console.error('UNERWARTETER FEHLER:', error);
    process.exit(1);
});
