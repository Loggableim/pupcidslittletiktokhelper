/**
 * IFTTT Condition Registry
 * Central registry for all available conditions in the automation system
 */

class ConditionRegistry {
    constructor(logger) {
        this.logger = logger;
        this.conditions = new Map();
        this.operators = new Map();
        this.registerCoreConditions();
        this.registerCoreOperators();
    }

    /**
     * Register a condition type
     * @param {string} id - Unique condition ID
     * @param {Object} config - Condition configuration
     */
    register(id, config) {
        if (this.conditions.has(id)) {
            this.logger?.warn(`Condition ${id} already registered, overwriting`);
        }

        const condition = {
            id,
            name: config.name || id,
            description: config.description || '',
            category: config.category || 'custom',
            icon: config.icon || 'filter',
            valueType: config.valueType || 'text', // text, number, boolean, regex, list
            operators: config.operators || ['equals'],
            evaluator: config.evaluator || null,
            metadata: config.metadata || {}
        };

        this.conditions.set(id, condition);
        this.logger?.info(`✅ Registered condition: ${id}`);
    }

    /**
     * Register an operator
     */
    registerOperator(id, config) {
        const operator = {
            id,
            name: config.name || id,
            symbol: config.symbol || id,
            evaluator: config.evaluator,
            valueTypes: config.valueTypes || ['text', 'number']
        };

        this.operators.set(id, operator);
    }

    /**
     * Unregister a condition
     */
    unregister(id) {
        if (this.conditions.has(id)) {
            this.conditions.delete(id);
            this.logger?.info(`Unregistered condition: ${id}`);
            return true;
        }
        return false;
    }

    /**
     * Get condition configuration
     */
    get(id) {
        return this.conditions.get(id);
    }

    /**
     * Get operator
     */
    getOperator(id) {
        return this.operators.get(id);
    }

    /**
     * Get all conditions
     */
    getAll() {
        return Array.from(this.conditions.values());
    }

    /**
     * Get all operators
     */
    getAllOperators() {
        return Array.from(this.operators.values());
    }

    /**
     * Get conditions by category
     */
    getByCategory(category) {
        return Array.from(this.conditions.values()).filter(c => c.category === category);
    }

    /**
     * Evaluate a condition
     */
    evaluate(condition, context) {
        const conditionDef = this.conditions.get(condition.type);
        if (!conditionDef) {
            this.logger?.warn(`Unknown condition type: ${condition.type}`);
            return false;
        }

        // Use custom evaluator if provided
        if (conditionDef.evaluator) {
            return conditionDef.evaluator(condition, context);
        }

        // Default evaluation using operators
        const operator = this.operators.get(condition.operator);
        if (!operator) {
            this.logger?.warn(`Unknown operator: ${condition.operator}`);
            return false;
        }

        return operator.evaluator(condition.value, condition.compareValue, context);
    }

