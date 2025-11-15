/**
 * EmojiRain Engine - Enhanced physics-based emoji rain with advanced features
 * CSP-Compliant - No inline scripts or event handlers
 * 
 * Features:
 * - Gift-triggered rain with flow integration
 * - SuperFan burst mode
 * - Per-user emoji selection
 * - Wind simulation
 * - Bounce physics with configurable floor
 * - Color themes (Warm, Cool, Neon, Pastel)
 * - Rainbow mode
 * - Retro pixel mode
 * - Dynamic FPS optimization
 */

// Matter.js aliases
const Engine = Matter.Engine;
const Render = Matter.Render;
const World = Matter.World;
const Bodies = Matter.Bodies;
const Body = Matter.Body;
const Events = Matter.Events;

// Enhanced Configuration with new features
let config = {
    enabled: true,
    width_px: 1280,
    height_px: 720,
    emoji_set: ["💧","💙","💚","💜","❤️","🩵","✨","🌟","🔥","🎉"],
    use_custom_images: false,
    image_urls: [],
    effect: 'bounce',
    
    // Physics
    physics_gravity_y: 1.0,
    physics_air: 0.02,
    physics_friction: 0.1,
    physics_restitution: 0.6,
    
    // Wind Simulation
    wind_enabled: false,
    wind_strength: 50, // 0-100
    wind_direction: 'auto', // 'auto', 'left', 'right'
    
    // Bounce Physics
    bounce_enabled: true,
    bounce_height: 0.6, // Same as restitution
    bounce_damping: 0.1,
    floor_enabled: true,
    
    // Emoji Appearance
    emoji_min_size_px: 40,
    emoji_max_size_px: 80,
    emoji_rotation_speed: 0.05,
    emoji_lifetime_ms: 8000,
    emoji_fade_duration_ms: 1000,
    max_emojis_on_screen: 200,
    
    // Color Theme
    color_mode: 'off', // 'off', 'warm', 'cool', 'neon', 'pastel'
    color_intensity: 0.5, // 0-1
    
    // Rainbow Mode
    rainbow_enabled: false,
    rainbow_speed: 1.0, // Speed of hue rotation
    
    // Pixel Mode
    pixel_enabled: false,
    pixel_size: 4, // 1-10
    
    // FPS Optimization
    fps_optimization_enabled: true,
    fps_sensitivity: 0.8, // 0-1, higher = more aggressive
    target_fps: 60,
    
    // SuperFan Burst
    superfan_burst_enabled: true,
    superfan_burst_intensity: 3.0,
    superfan_burst_duration: 2000,
    
    // Scaling rules
    like_count_divisor: 10,
    like_min_emojis: 1,
    like_max_emojis: 20,
    gift_base_emojis: 3,
    gift_coin_multiplier: 0.1,
    gift_max_emojis: 50
};

// User emoji mappings
let userEmojiMap = {};

// State
let engine, render;
let socket;
let emojis = [];
let windForce = 0;
let debugMode = false;
let ground, leftWall, rightWall;
let canvasWidth, canvasHeight;

// FPS tracking
let lastUpdateTime = performance.now();
let frameCount = 0;
let currentFPS = 60;
let fpsUpdateTime = performance.now();
let fpsHistory = [];
const FPS_HISTORY_SIZE = 60;

// Rainbow animation state
let rainbowHueOffset = 0;

// Performance state
let performanceMode = 'normal'; // 'normal', 'reduced', 'minimal'

/**
 * Initialize physics engine
 */
function initPhysics() {
    canvasWidth = window.innerWidth;
    canvasHeight = window.innerHeight;

    engine = Engine.create({
        enableSleeping: false
    });

    engine.gravity.y = config.physics_gravity_y;

    // Create boundaries
    createBoundaries();

    // Listen for collisions
    Events.on(engine, 'collisionStart', handleCollision);

    console.log(`✅ Physics initialized at ${canvasWidth}x${canvasHeight}`);
}

/**
 * Create world boundaries (floor and walls)
 */
