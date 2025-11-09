const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

class FlowEngine {
    constructor(db, alertManager, ttsEngine) {
        this.db = db;
        this.alertManager = alertManager;
        this.ttsEngine = ttsEngine;
    }

    async processEvent(eventType, eventData) {
        try {
            // Alle aktiven Flows abrufen
            const flows = this.db.getEnabledFlows();

            // Flows filtern nach passendem Trigger-Typ
            const matchingFlows = flows.filter(flow => flow.trigger_type === eventType);

            if (matchingFlows.length === 0) {
                return; // Keine Flows für diesen Event-Typ
            }

            // Flows durchgehen und Conditions prüfen
            for (const flow of matchingFlows) {
                const conditionMet = this.evaluateCondition(flow.trigger_condition, eventData);

                if (conditionMet) {
                    console.log(`⚡ Flow triggered: "${flow.name}"`);
                    await this.executeFlow(flow, eventData);
                }
            }

        } catch (error) {
            console.error('❌ Flow processing error:', error.message);
        }
    }

    evaluateCondition(condition, eventData) {
        // Wenn keine Condition, immer true
        if (!condition) {
            return true;
        }

        const { operator, field, value } = condition;

        // Feld-Wert aus Event-Daten holen
        const fieldValue = this.getNestedValue(eventData, field);

        // Operator auswerten
        switch (operator) {
            case '==':
            case 'equals':
                return fieldValue == value;

            case '!=':
            case 'not_equals':
                return fieldValue != value;

            case '>':
            case 'greater_than':
                return Number(fieldValue) > Number(value);

            case '<':
            case 'less_than':
                return Number(fieldValue) < Number(value);

            case '>=':
            case 'greater_or_equal':
                return Number(fieldValue) >= Number(value);

            case '<=':
            case 'less_or_equal':
                return Number(fieldValue) <= Number(value);

            case 'contains':
                return String(fieldValue).toLowerCase().includes(String(value).toLowerCase());

            case 'not_contains':
                return !String(fieldValue).toLowerCase().includes(String(value).toLowerCase());

            case 'starts_with':
                return String(fieldValue).toLowerCase().startsWith(String(value).toLowerCase());

            case 'ends_with':
                return String(fieldValue).toLowerCase().endsWith(String(value).toLowerCase());

            default:
                console.warn(`⚠️ Unknown operator: ${operator}`);
                return false;
        }
    }

    getNestedValue(obj, path) {
        // Unterstützt verschachtelte Pfade wie "user.name" oder "gift.coins"
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }

    async executeFlow(flow, eventData) {
        try {
            // Actions sequenziell ausführen
            for (const action of flow.actions) {
                await this.executeAction(action, eventData);
            }
        } catch (error) {
            console.error(`❌ Flow execution error (${flow.name}):`, error.message);
        }
    }

