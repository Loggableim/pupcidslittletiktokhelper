/**
 * IFTTT Action Registry
 * Central registry for all available actions in the automation system
 */

class ActionRegistry {
    constructor(logger) {
        this.logger = logger;
        this.actions = new Map();
        this.registerCoreActions();
    }

    /**
     * Register an action
     * @param {string} id - Unique action ID
     * @param {Object} config - Action configuration
     */
    register(id, config) {
        if (this.actions.has(id)) {
            this.logger?.warn(`Action ${id} already registered, overwriting`);
        }

        const action = {
            id,
            name: config.name || id,
            description: config.description || '',
            category: config.category || 'custom',
            icon: config.icon || 'play',
            fields: config.fields || [],
            executor: config.executor,
            metadata: config.metadata || {}
        };

        this.actions.set(id, action);
        this.logger?.info(`✅ Registered action: ${id}`);
    }

    /**
     * Unregister an action
     */
    unregister(id) {
        if (this.actions.has(id)) {
            this.actions.delete(id);
            this.logger?.info(`Unregistered action: ${id}`);
            return true;
        }
        return false;
    }

    /**
     * Get action configuration
     */
    get(id) {
        return this.actions.get(id);
    }

    /**
     * Get all actions
     */
    getAll() {
        return Array.from(this.actions.values());
    }

    /**
     * Get actions by category
     */
    getByCategory(category) {
        return Array.from(this.actions.values()).filter(a => a.category === category);
    }

    /**
     * Check if action exists
     */
    has(id) {
        return this.actions.has(id);
    }