    /**
     * Register core operators
     */
    registerCoreOperators() {
        // Comparison Operators
        this.registerOperator('equals', {
            name: 'Equals',
            symbol: '==',
            valueTypes: ['text', 'number', 'boolean'],
            evaluator: (value, compareValue) => value == compareValue
        });

        this.registerOperator('not_equals', {
            name: 'Not Equals',
            symbol: '!=',
            valueTypes: ['text', 'number', 'boolean'],
            evaluator: (value, compareValue) => value != compareValue
        });

        this.registerOperator('greater_than', {
            name: 'Greater Than',
            symbol: '>',
            valueTypes: ['number'],
            evaluator: (value, compareValue) => Number(value) > Number(compareValue)
        });

        this.registerOperator('less_than', {
            name: 'Less Than',
            symbol: '<',
            valueTypes: ['number'],
            evaluator: (value, compareValue) => Number(value) < Number(compareValue)
        });

        this.registerOperator('greater_or_equal', {
            name: 'Greater or Equal',
            symbol: '>=',
            valueTypes: ['number'],
            evaluator: (value, compareValue) => Number(value) >= Number(compareValue)
        });

        this.registerOperator('less_or_equal', {
            name: 'Less or Equal',
            symbol: '<=',
            valueTypes: ['number'],
            evaluator: (value, compareValue) => Number(value) <= Number(compareValue)
        });

        // String Operators
        this.registerOperator('contains', {
            name: 'Contains',
            symbol: 'contains',
            valueTypes: ['text'],
            evaluator: (value, compareValue) => 
                String(value).toLowerCase().includes(String(compareValue).toLowerCase())
        });

        this.registerOperator('not_contains', {
            name: 'Does Not Contain',
            symbol: 'not contains',
            valueTypes: ['text'],
            evaluator: (value, compareValue) => 
                !String(value).toLowerCase().includes(String(compareValue).toLowerCase())
        });

        this.registerOperator('starts_with', {
            name: 'Starts With',
            symbol: 'starts with',
            valueTypes: ['text'],
            evaluator: (value, compareValue) => 
                String(value).toLowerCase().startsWith(String(compareValue).toLowerCase())
        });

        this.registerOperator('ends_with', {
            name: 'Ends With',
            symbol: 'ends with',
            valueTypes: ['text'],
            evaluator: (value, compareValue) => 
                String(value).toLowerCase().endsWith(String(compareValue).toLowerCase())
        });

        this.registerOperator('matches_regex', {
            name: 'Matches Pattern (Regex)',
            symbol: 'matches',
            valueTypes: ['text'],
            evaluator: (value, compareValue) => {
                try {
                    const regex = new RegExp(compareValue, 'i');
                    return regex.test(String(value));
                } catch (e) {
                    return false;
                }
            }
        });

        // List Operators
        this.registerOperator('in_list', {
            name: 'Is In List',
            symbol: 'in',
            valueTypes: ['text', 'number'],
            evaluator: (value, compareValue) => {
                const list = Array.isArray(compareValue) ? compareValue : String(compareValue).split(',').map(v => v.trim());
                return list.includes(String(value));
            }
        });

        this.registerOperator('not_in_list', {
            name: 'Is Not In List',
            symbol: 'not in',
            valueTypes: ['text', 'number'],
            evaluator: (value, compareValue) => {
                const list = Array.isArray(compareValue) ? compareValue : String(compareValue).split(',').map(v => v.trim());
                return !list.includes(String(value));
            }
        });

        // Boolean Operators
        this.registerOperator('is_true', {
            name: 'Is True',
            symbol: 'is true',
            valueTypes: ['boolean'],
            evaluator: (value) => Boolean(value) === true
        });

        this.registerOperator('is_false', {
            name: 'Is False',
            symbol: 'is false',
            valueTypes: ['boolean'],
            evaluator: (value) => Boolean(value) === false
        });

        // Existence Operators
        this.registerOperator('exists', {
            name: 'Exists',
            symbol: 'exists',
            valueTypes: ['text', 'number', 'boolean'],
            evaluator: (value) => value !== null && value !== undefined && value !== ''
        });

        this.registerOperator('not_exists', {
            name: 'Does Not Exist',
            symbol: 'not exists',
            valueTypes: ['text', 'number', 'boolean'],
            evaluator: (value) => value === null || value === undefined || value === ''
        });
    }