function createBoundaries() {
    const thickness = 100;
    
    // Ground (floor)
    ground = Bodies.rectangle(
        canvasWidth / 2,
        canvasHeight + thickness / 2,
        canvasWidth + thickness * 2,
        thickness,
        {
            isStatic: true,
            friction: config.physics_friction,
            restitution: config.bounce_height,
            label: 'ground'
        }
    );

    // Walls
    leftWall = Bodies.rectangle(
        -thickness / 2,
        canvasHeight / 2,
        thickness,
        canvasHeight + thickness * 2,
        {
            isStatic: true,
            friction: config.physics_friction,
            restitution: config.bounce_height
        }
    );

    rightWall = Bodies.rectangle(
        canvasWidth + thickness / 2,
        canvasHeight / 2,
        thickness,
        canvasHeight + thickness * 2,
        {
            isStatic: true,
            friction: config.physics_friction,
            restitution: config.bounce_height
        }
    );

    // Only add ground if floor is enabled
    if (config.floor_enabled) {
        World.add(engine.world, [ground, leftWall, rightWall]);
    } else {
        World.add(engine.world, [leftWall, rightWall]);
    }
}

/**
 * Handle collision events
 */
function handleCollision(event) {
    if (config.effect === 'none' || !config.bounce_enabled) return;

    event.pairs.forEach(pair => {
        if (pair.bodyA.label === 'ground' || pair.bodyB.label === 'ground') {
            const emojiBody = pair.bodyA.label === 'ground' ? pair.bodyB : pair.bodyA;
            const emoji = emojis.find(e => e.body === emojiBody);
            
            if (emoji && !emoji.hasBouncedEffect) {
                emoji.hasBouncedEffect = true;
                triggerBounceEffect(emoji);
            }
        }
    });
}

/**
 * Trigger bounce/bubble animation
 */
function triggerBounceEffect(emoji) {
    if (!emoji.element || config.effect === 'none') return;
    
    emoji.element.style.animation = 'bubbleBlop 0.4s ease-out';
}

/**
 * Resize canvas and physics world
 */
function resizeCanvas() {
    const newWidth = window.innerWidth;
    const newHeight = window.innerHeight;

    if (newWidth === canvasWidth && newHeight === canvasHeight) return;

    canvasWidth = newWidth;
    canvasHeight = newHeight;

    updateBoundaries();

    console.log(`📐 Canvas resized to ${canvasWidth}x${canvasHeight}`);
}

/**
 * Update world boundaries
 */
function updateBoundaries() {
    const thickness = 100;

    Body.setPosition(ground, {
        x: canvasWidth / 2,
        y: canvasHeight + thickness / 2
    });
    Body.setVertices(ground, Bodies.rectangle(0, 0, canvasWidth + thickness * 2, thickness).vertices);

    Body.setPosition(leftWall, {
        x: -thickness / 2,
        y: canvasHeight / 2
    });
    Body.setVertices(leftWall, Bodies.rectangle(0, 0, thickness, canvasHeight + thickness * 2).vertices);

    Body.setPosition(rightWall, {
        x: canvasWidth + thickness / 2,
        y: canvasHeight / 2
    });
    Body.setVertices(rightWall, Bodies.rectangle(0, 0, thickness, canvasHeight + thickness * 2).vertices);
}

/**
 * Calculate wind force based on configuration
 */
function calculateWindForce() {
    if (!config.wind_enabled) {
        return 0;
    }

    const maxWindForce = (config.wind_strength / 100) * 0.01;
    
    if (config.wind_direction === 'left') {
        return -maxWindForce;
    } else if (config.wind_direction === 'right') {
        return maxWindForce;
    } else {
        // Auto mode - add variation
        windForce += (Math.random() - 0.5) * maxWindForce * 0.1;
        windForce = Math.max(-maxWindForce, Math.min(maxWindForce, windForce));
        return windForce;
    }
}

/**
 * Apply color filter based on theme
 */
function applyColorTheme(element) {
    if (config.rainbow_enabled) {
        // Rainbow takes precedence
        const hue = rainbowHueOffset % 360;
        element.style.filter = `hue-rotate(${hue}deg)`;
        return;
    }

    if (config.color_mode === 'off') {
        element.style.filter = '';
        return;
    }

    const intensity = config.color_intensity;
    let filter = '';

    switch (config.color_mode) {
        case 'warm':
            filter = `sepia(${intensity * 0.8}) saturate(${1 + intensity * 0.5}) brightness(${1 + intensity * 0.2})`;
            break;
        case 'cool':
            filter = `hue-rotate(180deg) saturate(${1 + intensity}) brightness(${0.9 + intensity * 0.1})`;
            break;
        case 'neon':
            filter = `saturate(${2 + intensity * 2}) brightness(${1.2 + intensity * 0.3}) contrast(${1.2})`;
            break;
        case 'pastel':
            filter = `saturate(${0.5 + intensity * 0.3}) brightness(${1.1 + intensity * 0.2})`;
            break;
    }

    element.style.filter = filter;
}