    /**
     * Execute an action
     */
    async execute(actionDef, context, services) {
        const action = this.actions.get(actionDef.type);
        if (!action) {
            this.logger?.warn(`Unknown action type: ${actionDef.type}`);
            return { success: false, error: 'Unknown action type' };
        }

        if (!action.executor) {
            this.logger?.warn(`Action ${actionDef.type} has no executor`);
            return { success: false, error: 'No executor defined' };
        }

        try {
            const result = await action.executor(actionDef, context, services);
            return { success: true, result };
        } catch (error) {
            this.logger?.error(`Action ${actionDef.type} failed:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Register core actions
     */
    registerCoreActions() {
        // TTS Actions
        this.register('tts:speak', {
            name: 'Speak Text (TTS)',
            description: 'Use text-to-speech to speak a message',
            category: 'tts',
            icon: 'mic',
            fields: [
                { name: 'text', label: 'Text to Speak', type: 'textarea', required: true },
                { name: 'voice', label: 'Voice', type: 'select', options: [] },
                { name: 'volume', label: 'Volume', type: 'range', min: 0, max: 100, default: 80 },
                { name: 'priority', label: 'Priority', type: 'select', options: ['low', 'normal', 'high'], default: 'normal' }
            ],
            executor: async (action, context, services) => {
                const tts = services.tts || services.ttsPlugin;
                if (!tts) {
                    services.logger?.warn('TTS service not available');
                    throw new Error('TTS service not available');
                }
                
                const text = services.templateEngine.render(action.text || '', context.data);
                if (!text || text.trim() === '') {
                    throw new Error('No text provided for TTS');
                }
                
                const ttsOptions = {
                    text: text,
                    voice: action.voice,
                    volume: action.volume || 80,
                    priority: action.priority || 'normal'
                };
                
                services.logger?.info(`🎤 TTS: "${text.substring(0, 50)}..."`);
                
                // Check if TTS has speak method
                if (typeof tts.speak === 'function') {
                    await tts.speak(ttsOptions);
                } else if (typeof tts.addToQueue === 'function') {
                    await tts.addToQueue(ttsOptions);
                } else {
                    throw new Error('TTS service does not have speak or addToQueue method');
                }
            }
        });

        // Alert Actions
        this.register('alert:show', {
            name: 'Show Alert',
            description: 'Display an alert overlay',
            category: 'alert',
            icon: 'bell',
            fields: [
                { name: 'text', label: 'Alert Text', type: 'textarea', required: true },
                { name: 'type', label: 'Alert Type', type: 'select', options: ['info', 'success', 'warning', 'error', 'custom'], default: 'info' },
                { name: 'duration', label: 'Duration (seconds)', type: 'number', min: 1, max: 60, default: 5 },
                { name: 'sound', label: 'Sound File', type: 'file', accept: 'audio/*' },
                { name: 'volume', label: 'Volume', type: 'range', min: 0, max: 100, default: 80 }
            ],
            executor: async (action, context, services) => {
                const alertManager = services.alertManager;
                if (!alertManager) {
                    services.logger?.warn('Alert manager not available');
                    throw new Error('Alert manager not available');
                }
                
                const text = services.templateEngine.render(action.text || '', context.data);
                
                const alertConfig = {
                    text_template: text,
                    sound_file: action.sound || null,
                    sound_volume: action.volume || 80,
                    duration: action.duration || 5,
                    enabled: true
                };
                
                services.logger?.info(`🔔 Alert: "${text.substring(0, 50)}..."`);
                
                if (typeof alertManager.addAlert === 'function') {
                    alertManager.addAlert(action.type || 'custom', context.data, alertConfig);
                } else {
                    throw new Error('Alert manager does not have addAlert method');
                }
            }
        });

        // Sound Actions
        this.register('sound:play', {
            name: 'Play Sound',
            description: 'Play a sound file',
            category: 'audio',
            icon: 'volume-2',
            fields: [
                { name: 'file', label: 'Sound File', type: 'file', accept: 'audio/*', required: true },
                { name: 'volume', label: 'Volume', type: 'range', min: 0, max: 100, default: 80 }
            ],
            executor: async (action, context, services) => {
                const io = services.io;
                if (!io) throw new Error('Socket.io not available');
                
                io.emit('play_sound', {
                    file: action.file,
                    volume: action.volume || 80
                });
            }
        });

        // Overlay Actions
        this.register('overlay:image', {
            name: 'Show Image Overlay',
            description: 'Display an image in the overlay',
            category: 'overlay',
            icon: 'image',
            fields: [
                { name: 'url', label: 'Image URL', type: 'text', required: true },
                { name: 'duration', label: 'Duration (seconds)', type: 'number', min: 1, max: 300, default: 5 },
                { name: 'position', label: 'Position', type: 'select', options: ['center', 'top', 'bottom', 'left', 'right'], default: 'center' },
                { name: 'width', label: 'Width', type: 'number', min: 50, max: 1920 },
                { name: 'height', label: 'Height', type: 'number', min: 50, max: 1080 }
            ],
            executor: async (action, context, services) => {
                const io = services.io;
                if (!io) throw new Error('Socket.io not available');
                
                io.emit('overlay:image', {
                    url: action.url,
                    duration: action.duration || 5,
                    position: action.position || 'center',
                    width: action.width,
                    height: action.height
                });
            }
        });

        this.register('overlay:text', {
            name: 'Show Text Overlay',
            description: 'Display text in the overlay',
            category: 'overlay',
            icon: 'type',
            fields: [
                { name: 'text', label: 'Text', type: 'textarea', required: true },
                { name: 'duration', label: 'Duration (seconds)', type: 'number', min: 1, max: 300, default: 5 },
                { name: 'position', label: 'Position', type: 'select', options: ['center', 'top', 'bottom'], default: 'center' },
                { name: 'fontSize', label: 'Font Size', type: 'number', min: 12, max: 200, default: 48 },
                { name: 'color', label: 'Text Color', type: 'color', default: '#ffffff' }
            ],
            executor: async (action, context, services) => {
                const io = services.io;
                if (!io) throw new Error('Socket.io not available');
                
                io.emit('overlay:text', {
                    text: services.templateEngine.render(action.text, context.data),
                    duration: action.duration || 5,
                    position: action.position || 'center',
                    fontSize: action.fontSize || 48,
                    color: action.color || '#ffffff'
                });
            }
        });

        // Emoji Rain Actions
        this.register('emojirain:trigger', {
            name: 'Trigger Emoji Rain',
            description: 'Start emoji rain effect',
            category: 'overlay',
            icon: 'cloud-rain',
            fields: [
                { name: 'emoji', label: 'Emoji', type: 'text', placeholder: '🎉' },
                { name: 'count', label: 'Count', type: 'number', min: 1, max: 100, default: 10 },
                { name: 'duration', label: 'Duration (ms)', type: 'number', min: 0, max: 30000, default: 0 },
                { name: 'intensity', label: 'Intensity', type: 'range', min: 0.1, max: 5, step: 0.1, default: 1.0 },
                { name: 'burst', label: 'Burst Mode', type: 'checkbox', default: false }
            ],
            executor: async (action, context, services) => {
                const io = services.io;
                if (!io) {
                    services.logger?.warn('Socket.io not available for emoji rain');
                    throw new Error('Socket.io not available');
                }
                
                const emojiData = {
                    emoji: action.emoji || null,
                    count: action.count || 10,
                    duration: action.duration || 0,
                    intensity: action.intensity || 1.0,
                    username: context.data?.username || context.data?.uniqueId,
                    burst: action.burst || false
                };
                
                services.logger?.info(`🌧️ Emoji Rain: ${emojiData.count}x ${emojiData.emoji || 'random'}`);
                
                io.emit('emoji_rain:trigger', emojiData);
            }
        });

        // Goal Actions
        this.register('goal:update', {
            name: 'Update Goal',
            description: 'Update goal progress',
            category: 'goal',
            icon: 'target',
            fields: [
                { name: 'goalId', label: 'Goal ID', type: 'number', required: true },
                { name: 'operation', label: 'Operation', type: 'select', options: ['add', 'subtract', 'set'], default: 'add' },
                { name: 'value', label: 'Value', type: 'number', required: true }
            ],
            executor: async (action, context, services) => {
                const db = services.db;
                if (!db) throw new Error('Database not available');
                
                const goal = db.getGoal(action.goalId);
                if (!goal) throw new Error('Goal not found');
                
                let newValue = goal.current;
                if (action.operation === 'add') {
                    newValue += action.value;
                } else if (action.operation === 'subtract') {
                    newValue -= action.value;
                } else if (action.operation === 'set') {
                    newValue = action.value;
                }
                
                db.updateGoal(action.goalId, { current: newValue });
                
                services.io?.emit('goal:updated', {
                    goalId: action.goalId,
                    current: newValue,
                    target: goal.target
                });
            }
        });

        // Spotlight Actions
        this.register('spotlight:set', {
            name: 'Set Spotlight',
            description: 'Highlight a user in spotlight',
            category: 'overlay',
            icon: 'star',
            fields: [
                { name: 'username', label: 'Username', type: 'text', required: true },
                { name: 'duration', label: 'Duration (seconds)', type: 'number', min: 1, max: 300, default: 10 }
            ],
            executor: async (action, context, services) => {
                const io = services.io;
                if (!io) throw new Error('Socket.io not available');
                
                io.emit('spotlight:set', {
                    username: services.templateEngine.render(action.username, context.data),
                    duration: action.duration || 10
                });
            }
        });

        // Webhook Actions
        this.register('webhook:send', {
            name: 'Send Webhook',
            description: 'Send HTTP request to webhook',
            category: 'integration',
            icon: 'send',
            fields: [
                { name: 'url', label: 'Webhook URL', type: 'text', required: true },
                { name: 'method', label: 'Method', type: 'select', options: ['GET', 'POST', 'PUT', 'DELETE'], default: 'POST' },
                { name: 'body', label: 'Request Body (JSON)', type: 'textarea' },
                { name: 'headers', label: 'Headers (JSON)', type: 'textarea' }
            ],
            executor: async (action, context, services) => {
                const axios = services.axios || require('axios');
                if (!axios) {
                    services.logger?.warn('HTTP client (axios) not available');
                    throw new Error('HTTP client not available');
                }
                
                if (!action.url) {
                    throw new Error('Webhook URL is required');
                }
                
                const body = action.body 
                    ? JSON.parse(services.templateEngine.render(action.body, context.data)) 
                    : context.data;
                const headers = action.headers 
                    ? JSON.parse(action.headers) 
                    : { 'Content-Type': 'application/json' };
                
                services.logger?.info(`🌐 Webhook: ${action.method || 'POST'} ${action.url}`);
                
                const response = await axios({
                    method: action.method || 'POST',
                    url: action.url,
                    data: body,
                    headers,
                    timeout: 5000
                });
                
                services.logger?.info(`✅ Webhook response: ${response.status}`);
                return response.data;
            }
        });

        // Variable Actions
        this.register('variable:set', {
            name: 'Set Variable',
            description: 'Set a custom variable value',
            category: 'logic',
            icon: 'database',
            fields: [
                { name: 'name', label: 'Variable Name', type: 'text', required: true },
                { name: 'value', label: 'Value', type: 'text', required: true },
                { name: 'type', label: 'Type', type: 'select', options: ['string', 'number', 'boolean'], default: 'string' }
            ],
            executor: async (action, context, services) => {
                const variables = services.variables;
                if (!variables) throw new Error('Variable store not available');
                
                let value = services.templateEngine.render(action.value, context.data);
                
                if (action.type === 'number') {
                    value = parseFloat(value);
                } else if (action.type === 'boolean') {
                    value = value.toLowerCase() === 'true' || value === '1';
                }
                
                variables.set(action.name, value);
            }
        });

        this.register('variable:increment', {
            name: 'Increment Variable',
            description: 'Increment a numeric variable',
            category: 'logic',
            icon: 'plus',
            fields: [
                { name: 'name', label: 'Variable Name', type: 'text', required: true },
                { name: 'amount', label: 'Amount', type: 'number', default: 1 }
            ],
            executor: async (action, context, services) => {
                const variables = services.variables;
                if (!variables) throw new Error('Variable store not available');
                
                const current = variables.get(action.name) || 0;
                variables.set(action.name, current + (action.amount || 1));
            }
        });

        // Plugin Actions
        this.register('plugin:trigger', {
            name: 'Trigger Plugin Action',
            description: 'Execute a plugin-specific action',
            category: 'plugin',
            icon: 'puzzle',
            fields: [
                { name: 'pluginId', label: 'Plugin ID', type: 'text', required: true },
                { name: 'action', label: 'Action Name', type: 'text', required: true },
                { name: 'params', label: 'Parameters (JSON)', type: 'textarea' }
            ],
            executor: async (action, context, services) => {
                const pluginLoader = services.pluginLoader;
                if (!pluginLoader) throw new Error('Plugin loader not available');
                
                const params = action.params ? JSON.parse(services.templateEngine.render(action.params, context.data)) : {};
                
                await pluginLoader.triggerPluginAction(action.pluginId, action.action, params, context.data);
            }
        });

        // OBS Actions
        this.register('obs:scene', {
            name: 'Switch OBS Scene',
            description: 'Change OBS scene',
            category: 'obs',
            icon: 'video',
            fields: [
                { name: 'sceneName', label: 'Scene Name', type: 'text', required: true }
            ],
            executor: async (action, context, services) => {
                const obs = services.obs;
                if (!obs) throw new Error('OBS WebSocket not available');
                
                await obs.setCurrentProgramScene({
                    sceneName: services.templateEngine.render(action.sceneName, context.data)
                });
            }
        });

        // OSC Actions
        this.register('osc:send', {
            name: 'Send OSC Message',
            description: 'Send OSC message (VRChat, etc.)',
            category: 'osc',
            icon: 'radio',
            fields: [
                { name: 'address', label: 'OSC Address', type: 'text', required: true, placeholder: '/avatar/parameters/Wave' },
                { name: 'args', label: 'Arguments (JSON array)', type: 'textarea', placeholder: '[true]' }
            ],
            executor: async (action, context, services) => {
                const osc = services.osc;
                if (!osc) throw new Error('OSC service not available');
                
                const args = action.args ? JSON.parse(action.args) : [];
                osc.send(action.address, ...args);
            }
        });

        // Delay Action
        this.register('delay:wait', {
            name: 'Wait/Delay',
            description: 'Wait for a specified duration',
            category: 'logic',
            icon: 'clock',
            fields: [
                { name: 'duration', label: 'Duration (milliseconds)', type: 'number', min: 100, max: 60000, default: 1000 }
            ],
            executor: async (action, context, services) => {
                await new Promise(resolve => setTimeout(resolve, action.duration || 1000));
            }
        });

        // Flow Control Actions
        this.register('flow:trigger', {
            name: 'Trigger Another Flow',
            description: 'Trigger another automation flow',
            category: 'logic',
            icon: 'git-branch',
            fields: [
                { name: 'flowId', label: 'Flow ID', type: 'number', required: true },
                { name: 'passContext', label: 'Pass Context', type: 'checkbox', default: true }
            ],
            executor: async (action, context, services) => {
                const iftttEngine = services.iftttEngine;
                if (!iftttEngine) throw new Error('IFTTT engine not available');
                
                const newContext = action.passContext ? context : {};
                await iftttEngine.executeFlowById(action.flowId, newContext);
            }
        });

        this.register('flow:stop', {
            name: 'Stop Flow Execution',
            description: 'Stop executing remaining actions',
            category: 'logic',
            icon: 'square',
            fields: [],
            executor: async (action, context, services) => {
                context.stopExecution = true;
            }
        });

        // Log Action
        this.register('log:write', {
            name: 'Write to Log',
            description: 'Write a log message',
            category: 'utility',
            icon: 'file-text',
            fields: [
                { name: 'message', label: 'Message', type: 'textarea', required: true },
                { name: 'level', label: 'Log Level', type: 'select', options: ['debug', 'info', 'warn', 'error'], default: 'info' }
            ],
            executor: async (action, context, services) => {
                const logger = services.logger;
                if (!logger) throw new Error('Logger not available');
                
                const message = services.templateEngine.render(action.message, context.data);
                const level = action.level || 'info';
                
                logger[level](`[Flow Log] ${message}`);
            }
        });

        // File Action
        this.register('file:write', {
            name: 'Write to File',
            description: 'Write data to a file (safe directory)',
            category: 'utility',
            icon: 'save',
            fields: [
                { name: 'filename', label: 'Filename', type: 'text', required: true },
                { name: 'content', label: 'Content', type: 'textarea', required: true },
                { name: 'append', label: 'Append', type: 'checkbox', default: true }
            ],
            executor: async (action, context, services) => {
                const fs = services.fs;
                const path = services.path;
                const safeDir = services.safeDir;
                
                if (!fs || !path || !safeDir) throw new Error('File system not available');
                
                const filename = path.basename(action.filename);
                const safePath = path.join(safeDir, filename);
                
                if (!safePath.startsWith(safeDir)) {
                    throw new Error('Path traversal attempt detected');
                }
                
                const content = services.templateEngine.render(action.content, context.data);
                
                if (action.append) {
                    await fs.appendFile(safePath, content + '\n', 'utf8');
                } else {
                    await fs.writeFile(safePath, content, 'utf8');
                }
            }
        });

        // Notification Action
        this.register('notification:send', {
            name: 'Send Notification',
            description: 'Send notification to dashboard',
            category: 'utility',
            icon: 'bell',
            fields: [
                { name: 'title', label: 'Title', type: 'text', required: true },
                { name: 'message', label: 'Message', type: 'textarea', required: true },
                { name: 'type', label: 'Type', type: 'select', options: ['info', 'success', 'warning', 'error'], default: 'info' }
            ],
            executor: async (action, context, services) => {
                const io = services.io;
                if (!io) throw new Error('Socket.io not available');
                
                io.emit('notification', {
                    title: services.templateEngine.render(action.title, context.data),
                    message: services.templateEngine.render(action.message, context.data),
                    type: action.type || 'info',
                    timestamp: Date.now()
                });
            }
        });
    }
}

module.exports = ActionRegistry;
