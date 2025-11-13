const WebSocket = require('ws');
const EventEmitter = require('events');

/**
 * Live Goals Plugin
 *
 * Complete goals system with 4 goal types:
 * - Coin Goal: Tracks gift coins
 * - Likes Goal: Tracks likes in real-time
 * - Follower Goal: Tracks new followers
 * - Custom Goal: Manually controlled value
 *
 * Features:
 * - Event API integration (ws://localhost:21213)
 * - Real-time overlay updates
 * - Flow actions for goal manipulation
 * - Customizable goal progression (fixed/add/double/hide)
 * - Individual styling per goal
 */
class GoalsPlugin extends EventEmitter {
    constructor(api) {
        super();
        this.api = api;

        // Event API WebSocket Client
        this.eventApiWs = null;
        this.eventApiConnected = false;
        this.eventApiReconnectAttempts = 0;
        this.maxEventApiReconnectAttempts = 10;
        this.eventApiReconnectDelay = 5000; // 5 seconds

        // Goal state cache
        this.goals = new Map();

        // Goal type definitions
        this.goalTypes = ['coin', 'likes', 'follower', 'custom'];
    }

    async init() {
        this.api.log('Initializing Live Goals Plugin...', 'info');

        // Initialize database
        this.initializeDatabase();

        // Load goals from database
        this.loadGoals();

        // Register routes
        this.registerRoutes();

        // Register TikTok event handlers
        this.registerTikTokEventHandlers();

        // Register Socket.IO handlers
        this.registerSocketHandlers();

        // Connect to Event API
        this.connectToEventApi();

        // Register Flow Actions
        this.registerFlowActions();

        this.api.log('✅ Live Goals Plugin initialized', 'info');
    }

