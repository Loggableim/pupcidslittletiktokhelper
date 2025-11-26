/**
 * TikTok Event Handlers for Goals Plugin
 * Processes TikTok events and updates goals
 */

class GoalsEventHandlers {
    constructor(plugin) {
        this.plugin = plugin;
        this.api = plugin.api;
        this.db = plugin.db;
        this.stateMachineManager = plugin.stateMachineManager;
    }

    /**
     * Register TikTok event handlers
     */
    registerHandlers() {
        // Gift event (coins)
        this.api.registerTikTokEvent('gift', (data) => {
            this.handleGift(data);
        });

        // Like event
        this.api.registerTikTokEvent('like', (data) => {
            this.handleLike(data);
        });

        // Follow event
        this.api.registerTikTokEvent('follow', (data) => {
            this.handleFollow(data);
        });

        this.api.log('✅ Goals TikTok event handlers registered', 'info');
    }

    /**
     * Handle gift event (coins)
     */
    handleGift(data) {
        try {
            // FIX: Use data.coins (already calculated as diamondCount * repeatCount)
            // instead of data.diamondCount (which is just the raw diamond value per gift)
            const coins = data.coins || 0;
            if (coins === 0) return;

            // Get all enabled coin goals
            const goals = this.db.getGoalsByType('coin');
            const enabledGoals = goals.filter(g => g.enabled);

            for (const goal of enabledGoals) {
                this.incrementGoal(goal.id, coins);
            }

            this.api.log(`Gift received: ${coins} coins (${data.giftName || 'unknown'} x${data.repeatCount || 1})`, 'debug');
        } catch (error) {
            this.api.log(`Error handling gift event: ${error.message}`, 'error');
        }
    }

    /**
     * Handle like event
     */
    handleLike(data) {
        try {
            // Get all enabled likes goals
            const goals = this.db.getGoalsByType('likes');
            const enabledGoals = goals.filter(g => g.enabled);

            // Use totalLikes from the event data (cumulative total from stream)
            // This matches the same engine used in dashboard and main UI
            const totalLikes = data.totalLikes;

            if (totalLikes != null) {
                // Set the goal value to the total likes count
                for (const goal of enabledGoals) {
                    this.setGoalValue(goal.id, totalLikes);
                }

                this.api.log(`Likes total updated: ${totalLikes}`, 'debug');
            } else {
                // Fallback: increment by individual likeCount (legacy behavior)
                const likeCount = data.likeCount || 1;

                for (const goal of enabledGoals) {
                    this.incrementGoal(goal.id, likeCount);
                }

                this.api.log(`Likes received: ${likeCount}`, 'debug');
            }
        } catch (error) {
            this.api.log(`Error handling like event: ${error.message}`, 'error');
        }
    }

    /**
     * Handle follow event
     */
    handleFollow(data) {
        try {
            // Get all enabled follower goals
            const goals = this.db.getGoalsByType('follower');
            const enabledGoals = goals.filter(g => g.enabled);

            for (const goal of enabledGoals) {
                this.incrementGoal(goal.id, 1);
            }

            this.api.log(`New follower: ${data.uniqueId || 'unknown'}`, 'debug');
        } catch (error) {
            this.api.log(`Error handling follow event: ${error.message}`, 'error');
        }
    }

    /**
     * Increment goal value
     */
    incrementGoal(goalId, amount) {
        try {
            const goal = this.db.getGoal(goalId);
            if (!goal) return;

            // Get state machine
            const machine = this.stateMachineManager.getMachine(goalId);

            // Update via state machine
            const success = machine.incrementValue(amount);

            if (success) {
                // Update database
                const updatedGoal = this.db.incrementValue(goalId, amount);

                // Broadcast to all clients
                this.plugin.broadcastGoalValueChanged(updatedGoal);

                // Check if goal reached
                if (machine.isReached() && machine.getState() === 'reached') {
                    this.plugin.broadcastGoalReached(goalId);
                }
            }
        } catch (error) {
            this.api.log(`Error incrementing goal ${goalId}: ${error.message}`, 'error');
        }
    }

    /**
     * Set goal value directly
     */
    setGoalValue(goalId, value) {
        try {
            const goal = this.db.getGoal(goalId);
            if (!goal) return;

            // Get state machine
            const machine = this.stateMachineManager.getMachine(goalId);

            // Update via state machine
            const success = machine.updateValue(value);

            if (success) {
                // Update database
                const updatedGoal = this.db.updateValue(goalId, value);

                // Broadcast to all clients
                this.plugin.broadcastGoalValueChanged(updatedGoal);

                // Check if goal reached
                if (machine.isReached() && machine.getState() === 'reached') {
                    this.plugin.broadcastGoalReached(goalId);
                }
            }
        } catch (error) {
            this.api.log(`Error setting goal value ${goalId}: ${error.message}`, 'error');
        }
    }
}

module.exports = GoalsEventHandlers;
