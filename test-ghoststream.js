/**
 * Basic tests for GhostStream Connector modules
 * Tests session management, command execution, and browser controller
 */

const SessionManager = require('./modules/ghoststream/session-manager');
const CommandExecutor = require('./modules/ghoststream/command-executor');

console.log('🧪 Running GhostStream Connector Tests...\n');

// Test 1: Session Manager
console.log('📋 Test 1: Session Manager');
try {
    const sessionManager = new SessionManager({
        jwtSecret: 'test-secret',
        maxSessions: 3
    });

    // Create session
    const session1 = sessionManager.createSession('test-account-1', {
        username: 'testuser1',
        headless: true
    });
    console.log('✅ Session created:', session1.sessionId);

    // Verify token
    const decoded = sessionManager.verifyToken(session1.token);
    if (decoded && decoded.sessionId === session1.sessionId) {
        console.log('✅ Token verification successful');
    } else {
        throw new Error('Token verification failed');
    }

    // Get session
    const retrieved = sessionManager.getSession(session1.sessionId);
    if (retrieved && retrieved.sessionId === session1.sessionId) {
        console.log('✅ Session retrieval successful');
    } else {
        throw new Error('Session retrieval failed');
    }

    // Update activity
    const originalActivity = session1.lastActivity;
    sessionManager.updateActivity(session1.sessionId);
    const updated = sessionManager.getSession(session1.sessionId);
    if (updated.lastActivity >= originalActivity) {
        console.log('✅ Activity update successful');
    } else {
        throw new Error('Activity update failed');
    }

    // Create multiple sessions
    const session2 = sessionManager.createSession('test-account-2', { username: 'testuser2' });
    const session3 = sessionManager.createSession('test-account-3', { username: 'testuser3' });
    
    const allSessions = sessionManager.getAllSessions();
    if (allSessions.length === 3) {
        console.log('✅ Multiple sessions created successfully');
    } else {
        throw new Error(`Expected 3 sessions, got ${allSessions.length}`);
    }

    // Test max sessions limit
    try {
        const session4 = sessionManager.createSession('test-account-4', { username: 'testuser4' });
        throw new Error('Should have failed due to max sessions limit');
    } catch (error) {
        if (error.message.includes('Maximum number of sessions')) {
            console.log('✅ Max sessions limit enforced');
        } else {
            throw error;
        }
    }

    // Delete session
    sessionManager.deleteSession(session1.sessionId);
    const deleted = sessionManager.getSession(session1.sessionId);
    if (!deleted) {
        console.log('✅ Session deletion successful');
    } else {
        throw new Error('Session deletion failed');
    }

    // Cleanup
    sessionManager.stopCleanupTimer();
    console.log('✅ Session Manager tests passed\n');
} catch (error) {
    console.error('❌ Session Manager test failed:', error.message);
    process.exit(1);
}

// Test 2: Command Executor
console.log('📋 Test 2: Command Executor');
try {
    const commandExecutor = new CommandExecutor({
        commandPrefix: '!',
        allowedCommands: ['tts', 'scene', 'click'],
        rateLimit: 3,
        rateLimitWindow: 60000
    });

    // Test TTS command
    commandExecutor.parseAndExecute('!tts Hello World', 'testuser')
        .then(result => {
            if (result && result.type === 'tts' && result.message === 'Hello World') {
                console.log('✅ TTS command parsed successfully');
            } else {
                throw new Error('TTS command parsing failed');
            }
        })
        .catch(error => {
            console.error('❌ TTS command test failed:', error.message);
            process.exit(1);
        });

    // Test scene command
    commandExecutor.parseAndExecute('!scene Main Scene', 'testuser')
        .then(result => {
            if (result && result.type === 'scene' && result.sceneName === 'Main Scene') {
                console.log('✅ Scene command parsed successfully');
            } else {
                throw new Error('Scene command parsing failed');
            }
        })
        .catch(error => {
            console.error('❌ Scene command test failed:', error.message);
            process.exit(1);
        });

    // Test click command
    commandExecutor.parseAndExecute('!click #button', 'testuser')
        .then(result => {
            if (result && result.type === 'click' && result.selector === '#button') {
                console.log('✅ Click command parsed successfully');
            } else {
                throw new Error('Click command parsing failed');
            }
        })
        .catch(error => {
            console.error('❌ Click command test failed:', error.message);
            process.exit(1);
        });

    // Test rate limiting
    commandExecutor.parseAndExecute('!tts Test 1', 'testuser2')
        .then(() => commandExecutor.parseAndExecute('!tts Test 2', 'testuser2'))
        .then(() => commandExecutor.parseAndExecute('!tts Test 3', 'testuser2'))
        .then(() => {
            // 4th command should fail due to rate limit
            return commandExecutor.parseAndExecute('!tts Test 4', 'testuser2')
                .then(() => {
                    throw new Error('Rate limit should have been enforced');
                })
                .catch(error => {
                    if (error.message.includes('Rate limit exceeded')) {
                        console.log('✅ Rate limiting enforced');
                    } else {
                        throw error;
                    }
                });
        })
        .catch(error => {
            console.error('❌ Rate limiting test failed:', error.message);
            process.exit(1);
        });

    // Test invalid command
    commandExecutor.parseAndExecute('!invalid command', 'testuser')
        .then(result => {
            if (result === null) {
                console.log('✅ Invalid command rejected');
            } else {
                throw new Error('Invalid command should return null');
            }
        })
        .catch(error => {
            console.error('❌ Invalid command test failed:', error.message);
            process.exit(1);
        });

    // Test non-command message
    commandExecutor.parseAndExecute('Hello this is not a command', 'testuser')
        .then(result => {
            if (result === null) {
                console.log('✅ Non-command message ignored');
            } else {
                throw new Error('Non-command message should return null');
            }
        })
        .catch(error => {
            console.error('❌ Non-command test failed:', error.message);
            process.exit(1);
        });

    // Test selector validation
    const dangerousSelectors = [
        'javascript:alert(1)',
        '<script>alert(1)</script>',
        'onclick=alert(1)',
        'eval(alert(1))'
    ];

    dangerousSelectors.forEach(selector => {
        if (!commandExecutor.isValidSelector(selector)) {
            console.log(`✅ Dangerous selector rejected: ${selector}`);
        } else {
            throw new Error(`Dangerous selector should be rejected: ${selector}`);
        }
    });

    const safeSelectors = [
        '#button',
        '.my-class',
        'div > span',
        '[data-id="123"]'
    ];

    safeSelectors.forEach(selector => {
        if (commandExecutor.isValidSelector(selector)) {
            console.log(`✅ Safe selector accepted: ${selector}`);
        } else {
            throw new Error(`Safe selector should be accepted: ${selector}`);
        }
    });

    setTimeout(() => {
        console.log('✅ Command Executor tests passed\n');
        console.log('🎉 All tests passed!');
        process.exit(0);
    }, 1000);

} catch (error) {
    console.error('❌ Command Executor test failed:', error.message);
    process.exit(1);
}