    /**
     * Initialize database tables for goals
     */
    initializeDatabase() {
        try {
            const db = this.api.getDatabase();

            // Enhanced Goals configuration table with position, size, design, animations
            db.exec(`
                CREATE TABLE IF NOT EXISTS goals_config (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    goal_type TEXT NOT NULL UNIQUE,
                    enabled INTEGER DEFAULT 1,
                    name TEXT NOT NULL,
                    description TEXT,
                    start_value INTEGER DEFAULT 0,
                    current_value INTEGER DEFAULT 0,
                    target_value INTEGER DEFAULT 1000,
                    progression_mode TEXT DEFAULT 'fixed',
                    increment_amount INTEGER DEFAULT 100,
                    -- NEW: Position & Size
                    position_x INTEGER DEFAULT 10,
                    position_y INTEGER DEFAULT 10,
                    width INTEGER DEFAULT 500,
                    height INTEGER DEFAULT 100,
                    z_index INTEGER DEFAULT 100,
                    -- NEW: Design & Styling
                    design_json TEXT,
                    style_json TEXT,
                    -- NEW: Animations
                    animation_json TEXT,
                    -- Template reference
                    template_id INTEGER,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (template_id) REFERENCES goals_templates(id) ON DELETE SET NULL
                )
            `);

            // Goals history/events table with enhanced tracking
            db.exec(`
                CREATE TABLE IF NOT EXISTS goals_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    goal_type TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    old_value INTEGER,
                    new_value INTEGER,
                    delta INTEGER,
                    source TEXT DEFAULT 'manual',
                    source_user TEXT,
                    metadata TEXT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Create indexes for performance
            db.exec(`
                CREATE INDEX IF NOT EXISTS idx_goals_history_type_time
                ON goals_history(goal_type, timestamp DESC)
            `);
            db.exec(`
                CREATE INDEX IF NOT EXISTS idx_goals_history_event_type
                ON goals_history(event_type)
            `);

            // NEW: Templates table
            db.exec(`
                CREATE TABLE IF NOT EXISTS goals_templates (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    description TEXT,
                    category TEXT DEFAULT 'custom',
                    author TEXT DEFAULT 'user',
                    config_json TEXT NOT NULL,
                    preview_image TEXT,
                    usage_count INTEGER DEFAULT 0,
                    is_favorite INTEGER DEFAULT 0,
                    tags TEXT,
                    version TEXT DEFAULT '1.0.0',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // NEW: Custom Assets table (fonts, icons, animations)
            db.exec(`
                CREATE TABLE IF NOT EXISTS goals_assets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    asset_type TEXT NOT NULL,
                    name TEXT NOT NULL,
                    category TEXT DEFAULT 'custom',
                    file_path TEXT NOT NULL,
                    file_type TEXT NOT NULL,
                    file_size INTEGER NOT NULL,
                    metadata_json TEXT,
                    usage_count INTEGER DEFAULT 0,
                    is_favorite INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(name, asset_type)
                )
            `);

            // NEW: HUD Configuration table
            db.exec(`
                CREATE TABLE IF NOT EXISTS goals_hud_config (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    enabled INTEGER DEFAULT 1,
                    resolution_width INTEGER DEFAULT 1920,
                    resolution_height INTEGER DEFAULT 1080,
                    layout_json TEXT,
                    global_style_json TEXT,
                    animations_json TEXT,
                    performance_json TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Initialize default HUD config
            db.exec(`
                INSERT OR IGNORE INTO goals_hud_config
                (id, enabled, resolution_width, resolution_height, layout_json, animations_json)
                VALUES (
                    1, 1, 1920, 1080,
                    '{"mode":"stacked","alignment":"left","spacing":15,"maxWidth":500}',
                    '{"entrance":"slideIn","exit":"fadeOut","transition":"smooth"}'
                )
            `);

            // Event API connection settings
            db.exec(`
                CREATE TABLE IF NOT EXISTS goals_event_api_config (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    enabled INTEGER DEFAULT 1,
                    websocket_url TEXT DEFAULT 'ws://localhost:21213',
                    auto_reconnect INTEGER DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Initialize default goals if not exist
            this.initializeDefaultGoals(db);

            // Initialize Event API config if not exist
            const eventApiStmt = db.prepare(`
                INSERT OR IGNORE INTO goals_event_api_config (id, enabled, websocket_url, auto_reconnect)
                VALUES (1, 1, 'ws://localhost:21213', 1)
            `);
            eventApiStmt.run();

            // Initialize default templates
            this.initializeDefaultTemplates(db);

            this.api.log('✅ Enhanced database schema initialized', 'info');
        } catch (error) {
            this.api.log(`Error initializing database: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Initialize default templates
     */
    initializeDefaultTemplates(db) {
        const defaultTemplates = [
            // 1. Minimalist Clean
            {
                name: 'Minimalist Clean',
                description: 'Clean and simple design with subtle animations, perfect for professional streams',
                category: 'official',
                author: 'Pup Cid',
                tags: 'minimal,professional,clean,simple',
                version: '1.0.0',
                config_json: JSON.stringify({
                    meta: {
                        name: 'Minimalist Clean',
                        preview: 'minimalist-clean.png'
                    },
                    global: {
                        font_family: 'Inter, -apple-system, sans-serif',
                        font_size: '16px',
                        spacing: '15px',
                        border_radius: '8px',
                        shadow: '0 2px 8px rgba(0,0,0,0.1)',
                        background: 'rgba(255, 255, 255, 0.95)',
                        text_color: '#1f2937'
                    },
                    goal_bar: {
                        height: 60,
                        padding: '12px 16px',
                        background: 'rgba(255, 255, 255, 0.98)',
                        border: '1px solid #e5e7eb',
                        border_radius: '8px',
                        shadow: '0 1px 3px rgba(0,0,0,0.08)',
                        progress_height: 24,
                        progress_border_radius: '4px',
                        progress_background: '#f3f4f6',
                        label_template: '{current} / {target}'
                    },
                    per_goal: {
                        coin: { fill_color1: '#fbbf24', fill_color2: '#f59e0b' },
                        likes: { fill_color1: '#10b981', fill_color2: '#059669' },
                        follower: { fill_color1: '#3b82f6', fill_color2: '#2563eb' },
                        custom: { fill_color1: '#8b5cf6', fill_color2: '#7c3aed' }
                    },
                    animations: {
                        entrance: 'fadeInUp',
                        progress: 'smooth',
                        completion: 'subtle',
                        confetti: false
                    }
                })
            },

            // 2. Gamer RGB
            {
                name: 'Gamer RGB',
                description: 'Vibrant RGB gradients with gaming-inspired effects and neon glow',
                category: 'official',
                author: 'Pup Cid',
                tags: 'gaming,rgb,neon,colorful,vibrant',
                version: '1.0.0',
                config_json: JSON.stringify({
                    meta: {
                        name: 'Gamer RGB',
                        preview: 'gamer-rgb.png'
                    },
                    global: {
                        font_family: 'Rajdhani, "Roboto Condensed", sans-serif',
                        font_size: '18px',
                        font_weight: '700',
                        spacing: '20px',
                        border_radius: '12px',
                        shadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 20px rgba(96,165,250,0.3)',
                        background: 'linear-gradient(135deg, rgba(17,24,39,0.95) 0%, rgba(31,41,55,0.95) 100%)',
                        text_color: '#ffffff'
                    },
                    goal_bar: {
                        height: 80,
                        padding: '16px 24px',
                        background: 'linear-gradient(135deg, rgba(17,24,39,0.98) 0%, rgba(31,41,55,0.98) 100%)',
                        border: '2px solid rgba(96,165,250,0.5)',
                        border_radius: '12px',
                        shadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 20px rgba(96,165,250,0.3)',
                        progress_height: 32,
                        progress_border_radius: '8px',
                        progress_background: 'rgba(30,41,59,0.8)',
                        label_template: '{current} / {target} ({percent}%)',
                        text_shadow: '0 2px 8px rgba(0,0,0,0.8), 0 0 10px currentColor'
                    },
                    per_goal: {
                        coin: {
                            fill_color1: '#fbbf24',
                            fill_color2: '#ef4444',
                            border_color: 'rgba(251,191,36,0.5)'
                        },
                        likes: {
                            fill_color1: '#22c55e',
                            fill_color2: '#10b981',
                            border_color: 'rgba(34,197,94,0.5)'
                        },
                        follower: {
                            fill_color1: '#3b82f6',
                            fill_color2: '#8b5cf6',
                            border_color: 'rgba(59,130,246,0.5)'
                        },
                        custom: {
                            fill_color1: '#a78bfa',
                            fill_color2: '#ec4899',
                            border_color: 'rgba(167,139,250,0.5)'
                        }
                    },
                    animations: {
                        entrance: 'slideInRight',
                        progress: 'pulse',
                        completion: 'explode',
                        confetti: true,
                        shimmer: true,
                        glow_pulse: true
                    },
                    custom_css: `
                        .goal-wrapper::before {
                            background: linear-gradient(90deg, var(--color1), var(--color2), var(--color1));
                            background-size: 200% 100%;
                            animation: rgbShift 3s linear infinite;
                        }
                        @keyframes rgbShift {
                            0%, 100% { background-position: 0% 50%; }
                            50% { background-position: 100% 50%; }
                        }
                    `
                })
            },

            // 3. Neon Glow
            {
                name: 'Neon Glow',
                description: 'Cyberpunk-inspired neon effects with glowing borders and vibrant colors',
                category: 'official',
                author: 'Pup Cid',
                tags: 'neon,cyberpunk,glow,retro,80s',
                version: '1.0.0',
                config_json: JSON.stringify({
                    meta: {
                        name: 'Neon Glow',
                        preview: 'neon-glow.png'
                    },
                    global: {
                        font_family: 'Orbitron, "Courier New", monospace',
                        font_size: '17px',
                        font_weight: '700',
                        spacing: '18px',
                        border_radius: '4px',
                        shadow: '0 0 30px rgba(236,72,153,0.5), 0 8px 32px rgba(0,0,0,0.6)',
                        background: 'rgba(10,10,30,0.95)',
                        text_color: '#ffffff'
                    },
                    goal_bar: {
                        height: 75,
                        padding: '14px 20px',
                        background: 'rgba(10,10,30,0.98)',
                        border: '2px solid #ec4899',
                        border_radius: '4px',
                        shadow: '0 0 30px rgba(236,72,153,0.6), inset 0 0 20px rgba(236,72,153,0.1)',
                        progress_height: 28,
                        progress_border_radius: '2px',
                        progress_background: 'rgba(15,15,40,0.9)',
                        label_template: '[ {current} / {target} ]',
                        text_shadow: '0 0 10px currentColor, 0 0 20px currentColor'
                    },
                    per_goal: {
                        coin: {
                            fill_color1: '#fbbf24',
                            fill_color2: '#fb923c',
                            border_color: '#fbbf24',
                            glow_color: 'rgba(251,191,36,0.6)'
                        },
                        likes: {
                            fill_color1: '#ec4899',
                            fill_color2: '#f43f5e',
                            border_color: '#ec4899',
                            glow_color: 'rgba(236,72,153,0.6)'
                        },
                        follower: {
                            fill_color1: '#06b6d4',
                            fill_color2: '#0ea5e9',
                            border_color: '#06b6d4',
                            glow_color: 'rgba(6,182,212,0.6)'
                        },
                        custom: {
                            fill_color1: '#a78bfa',
                            fill_color2: '#c084fc',
                            border_color: '#a78bfa',
                            glow_color: 'rgba(167,139,250,0.6)'
                        }
                    },
                    animations: {
                        entrance: 'glitchIn',
                        progress: 'neonPulse',
                        completion: 'neonExplode',
                        confetti: true,
                        glow_pulse: true,
                        flicker: true
                    },
                    custom_css: `
                        .goal-wrapper {
                            animation: neonBorderPulse 2s ease-in-out infinite;
                        }
                        @keyframes neonBorderPulse {
                            0%, 100% { box-shadow: 0 0 20px var(--glow-color, rgba(236,72,153,0.4)); }
                            50% { box-shadow: 0 0 40px var(--glow-color, rgba(236,72,153,0.8)); }
                        }
                        .progress-fill {
                            box-shadow: 0 0 20px var(--color1), inset 0 0 10px var(--color2);
                        }
                    `
                })
            },

            // 4. Retro Pixel
            {
                name: 'Retro Pixel',
                description: '8-bit pixel art style with retro gaming aesthetics',
                category: 'official',
                author: 'Pup Cid',
                tags: 'retro,pixel,8bit,gaming,arcade',
                version: '1.0.0',
                config_json: JSON.stringify({
                    meta: {
                        name: 'Retro Pixel',
                        preview: 'retro-pixel.png'
                    },
                    global: {
                        font_family: '"Press Start 2P", "Courier New", monospace',
                        font_size: '12px',
                        spacing: '16px',
                        border_radius: '0px',
                        shadow: '8px 8px 0px rgba(0,0,0,0.3)',
                        background: '#1a1a1a',
                        text_color: '#ffffff',
                        pixel_perfect: true
                    },
                    goal_bar: {
                        height: 70,
                        padding: '12px 16px',
                        background: '#2a2a2a',
                        border: '4px solid #ffffff',
                        border_radius: '0px',
                        shadow: '8px 8px 0px rgba(0,0,0,0.5)',
                        progress_height: 24,
                        progress_border_radius: '0px',
                        progress_background: '#1a1a1a',
                        progress_border: '2px solid #666666',
                        label_template: '{current}/{target}',
                        text_shadow: '2px 2px 0px rgba(0,0,0,0.8)'
                    },
                    per_goal: {
                        coin: {
                            fill_color1: '#ffcc00',
                            fill_color2: '#ff9900',
                            border_color: '#ffcc00'
                        },
                        likes: {
                            fill_color1: '#00ff66',
                            fill_color2: '#00cc44',
                            border_color: '#00ff66'
                        },
                        follower: {
                            fill_color1: '#00ccff',
                            fill_color2: '#0099cc',
                            border_color: '#00ccff'
                        },
                        custom: {
                            fill_color1: '#cc66ff',
                            fill_color2: '#9933cc',
                            border_color: '#cc66ff'
                        }
                    },
                    animations: {
                        entrance: 'pixelSlide',
                        progress: 'step',
                        completion: 'pixelBurst',
                        confetti: true,
                        pixel_mode: true
                    },
                    custom_css: `
                        * {
                            image-rendering: pixelated;
                            image-rendering: -moz-crisp-edges;
                            image-rendering: crisp-edges;
                        }
                        .progress-fill {
                            background-image: repeating-linear-gradient(
                                0deg,
                                var(--color1),
                                var(--color1) 4px,
                                var(--color2) 4px,
                                var(--color2) 8px
                            );
                        }
                    `
                })
            },

            // 5. Modern Glassmorphism
            {
                name: 'Modern Glass',
                description: 'Modern glassmorphism design with frosted glass effect and subtle gradients',
                category: 'official',
                author: 'Pup Cid',
                tags: 'modern,glass,frosted,elegant,minimal',
                version: '1.0.0',
                config_json: JSON.stringify({
                    meta: {
                        name: 'Modern Glass',
                        preview: 'modern-glass.png'
                    },
                    global: {
                        font_family: 'SF Pro Display, -apple-system, sans-serif',
                        font_size: '16px',
                        font_weight: '600',
                        spacing: '16px',
                        border_radius: '20px',
                        shadow: '0 8px 32px rgba(0,0,0,0.1)',
                        background: 'rgba(255, 255, 255, 0.1)',
                        text_color: '#ffffff',
                        backdrop_filter: 'blur(20px) saturate(180%)'
                    },
                    goal_bar: {
                        height: 72,
                        padding: '16px 24px',
                        background: 'rgba(255, 255, 255, 0.15)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        border_radius: '20px',
                        shadow: '0 8px 32px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.3)',
                        backdrop_filter: 'blur(20px) saturate(180%)',
                        progress_height: 28,
                        progress_border_radius: '14px',
                        progress_background: 'rgba(255, 255, 255, 0.1)',
                        label_template: '{current} / {target}'
                    },
                    per_goal: {
                        coin: {
                            fill_color1: 'rgba(251,191,36,0.9)',
                            fill_color2: 'rgba(245,158,11,0.9)',
                            glass_tint: 'rgba(251,191,36,0.1)'
                        },
                        likes: {
                            fill_color1: 'rgba(74,222,128,0.9)',
                            fill_color2: 'rgba(34,197,94,0.9)',
                            glass_tint: 'rgba(34,197,94,0.1)'
                        },
                        follower: {
                            fill_color1: 'rgba(96,165,250,0.9)',
                            fill_color2: 'rgba(59,130,246,0.9)',
                            glass_tint: 'rgba(59,130,246,0.1)'
                        },
                        custom: {
                            fill_color1: 'rgba(167,139,250,0.9)',
                            fill_color2: 'rgba(139,92,246,0.9)',
                            glass_tint: 'rgba(139,92,246,0.1)'
                        }
                    },
                    animations: {
                        entrance: 'fadeInScale',
                        progress: 'smooth',
                        completion: 'glassShimmer',
                        confetti: true,
                        backdrop_blur: true
                    },
                    custom_css: `
                        .goal-wrapper {
                            backdrop-filter: blur(20px) saturate(180%);
                            -webkit-backdrop-filter: blur(20px) saturate(180%);
                        }
                        .goal-wrapper::before {
                            background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 100%);
                        }
                        .progress-fill {
                            backdrop-filter: blur(10px);
                            -webkit-backdrop-filter: blur(10px);
                        }
                    `
                })
            },

            // 6. Cyberpunk 2077
            {
                name: 'Cyberpunk 2077',
                description: 'Cyberpunk 2077-inspired design with yellow accents, glitch effects, and futuristic UI',
                category: 'official',
                author: 'Pup Cid',
                tags: 'cyberpunk,futuristic,glitch,yellow,tech',
                version: '1.0.0',
                config_json: JSON.stringify({
                    meta: {
                        name: 'Cyberpunk 2077',
                        preview: 'cyberpunk-2077.png'
                    },
                    global: {
                        font_family: 'Rajdhani, "Roboto Mono", monospace',
                        font_size: '17px',
                        font_weight: '700',
                        spacing: '18px',
                        border_radius: '2px',
                        shadow: '0 0 20px rgba(252,211,77,0.3), 0 4px 16px rgba(0,0,0,0.8)',
                        background: 'linear-gradient(135deg, rgba(10,10,20,0.95) 0%, rgba(20,20,35,0.95) 100%)',
                        text_color: '#fcd34d',
                        accent_color: '#fcd34d'
                    },
                    goal_bar: {
                        height: 78,
                        padding: '14px 22px',
                        background: 'linear-gradient(135deg, rgba(10,10,20,0.98) 0%, rgba(20,20,35,0.98) 100%)',
                        border: '2px solid #fcd34d',
                        border_left_width: '6px',
                        border_radius: '2px',
                        shadow: '0 0 20px rgba(252,211,77,0.4), inset 0 0 30px rgba(252,211,77,0.05)',
                        progress_height: 30,
                        progress_border_radius: '1px',
                        progress_background: 'rgba(15,15,25,0.9)',
                        label_template: '// {current} / {target} //',
                        text_shadow: '0 0 8px rgba(252,211,77,0.8)'
                    },
                    per_goal: {
                        coin: {
                            fill_color1: '#fcd34d',
                            fill_color2: '#f59e0b',
                            border_color: '#fcd34d',
                            accent_line: '#fcd34d'
                        },
                        likes: {
                            fill_color1: '#06b6d4',
                            fill_color2: '#0891b2',
                            border_color: '#06b6d4',
                            accent_line: '#06b6d4'
                        },
                        follower: {
                            fill_color1: '#ec4899',
                            fill_color2: '#db2777',
                            border_color: '#ec4899',
                            accent_line: '#ec4899'
                        },
                        custom: {
                            fill_color1: '#a78bfa',
                            fill_color2: '#8b5cf6',
                            border_color: '#a78bfa',
                            accent_line: '#a78bfa'
                        }
                    },
                    animations: {
                        entrance: 'glitchSlide',
                        progress: 'digitalFlicker',
                        completion: 'systemOverload',
                        confetti: true,
                        glitch_effect: true,
                        scanlines: true
                    },
                    custom_css: `
                        .goal-wrapper::after {
                            content: '';
                            position: absolute;
                            top: 0;
                            left: 0;
                            right: 0;
                            bottom: 0;
                            background: repeating-linear-gradient(
                                0deg,
                                rgba(0,0,0,0.1) 0px,
                                transparent 1px,
                                transparent 2px,
                                rgba(0,0,0,0.1) 3px
                            );
                            pointer-events: none;
                        }
                        .goal-name::before {
                            content: '>';
                            margin-right: 8px;
                            color: #fcd34d;
                            animation: blink 1s step-end infinite;
                        }
                        @keyframes blink {
                            0%, 100% { opacity: 1; }
                            50% { opacity: 0; }
                        }
                    `
                })
            }
        ];

        const stmt = db.prepare(`
            INSERT OR IGNORE INTO goals_templates
            (name, description, category, author, tags, version, config_json, usage_count, is_favorite)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const template of defaultTemplates) {
            stmt.run(
                template.name,
                template.description,
                template.category,
                template.author,
                template.tags,
                template.version,
                template.config_json,
                0, // usage_count
                0  // is_favorite
            );
        }

        this.api.log(`✅ Initialized ${defaultTemplates.length} default templates`, 'info');
    }

    /**
     * Initialize default goal configurations
     */
    initializeDefaultGoals(db) {
        const defaultGoals = [
            {
                goal_type: 'coin',
                name: 'Coins Goal',
                start_value: 0,
                current_value: 0,
                target_value: 1000,
                progression_mode: 'add',
                increment_amount: 1000,
                style_json: JSON.stringify({
                    fill_color1: '#fbbf24',
                    fill_color2: '#f59e0b',
                    bg_color: '#78350f',
                    text_color: '#ffffff',
                    label_template: 'Coins: {current} / {target}'
                })
            },
            {
                goal_type: 'likes',
                name: 'Likes Goal',
                start_value: 0,
                current_value: 0,
                target_value: 500,
                progression_mode: 'add',
                increment_amount: 500,
                style_json: JSON.stringify({
                    fill_color1: '#4ade80',
                    fill_color2: '#22c55e',
                    bg_color: '#14532d',
                    text_color: '#ffffff',
                    label_template: 'Likes: {current} / {target}'
                })
            },
            {
                goal_type: 'follower',
                name: 'Followers Goal',
                start_value: 0,
                current_value: 0,
                target_value: 10,
                progression_mode: 'add',
                increment_amount: 10,
                style_json: JSON.stringify({
                    fill_color1: '#60a5fa',
                    fill_color2: '#3b82f6',
                    bg_color: '#1e3a8a',
                    text_color: '#ffffff',
                    label_template: 'Followers: {current} / {target}'
                })
            },
            {
                goal_type: 'custom',
                name: 'Custom Goal',
                start_value: 0,
                current_value: 0,
                target_value: 100,
                progression_mode: 'fixed',
                increment_amount: 0,
                style_json: JSON.stringify({
                    fill_color1: '#a78bfa',
                    fill_color2: '#8b5cf6',
                    bg_color: '#4c1d95',
                    text_color: '#ffffff',
                    label_template: 'Custom: {current} / {target}'
                })
            }
        ];

        const stmt = db.prepare(`
            INSERT OR IGNORE INTO goals_config
            (goal_type, enabled, name, start_value, current_value, target_value, progression_mode, increment_amount, style_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const goal of defaultGoals) {
            stmt.run(
                goal.goal_type,
                1,
                goal.name,
                goal.start_value,
                goal.current_value,
                goal.target_value,
                goal.progression_mode,
                goal.increment_amount,
                goal.style_json
            );
        }
    }

    /**
     * Load all goals from database into memory
     */
    loadGoals() {
        try {
            const db = this.api.getDatabase();
            const stmt = db.prepare('SELECT * FROM goals_config');
            const rows = stmt.all();

            this.goals.clear();

            for (const row of rows) {
                const goal = {
                    id: row.id,
                    goalType: row.goal_type,
                    enabled: Boolean(row.enabled),
                    name: row.name,
                    description: row.description || '',
                    startValue: row.start_value,
                    currentValue: row.current_value,
                    targetValue: row.target_value,
                    progressionMode: row.progression_mode,
                    incrementAmount: row.increment_amount,
                    // Layout fields
                    position_x: row.position_x || 10,
                    position_y: row.position_y || 10,
                    width: row.width || 500,
                    height: row.height || 100,
                    z_index: row.z_index || 100,
                    // Design fields
                    style: row.style_json ? JSON.parse(row.style_json) : {},
                    design: row.design_json ? JSON.parse(row.design_json) : {},
                    animation: row.animation_json ? JSON.parse(row.animation_json) : {},
                    template_id: row.template_id || null,
                    // Timestamps
                    createdAt: row.created_at,
                    updatedAt: row.updated_at
                };

                // Calculate derived values
                goal.percent = this.calculatePercent(goal.currentValue, goal.targetValue);
                goal.remaining = Math.max(0, goal.targetValue - goal.currentValue);
                goal.isCompleted = goal.currentValue >= goal.targetValue;

                this.goals.set(goal.goalType, goal);
            }

            this.api.log(`Loaded ${this.goals.size} goals from database`, 'info');
        } catch (error) {
            this.api.log(`Error loading goals: ${error.message}`, 'error');
        }
    }

    /**
     * Calculate percentage (0-100)
     */
    calculatePercent(current, target) {
        if (target <= 0) return 0;
        return Math.min(100, Math.round((current / target) * 100));
    }

    /**
     * Connect to Event API WebSocket
     */
    connectToEventApi() {
        try {
            const db = this.api.getDatabase();
            const configStmt = db.prepare('SELECT * FROM goals_event_api_config WHERE id = 1');
            const config = configStmt.get();

            if (!config || !config.enabled) {
                this.api.log('Event API integration is disabled', 'info');
                return;
            }

            const wsUrl = config.websocket_url || 'ws://localhost:21213';

            this.api.log(`Connecting to Event API at ${wsUrl}...`, 'info');

            this.eventApiWs = new WebSocket(wsUrl);

            this.eventApiWs.on('open', () => {
                this.eventApiConnected = true;
                this.eventApiReconnectAttempts = 0;
                this.api.log('✅ Connected to Event API', 'info');

                // Broadcast connection status via Socket.IO
                this.api.io.emit('goals:event-api:connected', { connected: true });
            });

            this.eventApiWs.on('message', (data) => {
                try {
                    const event = JSON.parse(data.toString());
                    this.handleEventApiEvent(event);
                } catch (error) {
                    this.api.log(`Error parsing Event API event: ${error.message}`, 'error');
                }
            });

            this.eventApiWs.on('error', (error) => {
                this.api.log(`Event API WebSocket error: ${error.message}`, 'error');
            });

            this.eventApiWs.on('close', () => {
                this.eventApiConnected = false;
                this.api.log('Event API WebSocket connection closed', 'warn');

                // Broadcast connection status via Socket.IO
                this.api.io.emit('goals:event-api:connected', { connected: false });

                // Auto-reconnect if enabled
                if (config.auto_reconnect && this.eventApiReconnectAttempts < this.maxEventApiReconnectAttempts) {
                    this.eventApiReconnectAttempts++;
                    const delay = this.eventApiReconnectDelay * this.eventApiReconnectAttempts;

                    this.api.log(`Attempting to reconnect to Event API in ${delay / 1000}s (attempt ${this.eventApiReconnectAttempts}/${this.maxEventApiReconnectAttempts})`, 'info');

                    setTimeout(() => {
                        this.connectToEventApi();
                    }, delay);
                }
            });

        } catch (error) {
            this.api.log(`Error connecting to Event API: ${error.message}`, 'error');
        }
    }

    /**
     * Handle Event API WebSocket events
     */
    handleEventApiEvent(event) {
        try {
            // Event API event structure:
            // { type: 'gift', data: { coins: 100 } }
            // { type: 'like', data: { count: 1 } }
            // { type: 'follow', data: { username: 'user123' } }

            if (event.type === 'gift' && event.data && event.data.coins) {
                this.incrementGoal('coin', event.data.coins);
            } else if (event.type === 'like') {
                const count = event.data?.count || 1;
                this.incrementGoal('likes', count);
            } else if (event.type === 'follow') {
                this.incrementGoal('follower', 1);
            }

        } catch (error) {
            this.api.log(`Error handling Event API event: ${error.message}`, 'error');
        }
    }

    /**
     * Register TikTok event handlers (fallback if Event API is not available)
     */
    registerTikTokEventHandlers() {
        // Gift event - increment coin goal
        this.api.registerTikTokEvent('gift', (data) => {
            if (data.coins) {
                this.incrementGoal('coin', data.coins);
            }
        });

        // Like event - increment likes goal
        this.api.registerTikTokEvent('like', (data) => {
            const count = data.likeCount || 1;
            this.incrementGoal('likes', count);
        });

        // Follow event - increment follower goal
        this.api.registerTikTokEvent('follow', (data) => {
            this.incrementGoal('follower', 1);
        });

        this.api.log('✅ TikTok event handlers registered', 'info');
    }

    /**
     * Increment a goal's current value
     */
    async incrementGoal(goalType, delta) {
        const goal = this.goals.get(goalType);
        if (!goal || !goal.enabled) {
            return;
        }

        const oldValue = goal.currentValue;
        const newValue = oldValue + delta;

        await this.setGoalValue(goalType, newValue);
    }

    /**
     * Set a goal's current value (absolute)
     */
    async setGoalValue(goalType, newValue) {
        const goal = this.goals.get(goalType);
        if (!goal) {
            this.api.log(`Goal type ${goalType} not found`, 'warn');
            return;
        }

        const oldValue = goal.currentValue;
        const delta = newValue - oldValue;

        // Update in-memory state
        goal.currentValue = Math.max(0, newValue);
        goal.percent = this.calculatePercent(goal.currentValue, goal.targetValue);
        goal.remaining = Math.max(0, goal.targetValue - goal.currentValue);

        const wasCompleted = goal.isCompleted;
        goal.isCompleted = goal.currentValue >= goal.targetValue;

        // Update database
        try {
            const db = this.api.getDatabase();
            const stmt = db.prepare(`
                UPDATE goals_config
                SET current_value = ?, updated_at = CURRENT_TIMESTAMP
                WHERE goal_type = ?
            `);
            stmt.run(goal.currentValue, goalType);

            // Log to history
            const historyStmt = db.prepare(`
                INSERT INTO goals_history (goal_type, event_type, old_value, new_value, delta)
                VALUES (?, ?, ?, ?, ?)
            `);
            historyStmt.run(goalType, 'value_changed', oldValue, goal.currentValue, delta);

        } catch (error) {
            this.api.log(`Error updating goal ${goalType}: ${error.message}`, 'error');
        }

        // Broadcast update to overlays
        this.broadcastGoalUpdate(goal);

        // Check if goal was just completed
        if (!wasCompleted && goal.isCompleted) {
            this.handleGoalCompleted(goal);
        }

        this.api.log(`Goal ${goalType}: ${oldValue} → ${goal.currentValue} (${delta >= 0 ? '+' : ''}${delta})`, 'info');
    }

    /**
     * Handle goal completion
     */
    async handleGoalCompleted(goal) {
        this.api.log(`🎯 Goal completed: ${goal.name} (${goal.currentValue}/${goal.targetValue})`, 'info');

        // Broadcast completion event via Socket.IO
        this.api.io.emit('goals:completed', {
            goalType: goal.goalType,
            name: goal.name,
            currentValue: goal.currentValue,
            targetValue: goal.targetValue
        });

        // Apply progression mode
        if (goal.progressionMode === 'add') {
            // Increase target by increment amount
            await this.updateGoalTarget(goal.goalType, goal.targetValue + goal.incrementAmount);
        } else if (goal.progressionMode === 'double') {
            // Double the target
            await this.updateGoalTarget(goal.goalType, goal.targetValue * 2);
        } else if (goal.progressionMode === 'hide') {
            // Disable the goal
            await this.toggleGoal(goal.goalType, false);
        }
        // 'fixed' mode: do nothing, goal stays completed
    }

    /**
     * Update goal target value
     */
    async updateGoalTarget(goalType, newTarget) {
        const goal = this.goals.get(goalType);
        if (!goal) return;

        const oldTarget = goal.targetValue;
        goal.targetValue = Math.max(1, newTarget);
        goal.percent = this.calculatePercent(goal.currentValue, goal.targetValue);
        goal.remaining = Math.max(0, goal.targetValue - goal.currentValue);
        goal.isCompleted = goal.currentValue >= goal.targetValue;

        // Update database
        try {
            const db = this.api.getDatabase();
            const stmt = db.prepare(`
                UPDATE goals_config
                SET target_value = ?, updated_at = CURRENT_TIMESTAMP
                WHERE goal_type = ?
            `);
            stmt.run(goal.targetValue, goalType);

            // Log to history
            const historyStmt = db.prepare(`
                INSERT INTO goals_history (goal_type, event_type, old_value, new_value, metadata)
                VALUES (?, ?, ?, ?, ?)
            `);
            historyStmt.run(goalType, 'target_changed', oldTarget, goal.targetValue,
                JSON.stringify({ mode: goal.progressionMode }));

        } catch (error) {
            this.api.log(`Error updating goal target ${goalType}: ${error.message}`, 'error');
        }

        // Broadcast update
        this.broadcastGoalUpdate(goal);

        this.api.log(`Goal ${goalType} target: ${oldTarget} → ${goal.targetValue}`, 'info');
    }

    /**
     * Toggle goal enabled/disabled
     */
    async toggleGoal(goalType, enabled) {
        const goal = this.goals.get(goalType);
        if (!goal) return;

        goal.enabled = enabled;

        // Update database
        try {
            const db = this.api.getDatabase();
            const stmt = db.prepare(`
                UPDATE goals_config
                SET enabled = ?, updated_at = CURRENT_TIMESTAMP
                WHERE goal_type = ?
            `);
            stmt.run(enabled ? 1 : 0, goalType);

        } catch (error) {
            this.api.log(`Error toggling goal ${goalType}: ${error.message}`, 'error');
        }

        // Broadcast update
        this.broadcastGoalUpdate(goal);

        this.api.log(`Goal ${goalType} ${enabled ? 'enabled' : 'disabled'}`, 'info');
    }

    /**
     * Reset goal to start value
     */
    async resetGoal(goalType) {
        const goal = this.goals.get(goalType);
        if (!goal) return;

        await this.setGoalValue(goalType, goal.startValue);

        this.api.log(`Goal ${goalType} reset to ${goal.startValue}`, 'info');
    }

    /**
     * Broadcast goal update to overlays via Socket.IO
     */
    broadcastGoalUpdate(goal) {
        this.api.io.emit('goals:update', {
            goalType: goal.goalType,
            enabled: goal.enabled,
            name: goal.name,
            currentValue: goal.currentValue,
            targetValue: goal.targetValue,
            startValue: goal.startValue,
            percent: goal.percent,
            remaining: goal.remaining,
            isCompleted: goal.isCompleted,
            progressionMode: goal.progressionMode,
            incrementAmount: goal.incrementAmount,
            style: goal.style
        });
    }

    /**
     * Register Socket.IO handlers
     */
    registerSocketHandlers() {
        this.api.registerSocket('goals:get-all', (socket) => {
            const goalsArray = Array.from(this.goals.values()).map(goal => ({
                goalType: goal.goalType,
                enabled: goal.enabled,
                name: goal.name,
                currentValue: goal.currentValue,
                targetValue: goal.targetValue,
                startValue: goal.startValue,
                percent: goal.percent,
                remaining: goal.remaining,
                isCompleted: goal.isCompleted,
                progressionMode: goal.progressionMode,
                incrementAmount: goal.incrementAmount,
                style: goal.style
            }));

            socket.emit('goals:all', { goals: goalsArray });
        });

        this.api.registerSocket('goals:subscribe', (socket, data) => {
            const goalType = data.goalType;
            if (goalType && this.goals.has(goalType)) {
                socket.join(`goal:${goalType}`);
                const goal = this.goals.get(goalType);
                // Send current state only to subscribing socket
                socket.emit('goals:update', {
                    goalType: goal.goalType,
                    enabled: goal.enabled,
                    name: goal.name,
                    currentValue: goal.currentValue,
                    targetValue: goal.targetValue,
                    startValue: goal.startValue,
                    percent: goal.percent,
                    remaining: goal.remaining,
                    isCompleted: goal.isCompleted,
                    progressionMode: goal.progressionMode,
                    incrementAmount: goal.incrementAmount,
                    style: goal.style
                });
            }
        });

        this.api.log('✅ Socket.IO handlers registered', 'info');
    }

    /**
     * Register API routes
     */
    registerRoutes() {
        // Serve UI
        const path = require('path');
        const fs = require('fs');

        this.api.registerRoute('get', '/goals/ui', (req, res) => {
            const uiPath = path.join(__dirname, 'ui.html');
            if (fs.existsSync(uiPath)) {
                res.sendFile(uiPath);
            } else {
                res.status(404).json({ success: false, error: 'UI not found' });
            }
        });

        // Serve overlay
        this.api.registerRoute('get', '/goals/overlay', (req, res) => {
            const overlayPath = path.join(__dirname, 'overlay.html');
            if (fs.existsSync(overlayPath)) {
                res.sendFile(overlayPath);
            } else {
                res.status(404).json({ success: false, error: 'Overlay not found' });
            }
        });

        // Get all goals
        this.api.registerRoute('get', '/api/goals', (req, res) => {
            try {
                this.api.log(`[DEBUG] /api/goals called`, 'info');
                this.api.log(`[DEBUG] this.goals type: ${this.goals.constructor.name}`, 'info');
                this.api.log(`[DEBUG] this.goals size: ${this.goals.size}`, 'info');

                // Ensure this.goals is a Map
                if (!(this.goals instanceof Map)) {
                    this.api.log('Warning: this.goals is not a Map, reinitializing', 'warn');
                    this.goals = new Map();
                    this.loadGoals();
                }

                // Convert Map to Array - METHOD 1: Direct array creation
                const goalsArray = [];
                this.goals.forEach((goal, key) => {
                    goalsArray.push({
                        goalType: goal.goalType,
                        enabled: goal.enabled,
                        name: goal.name,
                        description: goal.description,
                        currentValue: goal.currentValue,
                        targetValue: goal.targetValue,
                        startValue: goal.startValue,
                        percent: goal.percent,
                        remaining: goal.remaining,
                        isCompleted: goal.isCompleted,
                        progressionMode: goal.progressionMode,
                        incrementAmount: goal.incrementAmount,
                        // Layout
                        position_x: goal.position_x,
                        position_y: goal.position_y,
                        width: goal.width,
                        height: goal.height,
                        z_index: goal.z_index,
                        // Design
                        style: goal.style,
                        design: goal.design,
                        animation: goal.animation,
                        template_id: goal.template_id
                    });
                });

                this.api.log(`[DEBUG] goalsArray length: ${goalsArray.length}`, 'info');
                this.api.log(`[DEBUG] goalsArray is Array: ${Array.isArray(goalsArray)}`, 'info');
                this.api.log(`[DEBUG] Returning goals to client`, 'info');

                res.json({ success: true, goals: goalsArray });
            } catch (error) {
                this.api.log(`Error in /api/goals route: ${error.message}`, 'error');
                this.api.log(`Error stack: ${error.stack}`, 'error');
                res.status(500).json({ success: false, error: error.message, goals: [] });
            }
        });

        // Get single goal
        this.api.registerRoute('get', '/api/goals/:goalType', (req, res) => {
            const goalType = req.params.goalType;
            const goal = this.goals.get(goalType);

            if (!goal) {
                return res.status(404).json({ success: false, error: 'Goal not found' });
            }

            res.json({
                success: true,
                goal: {
                    goalType: goal.goalType,
                    enabled: goal.enabled,
                    name: goal.name,
                    description: goal.description,
                    currentValue: goal.currentValue,
                    targetValue: goal.targetValue,
                    startValue: goal.startValue,
                    percent: goal.percent,
                    remaining: goal.remaining,
                    isCompleted: goal.isCompleted,
                    progressionMode: goal.progressionMode,
                    incrementAmount: goal.incrementAmount,
                    // Layout
                    position_x: goal.position_x,
                    position_y: goal.position_y,
                    width: goal.width,
                    height: goal.height,
                    z_index: goal.z_index,
                    // Design
                    style: goal.style,
                    design: goal.design,
                    animation: goal.animation,
                    template_id: goal.template_id
                }
            });
        });

        // Update goal configuration
        this.api.registerRoute('post', '/api/goals/:goalType/config', async (req, res) => {
            const goalType = req.params.goalType;
            const goal = this.goals.get(goalType);

            if (!goal) {
                return res.status(404).json({ success: false, error: 'Goal not found' });
            }

            const updates = req.body;

            try {
                const db = this.api.getDatabase();

                // Build update query dynamically
                const allowedFields = ['name', 'start_value', 'target_value', 'progression_mode', 'increment_amount', 'enabled'];
                const updateFields = [];
                const updateValues = [];

                for (const field of allowedFields) {
                    if (updates[field] !== undefined) {
                        updateFields.push(`${field} = ?`);
                        updateValues.push(updates[field]);
                    }
                }

                // Handle style separately (JSON)
                if (updates.style) {
                    updateFields.push('style_json = ?');
                    updateValues.push(JSON.stringify(updates.style));
                    goal.style = updates.style;
                }

                if (updateFields.length > 0) {
                    updateFields.push('updated_at = CURRENT_TIMESTAMP');
                    updateValues.push(goalType);

                    const stmt = db.prepare(`
                        UPDATE goals_config
                        SET ${updateFields.join(', ')}
                        WHERE goal_type = ?
                    `);
                    stmt.run(...updateValues);
                }

                // Update in-memory state
                if (updates.name !== undefined) goal.name = updates.name;
                if (updates.start_value !== undefined) goal.startValue = updates.start_value;
                if (updates.target_value !== undefined) {
                    goal.targetValue = updates.target_value;
                    goal.percent = this.calculatePercent(goal.currentValue, goal.targetValue);
                    goal.remaining = Math.max(0, goal.targetValue - goal.currentValue);
                    goal.isCompleted = goal.currentValue >= goal.targetValue;
                }
                if (updates.progression_mode !== undefined) goal.progressionMode = updates.progression_mode;
                if (updates.increment_amount !== undefined) goal.incrementAmount = updates.increment_amount;
                if (updates.enabled !== undefined) goal.enabled = Boolean(updates.enabled);

                // Broadcast update
                this.broadcastGoalUpdate(goal);

                res.json({ success: true, message: 'Goal updated', goal });

            } catch (error) {
                this.api.log(`Error updating goal config: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Set goal value (absolute)
        this.api.registerRoute('post', '/api/goals/:goalType/set', async (req, res) => {
            const goalType = req.params.goalType;
            const { value } = req.body;

            if (value === undefined) {
                return res.status(400).json({ success: false, error: 'value is required' });
            }

            const goal = this.goals.get(goalType);
            if (!goal) {
                return res.status(404).json({ success: false, error: 'Goal not found' });
            }

            await this.setGoalValue(goalType, parseInt(value));

            res.json({ success: true, message: 'Goal value set', goal });
        });

        // Increment goal value (relative)
        this.api.registerRoute('post', '/api/goals/:goalType/increment', async (req, res) => {
            const goalType = req.params.goalType;
            const { delta } = req.body;

            if (delta === undefined) {
                return res.status(400).json({ success: false, error: 'delta is required' });
            }

            const goal = this.goals.get(goalType);
            if (!goal) {
                return res.status(404).json({ success: false, error: 'Goal not found' });
            }

            await this.incrementGoal(goalType, parseInt(delta));

            res.json({ success: true, message: 'Goal incremented', goal });
        });

        // Reset goal
        this.api.registerRoute('post', '/api/goals/:goalType/reset', async (req, res) => {
            const goalType = req.params.goalType;
            const goal = this.goals.get(goalType);

            if (!goal) {
                return res.status(404).json({ success: false, error: 'Goal not found' });
            }

            await this.resetGoal(goalType);

            res.json({ success: true, message: 'Goal reset', goal });
        });

        // Toggle goal enabled/disabled
        this.api.registerRoute('post', '/api/goals/:goalType/toggle', async (req, res) => {
            const goalType = req.params.goalType;
            const { enabled } = req.body;

            if (enabled === undefined) {
                return res.status(400).json({ success: false, error: 'enabled is required' });
            }

            const goal = this.goals.get(goalType);
            if (!goal) {
                return res.status(404).json({ success: false, error: 'Goal not found' });
            }

            await this.toggleGoal(goalType, Boolean(enabled));

            res.json({ success: true, message: `Goal ${enabled ? 'enabled' : 'disabled'}`, goal });
        });

        // Get Event API connection status
        this.api.registerRoute('get', '/api/goals/event-api/status', (req, res) => {
            res.json({
                success: true,
                connected: this.eventApiConnected,
                reconnectAttempts: this.eventApiReconnectAttempts
            });
        });

        // Update Event API config
        this.api.registerRoute('post', '/api/goals/event-api/config', (req, res) => {
            const { enabled, websocket_url, auto_reconnect } = req.body;

            try {
                const db = this.api.getDatabase();
                const updates = [];
                const values = [];

                if (enabled !== undefined) {
                    updates.push('enabled = ?');
                    values.push(enabled ? 1 : 0);
                }
                if (websocket_url !== undefined) {
                    updates.push('websocket_url = ?');
                    values.push(websocket_url);
                }
                if (auto_reconnect !== undefined) {
                    updates.push('auto_reconnect = ?');
                    values.push(auto_reconnect ? 1 : 0);
                }

                if (updates.length > 0) {
                    updates.push('updated_at = CURRENT_TIMESTAMP');
                    const stmt = db.prepare(`
                        UPDATE goals_event_api_config
                        SET ${updates.join(', ')}
                        WHERE id = 1
                    `);
                    stmt.run(...values);
                }

                // Reconnect if URL changed or enabled state changed
                if (websocket_url !== undefined || enabled !== undefined) {
                    if (this.eventApiWs) {
                        this.eventApiWs.close();
                    }
                    this.eventApiReconnectAttempts = 0;
                    setTimeout(() => this.connectToEventApi(), 1000);
                }

                res.json({ success: true, message: 'Event API config updated' });

            } catch (error) {
                this.api.log(`Error updating Event API config: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get goal history
        this.api.registerRoute('get', '/api/goals/:goalType/history', (req, res) => {
            const goalType = req.params.goalType;
            const limit = parseInt(req.query.limit) || 50;

            try {
                const db = this.api.getDatabase();
                const stmt = db.prepare(`
                    SELECT * FROM goals_history
                    WHERE goal_type = ?
                    ORDER BY timestamp DESC
                    LIMIT ?
                `);
                const history = stmt.all(goalType, limit);

                res.json({ success: true, history });

            } catch (error) {
                this.api.log(`Error fetching goal history: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ========================================
        // TEMPLATE MANAGEMENT ROUTES
        // ========================================

        // Get all templates
        this.api.registerRoute('get', '/api/goals/templates', (req, res) => {
            try {
                const db = this.api.getDatabase();
                const category = req.query.category || null;
                const tags = req.query.tags || null;

                let query = 'SELECT * FROM goals_templates';
                const params = [];

                if (category) {
                    query += ' WHERE category = ?';
                    params.push(category);
                }

                if (tags) {
                    const tagArray = tags.split(',');
                    const tagConditions = tagArray.map(() => 'tags LIKE ?').join(' OR ');
                    query += category ? ' AND (' + tagConditions + ')' : ' WHERE (' + tagConditions + ')';
                    tagArray.forEach(tag => params.push(`%${tag}%`));
                }

                query += ' ORDER BY is_favorite DESC, usage_count DESC, name ASC';

                const stmt = db.prepare(query);
                const templates = stmt.all(...params);

                // Parse config_json for each template
                const templatesWithConfig = templates.map(t => ({
                    ...t,
                    config: JSON.parse(t.config_json)
                }));

                res.json({ success: true, templates: templatesWithConfig });
            } catch (error) {
                this.api.log(`Error fetching templates: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get single template
        this.api.registerRoute('get', '/api/goals/templates/:id', (req, res) => {
            try {
                const db = this.api.getDatabase();
                const stmt = db.prepare('SELECT * FROM goals_templates WHERE id = ?');
                const template = stmt.get(req.params.id);

                if (!template) {
                    return res.status(404).json({ success: false, error: 'Template not found' });
                }

                template.config = JSON.parse(template.config_json);
                res.json({ success: true, template });
            } catch (error) {
                this.api.log(`Error fetching template: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Create custom template
        this.api.registerRoute('post', '/api/goals/templates', (req, res) => {
            try {
                const { name, description, category, tags, config } = req.body;

                if (!name || !config) {
                    return res.status(400).json({ success: false, error: 'Name and config are required' });
                }

                const db = this.api.getDatabase();
                const stmt = db.prepare(`
                    INSERT INTO goals_templates (name, description, category, author, tags, version, config_json)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `);

                const result = stmt.run(
                    name,
                    description || '',
                    category || 'custom',
                    'user',
                    tags || '',
                    '1.0.0',
                    JSON.stringify(config)
                );

                res.json({ success: true, templateId: result.lastInsertRowid });
            } catch (error) {
                this.api.log(`Error creating template: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Update template
        this.api.registerRoute('put', '/api/goals/templates/:id', (req, res) => {
            try {
                const { name, description, tags, config, is_favorite } = req.body;
                const db = this.api.getDatabase();

                const updates = [];
                const params = [];

                if (name !== undefined) {
                    updates.push('name = ?');
                    params.push(name);
                }
                if (description !== undefined) {
                    updates.push('description = ?');
                    params.push(description);
                }
                if (tags !== undefined) {
                    updates.push('tags = ?');
                    params.push(tags);
                }
                if (config !== undefined) {
                    updates.push('config_json = ?');
                    params.push(JSON.stringify(config));
                }
                if (is_favorite !== undefined) {
                    updates.push('is_favorite = ?');
                    params.push(is_favorite ? 1 : 0);
                }

                updates.push('updated_at = CURRENT_TIMESTAMP');
                params.push(req.params.id);

                const stmt = db.prepare(`
                    UPDATE goals_templates
                    SET ${updates.join(', ')}
                    WHERE id = ?
                `);

                stmt.run(...params);
                res.json({ success: true });
            } catch (error) {
                this.api.log(`Error updating template: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Delete template
        this.api.registerRoute('delete', '/api/goals/templates/:id', (req, res) => {
            try {
                const db = this.api.getDatabase();

                // Check if template is official (prevent deletion)
                const checkStmt = db.prepare('SELECT category FROM goals_templates WHERE id = ?');
                const template = checkStmt.get(req.params.id);

                if (!template) {
                    return res.status(404).json({ success: false, error: 'Template not found' });
                }

                if (template.category === 'official') {
                    return res.status(403).json({ success: false, error: 'Cannot delete official templates' });
                }

                const stmt = db.prepare('DELETE FROM goals_templates WHERE id = ?');
                stmt.run(req.params.id);

                res.json({ success: true });
            } catch (error) {
                this.api.log(`Error deleting template: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Apply template to goal(s)
        this.api.registerRoute('post', '/api/goals/templates/:id/apply', (req, res) => {
            try {
                const { goalTypes } = req.body; // Array of goal types or 'all'
                const templateId = req.params.id;

                const db = this.api.getDatabase();

                // Get template
                const templateStmt = db.prepare('SELECT * FROM goals_templates WHERE id = ?');
                const template = templateStmt.get(templateId);

                if (!template) {
                    return res.status(404).json({ success: false, error: 'Template not found' });
                }

                const config = JSON.parse(template.config_json);

                // Increment usage count
                const usageStmt = db.prepare('UPDATE goals_templates SET usage_count = usage_count + 1 WHERE id = ?');
                usageStmt.run(templateId);

                // Apply template to goals
                const applyToGoals = goalTypes === 'all' ?
                    Array.from(this.goals.keys()) :
                    (Array.isArray(goalTypes) ? goalTypes : [goalTypes]);

                for (const goalType of applyToGoals) {
                    const goalConfig = config.per_goal[goalType] || {};

                    // Merge global template settings with per-goal overrides
                    const mergedStyle = {
                        ...config.goal_bar,
                        ...goalConfig
                    };

                    // Update goal in database
                    const updateStmt = db.prepare(`
                        UPDATE goals_config
                        SET style_json = ?,
                            design_json = ?,
                            animation_json = ?,
                            template_id = ?,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE goal_type = ?
                    `);

                    updateStmt.run(
                        JSON.stringify(mergedStyle),
                        JSON.stringify(config.global || {}),
                        JSON.stringify(config.animations || {}),
                        templateId,
                        goalType
                    );
                }

                // Reload goals
                this.loadGoals();

                // Broadcast update to all clients
                this.io.emit('goals:template-applied', { templateId, goalTypes: applyToGoals });

                res.json({ success: true, appliedTo: applyToGoals.length });
            } catch (error) {
                this.api.log(`Error applying template: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ========================================
        // HUD CONFIGURATION ROUTES
        // ========================================

        // Get HUD config
        this.api.registerRoute('get', '/api/goals/hud/config', (req, res) => {
            try {
                const db = this.api.getDatabase();
                const stmt = db.prepare('SELECT * FROM goals_hud_config WHERE id = 1');
                const config = stmt.get();

                if (!config) {
                    return res.json({
                        success: true,
                        config: {
                            enabled: true,
                            resolution_width: 1920,
                            resolution_height: 1080,
                            layout: {},
                            global_style: {},
                            animations: {},
                            performance: {}
                        }
                    });
                }

                res.json({
                    success: true,
                    config: {
                        id: config.id,
                        enabled: Boolean(config.enabled),
                        resolution_width: config.resolution_width,
                        resolution_height: config.resolution_height,
                        layout: config.layout_json ? JSON.parse(config.layout_json) : {},
                        global_style: config.global_style_json ? JSON.parse(config.global_style_json) : {},
                        animations: config.animations_json ? JSON.parse(config.animations_json) : {},
                        performance: config.performance_json ? JSON.parse(config.performance_json) : {}
                    }
                });
            } catch (error) {
                this.api.log(`Error fetching HUD config: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Update HUD config
        this.api.registerRoute('put', '/api/goals/hud/config', (req, res) => {
            try {
                const { enabled, resolution_width, resolution_height, layout, global_style, animations, performance } = req.body;
                const db = this.api.getDatabase();

                const updates = [];
                const params = [];

                if (enabled !== undefined) {
                    updates.push('enabled = ?');
                    params.push(enabled ? 1 : 0);
                }
                if (resolution_width !== undefined) {
                    updates.push('resolution_width = ?');
                    params.push(resolution_width);
                }
                if (resolution_height !== undefined) {
                    updates.push('resolution_height = ?');
                    params.push(resolution_height);
                }
                if (layout !== undefined) {
                    updates.push('layout_json = ?');
                    params.push(JSON.stringify(layout));
                }
                if (global_style !== undefined) {
                    updates.push('global_style_json = ?');
                    params.push(JSON.stringify(global_style));
                }
                if (animations !== undefined) {
                    updates.push('animations_json = ?');
                    params.push(JSON.stringify(animations));
                }
                if (performance !== undefined) {
                    updates.push('performance_json = ?');
                    params.push(JSON.stringify(performance));
                }

                updates.push('updated_at = CURRENT_TIMESTAMP');

                const stmt = db.prepare(`
                    UPDATE goals_hud_config
                    SET ${updates.join(', ')}
                    WHERE id = 1
                `);

                stmt.run(...params);

                // Broadcast HUD config update
                this.io.emit('goals:hud-config-updated', req.body);

                res.json({ success: true });
            } catch (error) {
                this.api.log(`Error updating HUD config: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ========================================
        // GOAL POSITION & SIZE ROUTES
        // ========================================

        // Update goal position and size
        this.api.registerRoute('patch', '/api/goals/:goalType/layout', (req, res) => {
            try {
                const goalType = req.params.goalType;
                const { position_x, position_y, width, height, z_index } = req.body;

                const db = this.api.getDatabase();
                const updates = [];
                const params = [];

                if (position_x !== undefined) {
                    updates.push('position_x = ?');
                    params.push(position_x);
                }
                if (position_y !== undefined) {
                    updates.push('position_y = ?');
                    params.push(position_y);
                }
                if (width !== undefined) {
                    updates.push('width = ?');
                    params.push(width);
                }
                if (height !== undefined) {
                    updates.push('height = ?');
                    params.push(height);
                }
                if (z_index !== undefined) {
                    updates.push('z_index = ?');
                    params.push(z_index);
                }

                updates.push('updated_at = CURRENT_TIMESTAMP');
                params.push(goalType);

                const stmt = db.prepare(`
                    UPDATE goals_config
                    SET ${updates.join(', ')}
                    WHERE goal_type = ?
                `);

                stmt.run(...params);

                // Reload goal
                this.loadGoals();
                const goal = this.goals.get(goalType);

                // Broadcast update
                this.io.emit('goals:layout-updated', {
                    goalType,
                    position_x,
                    position_y,
                    width,
                    height,
                    z_index
                });

                res.json({ success: true, goal });
            } catch (error) {
                this.api.log(`Error updating goal layout: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Batch update multiple goal layouts
        this.api.registerRoute('post', '/api/goals/layouts/batch', (req, res) => {
            try {
                const { updates } = req.body; // Array of {goalType, position_x, position_y, width, height, z_index}

                if (!Array.isArray(updates)) {
                    return res.status(400).json({ success: false, error: 'Updates must be an array' });
                }

                const db = this.api.getDatabase();

                for (const update of updates) {
                    const { goalType, position_x, position_y, width, height, z_index } = update;

                    const fields = [];
                    const params = [];

                    if (position_x !== undefined) {
                        fields.push('position_x = ?');
                        params.push(position_x);
                    }
                    if (position_y !== undefined) {
                        fields.push('position_y = ?');
                        params.push(position_y);
                    }
                    if (width !== undefined) {
                        fields.push('width = ?');
                        params.push(width);
                    }
                    if (height !== undefined) {
                        fields.push('height = ?');
                        params.push(height);
                    }
                    if (z_index !== undefined) {
                        fields.push('z_index = ?');
                        params.push(z_index);
                    }

                    if (fields.length > 0) {
                        fields.push('updated_at = CURRENT_TIMESTAMP');
                        params.push(goalType);

                        const stmt = db.prepare(`
                            UPDATE goals_config
                            SET ${fields.join(', ')}
                            WHERE goal_type = ?
                        `);

                        stmt.run(...params);
                    }
                }

                // Reload goals
                this.loadGoals();

                // Broadcast batch update
                this.io.emit('goals:layouts-batch-updated', { updates });

                res.json({ success: true, updated: updates.length });
            } catch (error) {
                this.api.log(`Error batch updating layouts: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.log('✅ API routes registered', 'info');
    }

    /**
     * Register Flow Actions for automation
     */
    registerFlowActions() {
        // This plugin exports actions that can be used in the Flow Engine
        // The Flow Engine will need to be extended to support plugin actions

        // Export available actions
        this.flowActions = {
            'goals.set_value': {
                name: 'Set Goal Value',
                description: 'Set a goal to a specific value',
                params: [
                    { name: 'goalType', type: 'select', options: this.goalTypes, required: true },
                    { name: 'value', type: 'number', required: true }
                ],
                execute: async (params) => {
                    await this.setGoalValue(params.goalType, params.value);
                }
            },
            'goals.increment': {
                name: 'Increment Goal',
                description: 'Increment a goal by a specific amount',
                params: [
                    { name: 'goalType', type: 'select', options: this.goalTypes, required: true },
                    { name: 'delta', type: 'number', required: true }
                ],
                execute: async (params) => {
                    await this.incrementGoal(params.goalType, params.delta);
                }
            },
            'goals.reset': {
                name: 'Reset Goal',
                description: 'Reset a goal to its start value',
                params: [
                    { name: 'goalType', type: 'select', options: this.goalTypes, required: true }
                ],
                execute: async (params) => {
                    await this.resetGoal(params.goalType);
                }
            },
            'goals.toggle': {
                name: 'Toggle Goal',
                description: 'Enable or disable a goal',
                params: [
                    { name: 'goalType', type: 'select', options: this.goalTypes, required: true },
                    { name: 'enabled', type: 'boolean', required: true }
                ],
                execute: async (params) => {
                    await this.toggleGoal(params.goalType, params.enabled);
                }
            }
        };

        // Store actions in plugin API for Flow Engine discovery
        this.api.flowActions = this.flowActions;

        this.api.log('✅ Flow actions registered', 'info');
    }

    /**
     * Cleanup on plugin destruction
     */
    async destroy() {
        // Close Event API WebSocket
        if (this.eventApiWs) {
            this.eventApiWs.close();
            this.eventApiWs = null;
        }

        this.api.log('🎯 Goals Plugin destroyed', 'info');
    }
}

module.exports = GoalsPlugin;