/**
 * Apply pixel effect
 */
function applyPixelEffect(element) {
    if (!config.pixel_enabled) {
        element.style.imageRendering = '';
        return;
    }

    element.style.imageRendering = 'pixelated';
    // Additional pixelation can be done with canvas if needed
}

/**
 * Main update loop
 */
function updateLoop(currentTime) {
    // Calculate delta time
    const deltaTime = currentTime - lastUpdateTime;
    const targetFrameTime = 1000 / config.target_fps;

    // Throttle to target FPS
    if (deltaTime < targetFrameTime) {
        requestAnimationFrame(updateLoop);
        return;
    }

    lastUpdateTime = currentTime - (deltaTime % targetFrameTime);

    // Update FPS counter
    frameCount++;
    if (currentTime - fpsUpdateTime >= 1000) {
        currentFPS = Math.round(frameCount * 1000 / (currentTime - fpsUpdateTime));
        frameCount = 0;
        fpsUpdateTime = currentTime;
        
        // Track FPS history
        fpsHistory.push(currentFPS);
        if (fpsHistory.length > FPS_HISTORY_SIZE) {
            fpsHistory.shift();
        }
        
        // Check if FPS optimization is needed
        if (config.fps_optimization_enabled) {
            checkAndOptimizeFPS();
        }
    }

    // Run physics engine step
    const clampedDelta = Math.min(deltaTime, targetFrameTime);
    Engine.update(engine, clampedDelta);

    // Update rainbow hue
    if (config.rainbow_enabled) {
        rainbowHueOffset += config.rainbow_speed;
        if (rainbowHueOffset >= 360) {
            rainbowHueOffset -= 360;
        }
    }

    // Calculate wind force
    const currentWindForce = calculateWindForce();

    // Update emojis
    emojis.forEach(emoji => {
        if (emoji.body) {
            // Apply wind
            if (config.wind_enabled) {
                Body.applyForce(emoji.body, emoji.body.position, {
                    x: currentWindForce,
                    y: 0
                });
            }

            // Apply air resistance with damping
            const velocity = emoji.body.velocity;
            const dampingFactor = config.bounce_damping;
            Body.setVelocity(emoji.body, {
                x: velocity.x * (1 - config.physics_air - dampingFactor * 0.01),
                y: velocity.y * (1 - config.physics_air)
            });

            // Update DOM element
            if (emoji.element) {
                const px = emoji.body.position.x;
                const py = emoji.body.position.y;
                const rotation = emoji.body.angle + emoji.rotation;
                emoji.rotation += config.emoji_rotation_speed;

                emoji.element.style.transform = `translate3d(${px}px, ${py}px, 0) translate(-50%, -50%) rotate(${rotation}rad)`;
                
                // Apply color theme
                applyColorTheme(emoji.element);
            }
        }

        // Check lifetime
        if (emoji.spawnTime && config.emoji_lifetime_ms > 0) {
            const age = currentTime - emoji.spawnTime;
            if (age > config.emoji_lifetime_ms && !emoji.fading) {
                fadeOutEmoji(emoji);
            }
        }
    });

    // Remove faded emojis
    emojis = emojis.filter(emoji => !emoji.removed);

    // Limit max emojis
    while (emojis.length > config.max_emojis_on_screen) {
        const oldest = emojis[0];
        removeEmoji(oldest);
    }

    // Update debug info
    if (debugMode) {
        updateDebugInfo();
    }

    requestAnimationFrame(updateLoop);
}

/**
 * Check FPS and optimize if needed
 */
