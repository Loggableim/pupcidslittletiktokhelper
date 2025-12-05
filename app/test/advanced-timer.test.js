/**
 * Advanced Timer Plugin Tests
 * Basic tests to verify plugin structure and core functionality
 */

const path = require('path');
const fs = require('fs');

describe('Advanced Timer Plugin', () => {
    const pluginDir = path.join(__dirname, '..', 'plugins', 'advanced-timer');

    describe('Plugin Structure', () => {
        test('plugin.json exists and is valid', () => {
            const pluginJsonPath = path.join(pluginDir, 'plugin.json');
            expect(fs.existsSync(pluginJsonPath)).toBe(true);

            const pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
            expect(pluginJson.id).toBe('advanced-timer');
            expect(pluginJson.name).toBe('Advanced Timer');
            expect(pluginJson.entry).toBe('main.js');
            expect(pluginJson.version).toBeDefined();
            expect(pluginJson.permissions).toContain('socket.io');
            expect(pluginJson.permissions).toContain('routes');
            expect(pluginJson.permissions).toContain('tiktok-events');
            expect(pluginJson.permissions).toContain('database');
        });

        test('main.js exists', () => {
            const mainJsPath = path.join(pluginDir, 'main.js');
            expect(fs.existsSync(mainJsPath)).toBe(true);
        });

        test('backend modules exist', () => {
            const backendDir = path.join(pluginDir, 'backend');
            expect(fs.existsSync(path.join(backendDir, 'database.js'))).toBe(true);
            expect(fs.existsSync(path.join(backendDir, 'api.js'))).toBe(true);
            expect(fs.existsSync(path.join(backendDir, 'websocket.js'))).toBe(true);
            expect(fs.existsSync(path.join(backendDir, 'event-handlers.js'))).toBe(true);
        });

        test('engine module exists', () => {
            const engineDir = path.join(pluginDir, 'engine');
            expect(fs.existsSync(path.join(engineDir, 'timer-engine.js'))).toBe(true);
        });

        test('ui files exist', () => {
            expect(fs.existsSync(path.join(pluginDir, 'ui.html'))).toBe(true);
            expect(fs.existsSync(path.join(pluginDir, 'ui', 'ui.js'))).toBe(true);
        });

        test('overlay files exist', () => {
            const overlayDir = path.join(pluginDir, 'overlay');
            expect(fs.existsSync(path.join(overlayDir, 'index.html'))).toBe(true);
            expect(fs.existsSync(path.join(overlayDir, 'overlay.js'))).toBe(true);
        });

        test('README exists', () => {
            expect(fs.existsSync(path.join(pluginDir, 'README.md'))).toBe(true);
        });

        test('localization file exists', () => {
            expect(fs.existsSync(path.join(pluginDir, 'locales', 'de.json'))).toBe(true);
        });
    });

    describe('Plugin Module Loading', () => {
        test('main.js exports a class', () => {
            const MainClass = require(path.join(pluginDir, 'main.js'));
            expect(typeof MainClass).toBe('function');
        });

        test('database module exports a class', () => {
            const DatabaseClass = require(path.join(pluginDir, 'backend', 'database.js'));
            expect(typeof DatabaseClass).toBe('function');
        });

        test('api module exports a class', () => {
            const APIClass = require(path.join(pluginDir, 'backend', 'api.js'));
            expect(typeof APIClass).toBe('function');
        });

        test('websocket module exports a class', () => {
            const WebSocketClass = require(path.join(pluginDir, 'backend', 'websocket.js'));
            expect(typeof WebSocketClass).toBe('function');
        });

        test('event-handlers module exports a class', () => {
            const EventHandlersClass = require(path.join(pluginDir, 'backend', 'event-handlers.js'));
            expect(typeof EventHandlersClass).toBe('function');
        });

        test('timer-engine module exports objects', () => {
            const { Timer, TimerEngine } = require(path.join(pluginDir, 'engine', 'timer-engine.js'));
            expect(typeof Timer).toBe('function');
            expect(typeof TimerEngine).toBe('function');
        });
    });

    describe('Timer Engine', () => {
        let Timer, TimerEngine;
        
        beforeAll(() => {
            const timerModule = require(path.join(pluginDir, 'engine', 'timer-engine.js'));
            Timer = timerModule.Timer;
            TimerEngine = timerModule.TimerEngine;
        });

        test('creates timer with countdown mode', () => {
            const mockApi = { log: jest.fn() };
            const config = {
                id: 'test-timer-1',
                name: 'Test Countdown',
                mode: 'countdown',
                initial_duration: 60,
                current_value: 60,
                state: 'stopped',
                config: {}
            };
            
            const timer = new Timer(config, mockApi);
            expect(timer.id).toBe('test-timer-1');
            expect(timer.mode).toBe('countdown');
            expect(timer.currentValue).toBe(60);
        });

        test('creates timer with countup mode', () => {
            const mockApi = { log: jest.fn() };
            const config = {
                id: 'test-timer-2',
                name: 'Test Count Up',
                mode: 'countup',
                target_value: 100,
                current_value: 0,
                state: 'stopped',
                config: {}
            };
            
            const timer = new Timer(config, mockApi);
            expect(timer.id).toBe('test-timer-2');
            expect(timer.mode).toBe('countup');
            expect(timer.targetValue).toBe(100);
        });

        test('timer engine manages multiple timers', () => {
            const mockApi = { log: jest.fn() };
            const engine = new TimerEngine(mockApi);
            
            const config1 = {
                id: 'timer-1',
                name: 'Timer 1',
                mode: 'countdown',
                initial_duration: 60,
                current_value: 60,
                state: 'stopped',
                config: {}
            };
            
            const config2 = {
                id: 'timer-2',
                name: 'Timer 2',
                mode: 'stopwatch',
                current_value: 0,
                state: 'stopped',
                config: {}
            };
            
            engine.createTimer(config1);
            engine.createTimer(config2);
            
            expect(engine.timers.size).toBe(2);
            expect(engine.getTimer('timer-1')).toBeDefined();
            expect(engine.getTimer('timer-2')).toBeDefined();
        });

        test('timer can add time', () => {
            const mockApi = { log: jest.fn() };
            const config = {
                id: 'test-timer-3',
                name: 'Test Timer',
                mode: 'countdown',
                initial_duration: 60,
                current_value: 60,
                state: 'stopped',
                config: {}
            };
            
            const timer = new Timer(config, mockApi);
            const initialValue = timer.currentValue;
            
            timer.addTime(30);
            
            expect(timer.currentValue).toBe(initialValue + 30);
        });

        test('timer can remove time', () => {
            const mockApi = { log: jest.fn() };
            const config = {
                id: 'test-timer-4',
                name: 'Test Timer',
                mode: 'countdown',
                initial_duration: 60,
                current_value: 60,
                state: 'stopped',
                config: {}
            };
            
            const timer = new Timer(config, mockApi);
            const initialValue = timer.currentValue;
            
            timer.removeTime(10);
            
            expect(timer.currentValue).toBe(initialValue - 10);
        });
    });

    describe('Localization', () => {
        test('German localization is valid JSON', () => {
            const localePath = path.join(pluginDir, 'locales', 'de.json');
            const localeData = JSON.parse(fs.readFileSync(localePath, 'utf8'));
            
            expect(localeData.plugin).toBeDefined();
            expect(localeData.plugin.name).toBeDefined();
            expect(localeData.ui).toBeDefined();
            expect(localeData.events).toBeDefined();
        });
    });
});
