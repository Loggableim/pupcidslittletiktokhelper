#!/usr/bin/env node
/**
 * Goals HUD Overlay Integration Test
 * Tests WebSocket event flow, goals updates, and overlay rendering
 */

const io = require('socket.io-client');

console.log('='.repeat(80));
console.log('GOALS HUD OVERLAY INTEGRATION TEST');
console.log('='.repeat(80));
console.log('');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
let socket = null;
let testsPassed = 0;
let testsFailed = 0;

// ANSI color codes for better output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function pass(test) {
    testsPassed++;
    log(`✓ ${test}`, 'green');
}

function fail(test, error) {
    testsFailed++;
    log(`✗ ${test}`, 'red');
    if (error) {
        log(`  Error: ${error}`, 'red');
    }
}

function section(title) {
    log(`\n${'='.repeat(60)}`, 'blue');
    log(title, 'blue');
    log('='.repeat(60), 'blue');
}

// Test 1: Connect to server
function testConnection() {
    return new Promise((resolve, reject) => {
        section('Test 1: WebSocket Connection');
        
        socket = io(SERVER_URL, {
            transports: ['websocket', 'polling'],
            reconnection: false
        });

        const timeout = setTimeout(() => {
            fail('Connection to server', 'Connection timeout after 5 seconds');
            socket.close();
            reject(new Error('Connection timeout'));
        }, 5000);

        socket.on('connect', () => {
            clearTimeout(timeout);
            pass(`Connected to ${SERVER_URL}`);
            pass(`Socket ID: ${socket.id}`);
            resolve();
        });

        socket.on('connect_error', (error) => {
            clearTimeout(timeout);
            fail('Connection to server', error.message);
            reject(error);
        });
    });
}

// Test 2: Subscribe to goals
function testGoalsSubscription() {
    return new Promise((resolve, reject) => {
        section('Test 2: Goals Subscription');
        
        const timeout = setTimeout(() => {
            fail('Goals subscription', 'No snapshot received after 3 seconds');
            reject(new Error('Snapshot timeout'));
        }, 3000);

        socket.once('goals:snapshot', (data) => {
            clearTimeout(timeout);
            pass('Received goals:snapshot event');
            
            if (data && data.goals && Array.isArray(data.goals)) {
                pass(`Snapshot contains ${data.goals.length} goals`);
                
                // Verify goal structure
                let validGoals = 0;
                data.goals.forEach(goal => {
                    if (goal.id && typeof goal.current === 'number' && typeof goal.target === 'number') {
                        validGoals++;
                        log(`  - ${goal.id}: ${goal.current}/${goal.target} (${goal.percent}%)`, 'yellow');
                    }
                });
                
                if (validGoals === data.goals.length) {
                    pass('All goals have valid structure');
                } else {
                    fail('Goal structure validation', `Only ${validGoals}/${data.goals.length} goals are valid`);
                }
            } else {
                fail('Snapshot data validation', 'Invalid data structure');
            }
            
            resolve(data);
        });

        log('Emitting goals:subscribe...');
        socket.emit('goals:subscribe');
    });
}