function checkAndOptimizeFPS() {
    if (fpsHistory.length < 10) return;

    const avgFPS = fpsHistory.reduce((a, b) => a + b, 0) / fpsHistory.length;
    const fpsThreshold = config.target_fps * (1 - config.fps_sensitivity);

    if (avgFPS < fpsThreshold && performanceMode === 'normal') {
        // Switch to reduced performance mode
        performanceMode = 'reduced';
        console.log(`⚡ FPS optimization: Switching to reduced mode (FPS: ${avgFPS.toFixed(1)})`);
        
        // Reduce max emojis
        config.max_emojis_on_screen = Math.floor(config.max_emojis_on_screen * 0.7);
        
        // Disable expensive effects
        if (config.pixel_enabled) config.pixel_enabled = false;
        if (config.rainbow_enabled && config.color_mode !== 'off') config.rainbow_enabled = false;
        
    } else if (avgFPS < fpsThreshold * 0.7 && performanceMode === 'reduced') {
        // Switch to minimal performance mode
        performanceMode = 'minimal';
        console.log(`⚡ FPS optimization: Switching to minimal mode (FPS: ${avgFPS.toFixed(1)})`);
        
        // Further reduce max emojis
        config.max_emojis_on_screen = Math.floor(config.max_emojis_on_screen * 0.5);
        
        // Disable all expensive effects
        config.wind_enabled = false;
        config.rainbow_enabled = false;
        config.color_mode = 'off';
        
    } else if (avgFPS > config.target_fps * 0.95 && performanceMode !== 'normal') {
        // Restore normal performance mode
        performanceMode = 'normal';
        console.log(`⚡ FPS optimization: Restoring normal mode (FPS: ${avgFPS.toFixed(1)})`);
        
        // Reload config to restore settings
        loadConfig();
    }
}

/**
 * Spawn emoji
 */
function spawnEmoji(emoji, x, y, size, username = null) {
    // Check for user-specific emoji
    if (username && userEmojiMap[username]) {
        emoji = userEmojiMap[username];
    }

    // Normalize x position (0-1 to px)
    if (x >= 0 && x <= 1) {
        x = x * canvasWidth;
    }

    // Create physics body
    const radius = size / 2;
    const body = Bodies.circle(x, y, radius, {
        friction: config.physics_friction,
        restitution: config.bounce_height,
        density: 0.01,
        frictionAir: 0
    });

    // Add initial velocity
    Body.setVelocity(body, {
        x: (Math.random() - 0.5) * 2,
        y: Math.random() * 2
    });

    World.add(engine.world, body);

    // Create DOM element
    const element = document.createElement('div');
    element.className = 'emoji-sprite';

    // Use custom image or emoji
    if (config.use_custom_images && config.image_urls && config.image_urls.length > 0) {
        const imageUrl = config.image_urls[Math.floor(Math.random() * config.image_urls.length)];
        const img = document.createElement('img');
        img.src = imageUrl;
        img.style.width = size + 'px';
        img.style.height = size + 'px';
        element.appendChild(img);
    } else {
        element.textContent = emoji;
        element.style.fontSize = size + 'px';
    }

    element.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    element.style.left = '0';
    element.style.top = '0';

    // Apply pixel effect
    applyPixelEffect(element);

    document.getElementById('canvas-container').appendChild(element);

    // Track emoji
    const emojiObj = {
        body: body,
        element: element,
        emoji: emoji,
        size: size,
        rotation: 0,
        spawnTime: performance.now(),
        fading: false,
        removed: false,
        hasBouncedEffect: false,
        username: username
    };

    emojis.push(emojiObj);
    return emojiObj;
}

/**
 * Fade out emoji
 */
function fadeOutEmoji(emoji) {
    if (emoji.fading) return;

    emoji.fading = true;
    emoji.element.classList.add('fading');

    setTimeout(() => {
        removeEmoji(emoji);
    }, config.emoji_fade_duration_ms);
}

/**
 * Remove emoji
 */
function removeEmoji(emoji) {
    if (emoji.removed) return;

    emoji.removed = true;

    if (emoji.body) {
        World.remove(engine.world, emoji.body);
        emoji.body = null;
    }

    if (emoji.element && emoji.element.parentNode) {
        emoji.element.parentNode.removeChild(emoji.element);
        emoji.element = null;
    }
}

/**
 * Handle spawn event from server
 */
function handleSpawnEvent(data) {
    if (!config.enabled) return;

    const count = data.count || 1;
    const emoji = data.emoji || getRandomEmoji();
    const x = data.x !== undefined ? data.x : Math.random();
    const y = data.y !== undefined ? data.y : 0;
    const username = data.username || null;
    const isBurst = data.burst || false;

    // Apply burst multiplier
    const actualCount = isBurst ? Math.floor(count * config.superfan_burst_intensity) : count;

    for (let i = 0; i < actualCount; i++) {
        const size = config.emoji_min_size_px + Math.random() * (config.emoji_max_size_px - config.emoji_min_size_px);
        const offsetX = x + (Math.random() - 0.5) * 0.2;
        const offsetY = y - i * 5;

        spawnEmoji(emoji, offsetX, offsetY, size, username);
    }

    console.log(`🌧️ Spawned ${actualCount}x ${emoji} at (${x.toFixed(2)}, ${y})${isBurst ? ' [BURST]' : ''}`);
}

