const EventEmitter = require('events');

/**
 * Goals Module - Multi-Goal System mit individualisierbaren Overlays
 * Portiert aus Python MultiGoal PRO
 */

// Default Style Configuration
const DEFAULT_STYLE = {
    // Layout
    width_pct: 100,
    bar_height_px: 36,
    round_px: 18,

    // Background
    bg_mode: 'solid',           // solid|gradient
    bg_color: '#002f00',
    bg_color2: '#004d00',
    bg_angle: 135,
    bar_bg: 'rgba(255,255,255,.15)',

    // Fill
    fill_mode: 'solid',         // solid|gradient|stripes
    fill_color1: '#4ade80',
    fill_color2: '#22c55e',
    fill_angle: 90,
    stripes_speed_s: 2.5,
    stripes_alpha: 0.25,

    // Border & Shadow
    border_enabled: false,
    border_color: 'rgba(255,255,255,.35)',
    border_width: 2,
    shadow_enabled: true,
    shadow_css: '0 10px 30px rgba(0,0,0,.25)',

    // Text
    font_family: "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif",
    font_url: '',
    text_color: '#ffffff',
    text_size_px: 20,
    letter_spacing_px: 0.5,
    uppercase: false,

    // Label
    label_pos: 'below',         // inside|below
    label_align: 'center',      // left|center|right
    label_template: '{total} / {goal} ({percent}%)',
    show_percent: true,
    show_goal_num: true,
    show_total_num: true,
    prefix_text: '',
    suffix_text: '',

    // Animation
    anim_duration_ms: 900,
    pulse_on_full: true,
    confetti_on_goal: true
};

// Default Goal Configurations
const DEFAULT_GOALS = {
    likes: {
        name: 'Likes',
        goal: 1000,
        mode: 'add',            // add|double|hide
        add_amount: 1000,
        show_goal: true,
        style: {
            ...DEFAULT_STYLE,
            label_template: 'Likes: {total} / {goal} ({percent}%)',
            fill_color1: '#4ade80',
            fill_color2: '#22c55e'
        }
    },
    followers: {
        name: 'Follower',
        goal: 10,
        mode: 'add',
        add_amount: 10,
        show_goal: true,
        style: {
            ...DEFAULT_STYLE,
            label_template: 'Follower: {total} / {goal}',
            show_percent: false,
            fill_color1: '#60a5fa',
            fill_color2: '#3b82f6'
        }
    },
    subs: {
        name: 'Subscriber',
        goal: 5,
        mode: 'add',
        add_amount: 5,
        show_goal: true,
        style: {
            ...DEFAULT_STYLE,
            label_template: 'Subscriber: {total} / {goal}',
            show_percent: false,
            fill_color1: '#f472b6',
            fill_color2: '#ec4899'
        }
    },
    coins: {
        name: 'Coins',
        goal: 1000,
        mode: 'add',
        add_amount: 1000,
        show_goal: true,
        style: {
            ...DEFAULT_STYLE,
            label_template: 'Coins: {total} / {goal} ({percent}%)',
            fill_color1: '#fbbf24',
            fill_color2: '#f59e0b'
        }
    }
};

class GoalManager extends EventEmitter {
    constructor(db, io) {
        super();
        this.db = db;
        this.io = io;

        // State für jedes Goal
        this.state = {
            likes: { total: 0, goal: 1000, show: true },
            followers: { total: 0, goal: 10, show: true },
            subs: { total: 0, goal: 5, show: true },
            coins: { total: 0, goal: 1000, show: true }
        };

        // Initialisiere aus Datenbank
        this.loadState();

        console.log('✅ Goal Manager initialized');
    }

    /**
     * Lade Goal-State aus DB
     */
    loadState() {
        for (const key of Object.keys(DEFAULT_GOALS)) {
            const config = this.getGoalConfig(key);
            if (config) {
                this.state[key].goal = config.goal;
                this.state[key].show = config.show_goal;
            }

            // Lade gespeicherten Total-Wert
            const total = this.db.getSetting(`goal_${key}_total`);
            if (total !== null) {
                this.state[key].total = parseInt(total) || 0;
            }
        }
    }

    /**
     * Hole Goal-Konfiguration
     */
    getGoalConfig(key) {
        const raw = this.db.getSetting(`goal_${key}_config`);
        if (raw) {
            try {
                return JSON.parse(raw);
            } catch (e) {
                console.error(`Error parsing goal config for ${key}:`, e);
            }
        }
        return DEFAULT_GOALS[key] || null;
    }

    /**
     * Speichere Goal-Konfiguration
     */
    saveGoalConfig(key, config) {
        this.db.setSetting(`goal_${key}_config`, JSON.stringify(config));
    }

    /**
     * Speichere Total-Wert
     */
    saveTotal(key) {
        this.db.setSetting(`goal_${key}_total`, this.state[key].total.toString());
    }

    /**
     * Hole alle Goal-Konfigurationen
     */
    getAllGoals() {
        const goals = {};
        for (const key of Object.keys(DEFAULT_GOALS)) {
            goals[key] = this.getGoalConfig(key);
        }
        return goals;
    }