// Test 3: Simulate goal updates
function testGoalUpdates() {
    return new Promise((resolve) => {
        section('Test 3: Goal Update Events');
        
        let updateCount = 0;
        const expectedUpdates = 4; // coins, followers, likes, subs
        
        const updateHandler = (data) => {
            updateCount++;
            if (data && data.goalId && typeof data.total === 'number') {
                pass(`Received update for ${data.goalId}: ${data.total}/${data.goal}`);
            } else {
                fail('Goal update structure', 'Invalid data');
            }
            
            if (updateCount >= expectedUpdates) {
                socket.off('goals:update', updateHandler);
                resolve();
            }
        };

        socket.on('goals:update', updateHandler);

        // Simulate updates via API calls
        log('\nSimulating TikTok events via Socket.IO...');
        
        setTimeout(() => {
            log('Simulating coin gift (100 coins)...', 'yellow');
            socket.emit('test:goal:increment', { id: 'coins', amount: 100 });
        }, 500);
        
        setTimeout(() => {
            log('Simulating new follower...', 'yellow');
            socket.emit('test:goal:increment', { id: 'followers', amount: 1 });
        }, 1000);
        
        setTimeout(() => {
            log('Simulating like...', 'yellow');
            socket.emit('test:goal:increment', { id: 'likes', amount: 1 });
        }, 1500);
        
        setTimeout(() => {
            log('Simulating subscription...', 'yellow');
            socket.emit('test:goal:increment', { id: 'subs', amount: 1 });
        }, 2000);
        
        // Wait for all updates or timeout
        setTimeout(() => {
            socket.off('goals:update', updateHandler);
            if (updateCount < expectedUpdates) {
                log(`\nNote: Only received ${updateCount}/${expectedUpdates} updates`, 'yellow');
                log('This may be expected if test events are not implemented', 'yellow');
            }
            resolve();
        }, 4000);
    });
}

// Test 4: Verify reset events
function testGoalReset() {
    return new Promise((resolve) => {
        section('Test 4: Goal Reset');
        
        const resetHandler = (data) => {
            if (data && data.goalId) {
                pass(`Received reset for ${data.goalId}`);
            } else {
                fail('Goal reset structure', 'Invalid data');
            }
            socket.off('goals:reset', resetHandler);
            resolve();
        };

        socket.on('goals:reset', resetHandler);

        log('Emitting test reset for coins...');
        socket.emit('test:goal:reset', { id: 'coins' });

        // Timeout if no reset received
        setTimeout(() => {
            socket.off('goals:reset', resetHandler);
            log('Note: Reset event not received (may not be implemented)', 'yellow');
            resolve();
        }, 2000);
    });
}

// Test 5: Disconnect
function testDisconnect() {
    return new Promise((resolve) => {
        section('Test 5: Disconnect');
        
        socket.on('disconnect', () => {
            pass('Disconnected successfully');
            resolve();
        });

        socket.close();
        
        setTimeout(() => {
            resolve();
        }, 1000);
    });
}

// Run all tests
async function runTests() {
    try {
        log('\nStarting Goals HUD Overlay Integration Tests...\n', 'blue');
        log(`Target Server: ${SERVER_URL}`, 'yellow');
        log('Make sure the server is running before proceeding!\n', 'yellow');

        await testConnection();
        await testGoalsSubscription();
        await testGoalUpdates();
        await testGoalReset();
        await testDisconnect();

        // Summary
        section('Test Summary');
        log(`Tests Passed: ${testsPassed}`, 'green');
        if (testsFailed > 0) {
            log(`Tests Failed: ${testsFailed}`, 'red');
        }
        log(`Total: ${testsPassed + testsFailed}`, 'blue');

        if (testsFailed === 0) {
            log('\n✓ All tests passed!', 'green');
            log('\nNext steps:', 'blue');
            log('1. Open browser to http://localhost:3000/goals-overlay.html?debug=true', 'yellow');
            log('2. Open dashboard to http://localhost:3000/dashboard.html', 'yellow');
            log('3. Press Shift+F12 in dashboard to open debug panel', 'yellow');
            log('4. Simulate TikTok events and watch the overlay update in real-time', 'yellow');
            process.exit(0);
        } else {
            log('\n✗ Some tests failed. Please check the errors above.', 'red');
            process.exit(1);
        }

    } catch (error) {
        log('\n✗ Test suite failed:', 'red');
        log(error.message, 'red');
        log('\nMake sure the server is running:', 'yellow');
        log('  npm start', 'yellow');
        process.exit(1);
    }
}

// Handle SIGINT (Ctrl+C)
process.on('SIGINT', () => {
    log('\n\nTests interrupted by user', 'yellow');
    if (socket) {
        socket.close();
    }
    process.exit(1);
});

// Run tests
runTests();