/**
 * Get random emoji from config
 */
function getRandomEmoji() {
    if (config.emoji_set && config.emoji_set.length > 0) {
        return config.emoji_set[Math.floor(Math.random() * config.emoji_set.length)];
    }
    return '❓';
}

/**
 * Update debug info
 */
function updateDebugInfo() {
    const debug = document.getElementById('debug-info');
    debug.style.display = 'block';
    debug.innerHTML = `
        <strong>Emoji Rain Debug</strong><br>
        Emojis: ${emojis.length} / ${config.max_emojis_on_screen}<br>
        FPS: ${currentFPS} (Target: ${config.target_fps})<br>
        Mode: ${performanceMode}<br>
        Wind: ${windForce.toFixed(6)}<br>
        Bodies: ${engine.world.bodies.length}<br>
        Enabled: ${config.enabled ? 'Yes' : 'No'}
    `;
}

/**
 * Load configuration from server
 */
async function loadConfig() {
    try {
        const response = await fetch('/api/emoji-rain/config');
        const data = await response.json();

        if (data.success && data.config) {
            Object.assign(config, data.config);
            console.log('✅ Emoji rain config loaded', config);

            // Update physics
            if (engine) {
                engine.gravity.y = config.physics_gravity_y;
                
                // Update boundaries if floor setting changed
                if (config.floor_enabled) {
                    if (!engine.world.bodies.includes(ground)) {
                        World.add(engine.world, ground);
                    }
                } else {
                    if (engine.world.bodies.includes(ground)) {
                        World.remove(engine.world, ground);
                    }
                }
            }
        }
    } catch (error) {
        console.error('❌ Failed to load emoji rain config:', error);
    }
}

/**
 * Load user emoji mappings
 */
async function loadUserEmojiMappings() {
    try {
        const response = await fetch('/api/emoji-rain/user-mappings');
        const data = await response.json();

        if (data.success && data.mappings) {
            userEmojiMap = data.mappings;
            console.log('✅ User emoji mappings loaded', userEmojiMap);
        }
    } catch (error) {
        console.error('❌ Failed to load user emoji mappings:', error);
    }
}

/**
 * Socket.IO setup
 */
function initSocket() {
    socket = io();

    socket.on('connect', () => {
        console.log('✅ Connected to server');
    });

    socket.on('emoji-rain:spawn', (data) => {
        handleSpawnEvent(data);
    });

    socket.on('emoji-rain:config-update', (data) => {
        if (data.config) {
            Object.assign(config, data.config);
            console.log('🔄 Config updated', config);

            if (engine) {
                engine.gravity.y = config.physics_gravity_y;
            }
        }
    });

    socket.on('emoji-rain:toggle', (data) => {
        config.enabled = data.enabled;
        console.log('🔄 Emoji rain ' + (data.enabled ? 'enabled' : 'disabled'));
    });

    socket.on('emoji-rain:user-mappings-update', (data) => {
        if (data.mappings) {
            userEmojiMap = data.mappings;
            console.log('🔄 User emoji mappings updated', userEmojiMap);
        }
    });
}

/**
 * Initialize everything
 */
async function init() {
    console.log('🌧️ Initializing Enhanced Emoji Rain Overlay...');

    // Load config and user mappings
    await loadConfig();
    await loadUserEmojiMappings();

    // Initialize physics
    initPhysics();

    // Initialize socket
    initSocket();

    // Start update loop
    requestAnimationFrame(updateLoop);

    console.log('✅ Enhanced Emoji Rain Overlay ready!');
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Handle window resize
window.addEventListener('resize', () => {
    resizeCanvas();
});

// Enable debug mode with keyboard shortcut
document.addEventListener('keydown', (e) => {
    if (e.key === 'd' && e.ctrlKey) {
        debugMode = !debugMode;
        if (!debugMode) {
            document.getElementById('debug-info').style.display = 'none';
        }
        console.log('Debug mode: ' + debugMode);
    }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    emojis.forEach(emoji => removeEmoji(emoji));
    if (engine) {
        Engine.clear(engine);
    }
    console.log('🧹 Cleanup completed');
});