    async executeAction(action, eventData) {
        try {
            switch (action.type) {

                // ========== TTS ==========
                case 'tts':
                case 'speak': {
                    const text = this.replaceVariables(action.text, eventData);
                    const voice = action.voice || null;
                    await this.ttsEngine.speak(eventData.username, text, voice);
                    break;
                }

                // ========== ALERT ==========
                case 'alert':
                case 'show_alert': {
                    const alertConfig = {
                        text_template: action.text || '',
                        sound_file: action.sound_file || null,
                        sound_volume: action.volume || 80,
                        duration: action.duration || 5,
                        enabled: true
                    };
                    this.alertManager.addAlert(action.alert_type || 'custom', eventData, alertConfig);
                    break;
                }

                // ========== SOUND ==========
                case 'sound':
                case 'play_sound': {
                    // Sound-Datei an Frontend senden
                    const soundFile = action.file;
                    const volume = action.volume || 80;
                    // Hier könnte man die Sound-Datei laden und als Base64 senden
                    // Für jetzt senden wir nur den Dateinamen
                    console.log(`🔊 Playing sound: ${soundFile} (${volume}%)`);
                    break;
                }

                // ========== WEBHOOK ==========
                case 'webhook':
                case 'http_request': {
                    const url = action.url;
                    const method = action.method || 'POST';
                    const body = action.body ? this.replaceVariables(JSON.stringify(action.body), eventData) : null;

                    const response = await axios({
                        method: method,
                        url: url,
                        data: body ? JSON.parse(body) : eventData,
                        headers: {
                            'Content-Type': 'application/json',
                            ...(action.headers || {})
                        },
                        timeout: 5000
                    });

                    console.log(`🌐 Webhook sent to ${url}: ${response.status}`);
                    break;
                }

                // ========== WRITE FILE ==========
                case 'write_file':
                case 'log_to_file': {
                    const filePath = action.file_path;
                    const content = this.replaceVariables(action.content, eventData);
                    const append = action.append !== false; // Default: append

                    const fullPath = path.resolve(filePath);

                    if (append) {
                        await fs.appendFile(fullPath, content + '\n', 'utf8');
                    } else {
                        await fs.writeFile(fullPath, content, 'utf8');
                    }

                    console.log(`📝 Written to file: ${filePath}`);
                    break;
                }

                // ========== DELAY ==========
                case 'delay':
                case 'wait': {
                    const duration = action.duration || 1000;
                    await new Promise(resolve => setTimeout(resolve, duration));
                    console.log(`⏱️ Delayed ${duration}ms`);
                    break;
                }

                // ========== COMMAND ==========
                case 'command':
                case 'run_command': {
                    // Sicherheitswarnung: Befehle ausführen kann gefährlich sein
                    console.warn('⚠️ Command execution is disabled for security reasons');
                    // const { exec } = require('child_process');
                    // exec(action.command, (error, stdout, stderr) => {
                    //     if (error) console.error(`Command error: ${error}`);
                    // });
                    break;
                }

                // ========== CUSTOM ==========
                case 'custom': {
                    console.log(`⚙️ Custom action: ${action.name || 'unnamed'}`);
                    // Hier könnten Custom-Actions implementiert werden
                    break;
                }

                default:
                    console.warn(`⚠️ Unknown action type: ${action.type}`);
            }

        } catch (error) {
            console.error(`❌ Action execution error (${action.type}):`, error.message);
        }
    }

    replaceVariables(text, eventData) {
        if (!text) return '';

        let result = text;

        // Standard-Variablen
        const variables = {
            '{username}': eventData.username || eventData.uniqueId || 'Unknown',
            '{nickname}': eventData.nickname || eventData.username || 'Unknown',
            '{message}': eventData.message || '',
            '{gift_name}': eventData.giftName || '',
            '{coins}': eventData.coins || 0,
            '{repeat_count}': eventData.repeatCount || 1,
            '{like_count}': eventData.likeCount || 1,
            '{total_coins}': eventData.totalCoins || 0,
            '{timestamp}': new Date().toISOString(),
            '{date}': new Date().toLocaleDateString(),
            '{time}': new Date().toLocaleTimeString()
        };

        // Variablen ersetzen
        Object.entries(variables).forEach(([key, value]) => {
            result = result.replace(new RegExp(key, 'g'), value);
        });

        return result;
    }

    // Test-Funktion
    async testFlow(flowId, testEventData = {}) {
        const flow = this.db.getFlow(flowId);
        if (!flow) {
            throw new Error(`Flow with ID ${flowId} not found`);
        }

        console.log(`🧪 Testing flow: "${flow.name}"`);

        const defaultData = {
            username: 'TestUser',
            nickname: 'Test User',
            message: 'Test message',
            giftName: 'Rose',
            coins: 100,
            repeatCount: 5
        };

        const eventData = { ...defaultData, ...testEventData };
        await this.executeFlow(flow, eventData);
    }
}

module.exports = FlowEngine;