    /**
     * Register core conditions
     */
    registerCoreConditions() {
        // Field-based Conditions
        this.register('field_value', {
            name: 'Field Value',
            description: 'Compare a field value',
            category: 'basic',
            icon: 'hash',
            valueType: 'dynamic',
            operators: ['equals', 'not_equals', 'greater_than', 'less_than', 'greater_or_equal', 'less_or_equal', 'contains', 'not_contains', 'starts_with', 'ends_with', 'matches_regex', 'in_list', 'not_in_list', 'exists', 'not_exists']
        });

        // User-based Conditions
        this.register('user_level', {
            name: 'User Level',
            description: 'Check user subscriber/member level',
            category: 'user',
            icon: 'user',
            valueType: 'number',
            operators: ['equals', 'not_equals', 'greater_than', 'less_than', 'greater_or_equal', 'less_or_equal']
        });

        this.register('user_follower', {
            name: 'User is Follower',
            description: 'Check if user is a follower',
            category: 'user',
            icon: 'user-check',
            valueType: 'boolean',
            operators: ['is_true', 'is_false']
        });

        this.register('username_check', {
            name: 'Username',
            description: 'Check username',
            category: 'user',
            icon: 'at-sign',
            valueType: 'text',
            operators: ['equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'ends_with', 'matches_regex', 'in_list', 'not_in_list']
        });

        // Cooldown Conditions
        this.register('cooldown', {
            name: 'Cooldown',
            description: 'Prevent execution within time period',
            category: 'timing',
            icon: 'clock',
            valueType: 'number',
            metadata: { requiresCooldownTracking: true },
            evaluator: (condition, context) => {
                const key = condition.key || 'default';
                const seconds = condition.value || 60;
                const lastTrigger = context.cooldowns?.get(key);
                
                if (!lastTrigger) return true;
                
                const elapsed = (Date.now() - lastTrigger) / 1000;
                return elapsed >= seconds;
            }
        });

        this.register('rate_limit', {
            name: 'Rate Limit',
            description: 'Limit executions per time window',
            category: 'timing',
            icon: 'zap',
            valueType: 'number',
            metadata: { requiresRateLimitTracking: true },
            evaluator: (condition, context) => {
                const key = condition.key || 'default';
                const maxCount = condition.maxCount || 5;
                const windowSeconds = condition.windowSeconds || 60;
                
                const queue = context.rateLimits?.get(key) || [];
                const now = Date.now();
                const cutoff = now - (windowSeconds * 1000);
                
                // Remove old entries
                const recent = queue.filter(t => t > cutoff);
                
                return recent.length < maxCount;
            }
        });

        // Time-based Conditions
        this.register('time_of_day', {
            name: 'Time of Day',
            description: 'Check current time',
            category: 'timing',
            icon: 'sun',
            valueType: 'time',
            evaluator: (condition, context) => {
                const now = new Date();
                const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
                
                if (condition.operator === 'between') {
                    return currentTime >= condition.startTime && currentTime <= condition.endTime;
                } else if (condition.operator === 'equals') {
                    return currentTime === condition.value;
                }
                
                return false;
            }
        });

        this.register('day_of_week', {
            name: 'Day of Week',
            description: 'Check day of week',
            category: 'timing',
            icon: 'calendar',
            valueType: 'list',
            evaluator: (condition, context) => {
                const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const currentDay = days[new Date().getDay()];
                const allowedDays = condition.value || [];
                
                return allowedDays.includes(currentDay);
            }
        });

        // State-based Conditions
        this.register('tts_speaking', {
            name: 'TTS is Speaking',
            description: 'Check if TTS is currently speaking',
            category: 'state',
            icon: 'mic',
            valueType: 'boolean',
            evaluator: (condition, context) => {
                const isSpeaking = context.state?.tts?.isSpeaking || false;
                return condition.operator === 'is_true' ? isSpeaking : !isSpeaking;
            }
        });

        this.register('connection_status', {
            name: 'Connection Status',
            description: 'Check TikTok connection status',
            category: 'state',
            icon: 'wifi',
            valueType: 'boolean',
            evaluator: (condition, context) => {
                const isConnected = context.state?.tiktok?.connected || false;
                return condition.operator === 'is_true' ? isConnected : !isConnected;
            }
        });

        this.register('variable_check', {
            name: 'Variable Value',
            description: 'Check custom variable value',
            category: 'state',
            icon: 'database',
            valueType: 'dynamic',
            operators: ['equals', 'not_equals', 'greater_than', 'less_than', 'greater_or_equal', 'less_or_equal', 'contains', 'not_contains', 'exists', 'not_exists']
        });

        // Random Chance
        this.register('random_chance', {
            name: 'Random Chance',
            description: 'Random percentage chance',
            category: 'logic',
            icon: 'shuffle',
            valueType: 'number',
            evaluator: (condition, context) => {
                const chance = condition.value || 50; // Default 50%
                return Math.random() * 100 < chance;
            }
        });

        // Counter Conditions
        this.register('execution_count', {
            name: 'Execution Count',
            description: 'Check how many times rule has executed',
            category: 'logic',
            icon: 'hash',
            valueType: 'number',
            operators: ['equals', 'not_equals', 'greater_than', 'less_than', 'greater_or_equal', 'less_or_equal']
        });
    }

    /**
     * Evaluate a complex condition (with AND/OR/NOT logic)
     */
    evaluateComplex(conditionTree, context) {
        if (!conditionTree) return true;

        // Handle logical operators
        if (conditionTree.logic === 'AND') {
            return conditionTree.conditions.every(c => this.evaluateComplex(c, context));
        } else if (conditionTree.logic === 'OR') {
            return conditionTree.conditions.some(c => this.evaluateComplex(c, context));
        } else if (conditionTree.logic === 'NOT') {
            return !this.evaluateComplex(conditionTree.condition, context);
        }

        // Evaluate single condition
        return this.evaluate(conditionTree, context);
    }
}

module.exports = ConditionRegistry;