    /**
     * Berechne Prozentsatz
     */
    getPercent(key) {
        const s = this.state[key];
        if (!s.show || s.goal <= 0) return 0;
        return Math.max(0, Math.min(1, s.total / s.goal));
    }

    /**
     * Setze Goal-Wert (absolut)
     */
    async setGoal(key, newTotal) {
        if (!this.state[key]) return;

        const oldTotal = this.state[key].total;
        this.state[key].total = Math.max(0, parseInt(newTotal));
        this.saveTotal(key);

        await this.broadcastGoal(key);
        await this.applyGoalRules(key);

        console.log(`📊 Goal ${key} set: ${oldTotal} → ${this.state[key].total}`);
    }

    /**
     * Inkrementiere Goal-Wert
     */
    async incrementGoal(key, delta) {
        if (!this.state[key]) return;
        await this.setGoal(key, this.state[key].total + parseInt(delta));
    }

    /**
     * Prüfe und wende Goal-Regeln an (add/double/hide)
     */
    async applyGoalRules(key) {
        const s = this.state[key];
        const config = this.getGoalConfig(key);

        if (!s.show || !config) return;

        // Goal erreicht?
        if (s.total >= s.goal) {
            console.log(`🎯 Goal reached: ${key} (${s.total}/${s.goal})`);

            // Sende goal_reached Event
            this.io.to(`goal_${key}`).emit('goal:reached', {
                key: key,
                total: s.total,
                goal: s.goal
            });

            // Wende Modus an
            if (config.mode === 'add') {
                // Erhöhe Ziel um add_amount
                while (s.total >= s.goal) {
                    s.goal += Math.max(1, parseInt(config.add_amount));
                }
                console.log(`➕ Goal ${key} increased to ${s.goal}`);
            } else if (config.mode === 'double') {
                // Verdopple Ziel
                while (s.total >= s.goal) {
                    s.goal = Math.max(1, s.goal * 2);
                }
                console.log(`✖️2 Goal ${key} doubled to ${s.goal}`);
            } else if (config.mode === 'hide') {
                // Blende Goal aus
                s.show = false;
                config.show_goal = false;
                console.log(`🙈 Goal ${key} hidden`);
            }

            // Speichere neue Konfiguration
            config.goal = s.goal;
            this.saveGoalConfig(key, config);

            // Broadcast Update
            await this.broadcastGoal(key);
        }
    }

    /**
     * Sende Goal-Update an alle Overlay-Clients
     */
    async broadcastGoal(key) {
        const s = this.state[key];
        const config = this.getGoalConfig(key);

        this.io.to(`goal_${key}`).emit('goal:update', {
            type: 'goal',
            total: s.total,
            goal: s.goal,
            show: s.show,
            pct: this.getPercent(key),
            style: config ? config.style : DEFAULT_GOALS[key].style
        });
    }

    /**
     * Update Goal-Konfiguration
     */
    async updateGoalConfig(key, updates) {
        const config = this.getGoalConfig(key);
        if (!config) return null;

        // Update Felder
        if (updates.goal !== undefined) {
            config.goal = Math.max(1, parseInt(updates.goal));
            this.state[key].goal = config.goal;
        }

        if (updates.mode !== undefined && ['add', 'double', 'hide'].includes(updates.mode)) {
            config.mode = updates.mode;
        }

        if (updates.add_amount !== undefined) {
            config.add_amount = Math.max(1, parseInt(updates.add_amount));
        }

        if (updates.show_goal !== undefined) {
            config.show_goal = Boolean(updates.show_goal);
            this.state[key].show = config.show_goal;
        }

        // Speichern
        this.saveGoalConfig(key, config);

        // Broadcast
        await this.broadcastGoal(key);

        return config;
    }

    /**
     * Update Style-Konfiguration
     */
    async updateStyle(key, styleUpdates) {
        const config = this.getGoalConfig(key);
        if (!config) return null;

        // Merge Style
        config.style = {
            ...config.style,
            ...styleUpdates
        };

        // Speichern
        this.saveGoalConfig(key, config);

        // Broadcast Style-Update
        this.io.to(`goal_${key}`).emit('goal:style', {
            type: 'style',
            style: config.style
        });

        return config.style;
    }

    /**
     * Reset Goal (Total auf 0)
     */
    async resetGoal(key) {
        if (!this.state[key]) return;

        this.state[key].total = 0;
        this.saveTotal(key);

        await this.broadcastGoal(key);

        console.log(`🔄 Goal ${key} reset to 0`);
    }

    /**
     * Reset alle Goals
     */
    async resetAllGoals() {
        for (const key of Object.keys(this.state)) {
            await this.resetGoal(key);
        }
    }

    /**
     * Hole aktuellen Status
     */
    getStatus() {
        const status = {};
        for (const key of Object.keys(this.state)) {
            status[key] = {
                ...this.state[key],
                percent: Math.round(this.getPercent(key) * 100),
                config: this.getGoalConfig(key)
            };
        }
        return status;
    }
}

module.exports = { GoalManager, DEFAULT_GOALS, DEFAULT_STYLE };
