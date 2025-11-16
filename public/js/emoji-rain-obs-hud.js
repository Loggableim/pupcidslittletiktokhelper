        // Matter.js aliases
        const Engine = Matter.Engine;
        const Render = Matter.Render;
        const World = Matter.World;
        const Bodies = Matter.Bodies;
        const Body = Matter.Body;
        const Events = Matter.Events;

        // Configuration
        let config = {
            enabled: true,
            width_px: 1920,
            height_px: 1080,
            emoji_set: ["💧","💙","💚","💜","❤️","🩵","✨","🌟","🔥","🎉"],
            use_custom_images: false,
            image_urls: [],
            effect: 'bounce',
            physics_gravity_y: 1.0,
            physics_air: 0.02,
            physics_friction: 0.1,
            physics_restitution: 0.6,
            physics_wind_strength: 0.0005,
            physics_wind_variation: 0.0003,
            emoji_min_size_px: 40,
            emoji_max_size_px: 80,
            emoji_rotation_speed: 0.05,
            emoji_lifetime_ms: 8000,
            emoji_fade_duration_ms: 1000,
            max_emojis_on_screen: 200,
            like_count_divisor: 10,
            like_min_emojis: 1,
            like_max_emojis: 20,
            gift_base_emojis: 3,
            gift_coin_multiplier: 0.1,
            gift_max_emojis: 50,
            // OBS HUD specific settings
            obs_hud_enabled: true,
            obs_hud_width: 1920,
            obs_hud_height: 1080,
            enable_glow: true,
            enable_particles: true,
            enable_depth: true,
            target_fps: 60
        };

        // State
        let engine, render;
        let socket;
        let emojis = []; // Track emoji bodies and DOM elements
        let particlePool = []; // Pool of reusable particle elements
        let windForce = 0;
        let perfHudVisible = false;
        let resolutionIndicatorVisible = false;
        let ground, leftWall, rightWall;
        let canvasWidth, canvasHeight;

        // Performance tracking
        let lastFrameTime = performance.now();
        let frameCount = 0;
        let fps = 60;
        let fpsUpdateTime = performance.now();
        const TARGET_FRAME_TIME = 1000 / 60; // 60 FPS target
        let lastUpdateTime = performance.now();

        // Object pooling for particles
        const MAX_PARTICLE_POOL_SIZE = 100;

        // Initialize physics engine
        function initPhysics() {
            // Use configured OBS HUD dimensions
            canvasWidth = config.obs_hud_width || config.width_px || 1920;
            canvasHeight = config.obs_hud_height || config.height_px || 1080;

            // Set canvas container size
            const container = document.getElementById('canvas-container');
            container.style.width = canvasWidth + 'px';
            container.style.height = canvasHeight + 'px';

            // Update resolution indicator
            updateResolutionIndicator();

            // Create engine
            engine = Engine.create({
                enableSleeping: false,
                timing: {
                    timeScale: 1
                }
            });

            // Set gravity
            engine.gravity.y = config.physics_gravity_y;

            // Create invisible boundaries
            const thickness = 100;
            ground = Bodies.rectangle(
                canvasWidth / 2,
                canvasHeight + thickness / 2,
                canvasWidth + thickness * 2,
                thickness,
                {
                    isStatic: true,
                    friction: config.physics_friction,
                    restitution: config.physics_restitution,
                    label: 'ground'
                }
            );

            leftWall = Bodies.rectangle(
                -thickness / 2,
                canvasHeight / 2,
                thickness,
                canvasHeight + thickness * 2,
                {
                    isStatic: true,
                    friction: config.physics_friction,
                    restitution: config.physics_restitution
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
                    restitution: config.physics_restitution
                }
            );

            World.add(engine.world, [ground, leftWall, rightWall]);

            // Listen for collision with ground for bounce effect
            Events.on(engine, 'collisionStart', handleCollision);

            console.log(`✅ Physics initialized at ${canvasWidth}x${canvasHeight}`);
        }

        // Handle collision events (for bounce animation)
        function handleCollision(event) {
            if (config.effect === 'none') return;

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

        // Trigger bounce/blop animation with enhanced effects
        function triggerBounceEffect(emoji) {
            if (!emoji.element || config.effect === 'none') return;

            emoji.element.classList.add('bouncing');

            // Add temporary glow
            if (config.enable_glow) {
                emoji.element.classList.add('glowing');
                // Clear existing timeout if any
                if (emoji.glowTimeout) {
                    clearTimeout(emoji.glowTimeout);
                }
                emoji.glowTimeout = setTimeout(() => {
                    // Check if element still exists before removing class
                    if (emoji.element && !emoji.removed) {
                        emoji.element.classList.remove('glowing');
                    }
                    emoji.glowTimeout = null;
                }, 300);
            }

            // Spawn particles on impact
            if (config.enable_particles) {
                spawnImpactParticles(emoji.body.position.x, emoji.body.position.y, 8);
            }

            // Clear existing timeout if any
            if (emoji.bounceTimeout) {
                clearTimeout(emoji.bounceTimeout);
            }
            emoji.bounceTimeout = setTimeout(() => {
                // Check if element still exists before removing class
                if (emoji.element && !emoji.removed) {
                    emoji.element.classList.remove('bouncing');
                }
                emoji.bounceTimeout = null;
            }, 500);
        }

        // Spawn particle effects
        function spawnImpactParticles(x, y, count) {
            for (let i = 0; i < count; i++) {
                const particle = getParticleFromPool();

                const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
                const distance = 20 + Math.random() * 20;
                const px = x + Math.cos(angle) * distance;
                const py = y + Math.sin(angle) * distance;

                particle.style.left = px + 'px';
                particle.style.top = py + 'px';
                particle.style.background = `radial-gradient(circle,
                    rgba(255,255,255,${0.8 + Math.random() * 0.2}) 0%,
                    rgba(255,255,255,0) 70%)`;

                document.getElementById('canvas-container').appendChild(particle);

                // Return to pool after animation
                setTimeout(() => {
                    returnParticleToPool(particle);
                }, 600);
            }
        }

        // Object pooling for particles
        function getParticleFromPool() {
            if (particlePool.length > 0) {
                return particlePool.pop();
            }
            const particle = document.createElement('div');
            particle.className = 'particle-trail';
            return particle;
        }

        function returnParticleToPool(particle) {
            if (particle.parentNode) {
                particle.parentNode.removeChild(particle);
            }
            if (particlePool.length < MAX_PARTICLE_POOL_SIZE) {
                particlePool.push(particle);
            }
        }

        // Main update loop with 60 FPS targeting
        function updateLoop(currentTime) {
            // Calculate delta time
            const deltaTime = currentTime - lastUpdateTime;

            // Throttle to target FPS
            if (deltaTime < TARGET_FRAME_TIME) {
                requestAnimationFrame(updateLoop);
                return;
            }

            lastUpdateTime = currentTime - (deltaTime % TARGET_FRAME_TIME);

            // Update FPS counter
            frameCount++;
            if (currentTime - fpsUpdateTime >= 1000) {
                fps = Math.round(frameCount * 1000 / (currentTime - fpsUpdateTime));
                frameCount = 0;
                fpsUpdateTime = currentTime;
            }

            // Run physics engine step (clamp delta to prevent warnings)
            const clampedDelta = Math.min(deltaTime, TARGET_FRAME_TIME);
            Engine.update(engine, clampedDelta);

            // Apply wind force to all emojis
            windForce += (Math.random() - 0.5) * config.physics_wind_variation;
            windForce = Math.max(-config.physics_wind_strength, Math.min(config.physics_wind_strength, windForce));

            // Update all emojis
            emojis.forEach(emoji => {
                if (emoji.body) {
                    // Check if emoji has escaped the world bounds
                    const pos = emoji.body.position;
                    const margin = 200; // Extra margin outside canvas
                    if (pos.x < -margin || pos.x > canvasWidth + margin || 
                        pos.y < -margin || pos.y > canvasHeight + margin) {
                        // Emoji escaped, remove it
                        removeEmoji(emoji);
                        return;
                    }

                    // Apply wind
                    Body.applyForce(emoji.body, emoji.body.position, {
                        x: windForce,
                        y: 0
                    });

                    // Apply air resistance
                    const velocity = emoji.body.velocity;
                    Body.setVelocity(emoji.body, {
                        x: velocity.x * (1 - config.physics_air),
                        y: velocity.y * (1 - config.physics_air)
                    });

                    // Update DOM element position and rotation (optimized)
                    if (emoji.element) {
                        const px = emoji.body.position.x;
                        const py = emoji.body.position.y;
                        const rotation = emoji.body.angle + emoji.rotation;
                        emoji.rotation += config.emoji_rotation_speed;

                        // Use transform for better performance
                        emoji.element.style.transform = `translate3d(${px}px, ${py}px, 0) translate(-50%, -50%) rotate(${rotation}rad)`;
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

            // Limit max emojis (remove oldest first)
            while (emojis.length > config.max_emojis_on_screen) {
                const oldest = emojis[0];
                removeEmoji(oldest);
            }

            // Update performance HUD
            if (perfHudVisible) {
                updatePerfHUD(currentTime);
            }

            requestAnimationFrame(updateLoop);
        }

        // Spawn emoji with enhanced effects
        function spawnEmoji(emoji, x, y, size) {
            // Normalize x position (0-1 to px)
            if (x >= 0 && x <= 1) {
                x = x * canvasWidth;
            }

            // Create physics body (circle)
            const radius = size / 2;
            const body = Bodies.circle(x, y, radius, {
                friction: config.physics_friction,
                restitution: config.physics_restitution,
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

            // Set initial position with explicit position style to prevent top-left corner freeze
            element.style.position = 'absolute';
            element.style.left = '0';
            element.style.top = '0';
            element.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;

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
                hasBouncedEffect: false
            };

            emojis.push(emojiObj);

            return emojiObj;
        }

        // Fade out emoji
        function fadeOutEmoji(emoji) {
            if (emoji.fading || emoji.removed) return;

            emoji.fading = true;
            if (emoji.element) {
                emoji.element.classList.add('fading');
            }

            // Clear any pending timeout before setting a new one
            if (emoji.fadeTimeout) {
                clearTimeout(emoji.fadeTimeout);
            }
            
            emoji.fadeTimeout = setTimeout(() => {
                removeEmoji(emoji);
                emoji.fadeTimeout = null;
            }, config.emoji_fade_duration_ms);
        }

        // Remove emoji (with proper cleanup)
        function removeEmoji(emoji) {
            if (emoji.removed) return;

            emoji.removed = true;

            // Clean up all pending timeouts to prevent memory leaks
            if (emoji.fadeTimeout) {
                clearTimeout(emoji.fadeTimeout);
                emoji.fadeTimeout = null;
            }
            if (emoji.bounceTimeout) {
                clearTimeout(emoji.bounceTimeout);
                emoji.bounceTimeout = null;
            }
            if (emoji.glowTimeout) {
                clearTimeout(emoji.glowTimeout);
                emoji.glowTimeout = null;
            }

            // Remove from physics world
            if (emoji.body) {
                World.remove(engine.world, emoji.body);
                emoji.body = null;
            }

            // Remove DOM element
            if (emoji.element && emoji.element.parentNode) {
                emoji.element.parentNode.removeChild(emoji.element);
                emoji.element = null;
            }
        }

        // Handle spawn event from server
        function handleSpawnEvent(data) {
            if (!config.enabled || !config.obs_hud_enabled) return;

            const count = data.count || 1;
            const emoji = data.emoji || getRandomEmoji();
            const x = data.x !== undefined ? data.x : Math.random();
            const y = data.y !== undefined ? data.y : 0;

            for (let i = 0; i < count; i++) {
                const size = config.emoji_min_size_px + Math.random() * (config.emoji_max_size_px - config.emoji_min_size_px);
                const offsetX = x + (Math.random() - 0.5) * 0.2;
                const offsetY = y - i * 5;

                spawnEmoji(emoji, offsetX, offsetY, size);
            }

            console.log(`🌧️ Spawned ${count}x ${emoji} at (${x.toFixed(2)}, ${y})`);
        }

        // Get random emoji from config
        function getRandomEmoji() {
            if (config.emoji_set && config.emoji_set.length > 0) {
                return config.emoji_set[Math.floor(Math.random() * config.emoji_set.length)];
            }
            return '❓';
        }

        // Update performance HUD
        function updatePerfHUD(currentTime) {
            document.getElementById('fps').textContent = fps;
            document.getElementById('fps').className = fps < 30 ? 'perf-critical' : (fps < 50 ? 'perf-warning' : '');

            document.getElementById('emoji-count').textContent = emojis.length;
            document.getElementById('emoji-max').textContent = config.max_emojis_on_screen;

            document.getElementById('body-count').textContent = engine.world.bodies.length;

            // Memory usage (if available)
            if (performance.memory) {
                const memoryMB = (performance.memory.usedJSHeapSize / 1048576).toFixed(2);
                document.getElementById('memory-usage').textContent = memoryMB;
            }

            // Frame time
            const frameTime = (currentTime - lastFrameTime).toFixed(2);
            document.getElementById('frame-time').textContent = frameTime;
            lastFrameTime = currentTime;

            document.getElementById('perf-resolution').textContent = `${canvasWidth}x${canvasHeight}`;
        }

        // Update resolution indicator
        function updateResolutionIndicator() {
            const indicator = document.getElementById('resolution-indicator');
            indicator.textContent = `OBS HUD: ${canvasWidth}x${canvasHeight}`;
        }

        // Load configuration from server
        async function loadConfig() {
            try {
                const response = await fetch('/api/emoji-rain/config');
                const data = await response.json();

                if (data.success && data.config) {
                    Object.assign(config, data.config);
                    console.log('✅ Config loaded', config);

                    // Update physics
                    if (engine) {
                        engine.gravity.y = config.physics_gravity_y;

                        // Update canvas size if resolution changed
                        const newWidth = config.obs_hud_width || config.width_px || 1920;
                        const newHeight = config.obs_hud_height || config.height_px || 1080;

                        if (newWidth !== canvasWidth || newHeight !== canvasHeight) {
                            resizeCanvas(newWidth, newHeight);
                        }
                    }
                }
            } catch (error) {
                console.error('❌ Failed to load config:', error);
            }
        }

        // Resize canvas and physics world
        function resizeCanvas(newWidth, newHeight) {
            canvasWidth = newWidth;
            canvasHeight = newHeight;

            const container = document.getElementById('canvas-container');
            container.style.width = canvasWidth + 'px';
            container.style.height = canvasHeight + 'px';

            // Update world boundaries
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

            updateResolutionIndicator();
            console.log(`📐 Canvas resized to ${canvasWidth}x${canvasHeight}`);
        }

        // Socket.IO setup
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

                        const newWidth = config.obs_hud_width || config.width_px || 1920;
                        const newHeight = config.obs_hud_height || config.height_px || 1080;

                        if (newWidth !== canvasWidth || newHeight !== canvasHeight) {
                            resizeCanvas(newWidth, newHeight);
                        }
                    }
                }
            });

            socket.on('emoji-rain:toggle', (data) => {
                config.enabled = data.enabled;
                console.log('🔄 Emoji rain ' + (data.enabled ? 'enabled' : 'disabled'));
            });
        }

        // Initialize everything
        async function init() {
            console.log('🌧️ Initializing OBS HUD Emoji Rain Overlay...');

            await loadConfig();
            initPhysics();
            initSocket();

            // Start update loop
            requestAnimationFrame(updateLoop);

            console.log('✅ OBS HUD Emoji Rain Overlay ready!');
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl+P: Toggle performance HUD
            if (e.key === 'p' && e.ctrlKey) {
                e.preventDefault();
                perfHudVisible = !perfHudVisible;
                document.getElementById('perf-hud').classList.toggle('visible', perfHudVisible);
                console.log('Performance HUD: ' + perfHudVisible);
            }

            // Ctrl+R: Toggle resolution indicator
            if (e.key === 'r' && e.ctrlKey) {
                e.preventDefault();
                resolutionIndicatorVisible = !resolutionIndicatorVisible;
                document.getElementById('resolution-indicator').classList.toggle('visible', resolutionIndicatorVisible);
                console.log('Resolution indicator: ' + resolutionIndicatorVisible);
            }

            // Ctrl+T: Test spawn
            if (e.key === 't' && e.ctrlKey) {
                e.preventDefault();
                handleSpawnEvent({ count: 10 });
                console.log('Test spawn triggered');
            }
        });

        // Start when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }

        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            // Clean up all emojis
            emojis.forEach(emoji => removeEmoji(emoji));

            // Clear particle pool
            particlePool = [];

            console.log('🧹 Cleanup completed');
        });
