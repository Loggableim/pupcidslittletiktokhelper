const socket = io();
let config = {};

// Load configuration on page load
async function loadConfig() {
    console.log('🔄 [EMOJI RAIN UI] Loading configuration...');
    try {
        const response = await fetch('/api/emoji-rain/config');
        console.log('📥 [EMOJI RAIN UI] Response status:', response.status);

        const data = await response.json();
        console.log('📦 [EMOJI RAIN UI] Response data:', JSON.stringify(data, null, 2));

        if (data.success) {
            config = data.config;
            console.log('✅ [EMOJI RAIN UI] Config loaded successfully:', JSON.stringify(config, null, 2));
            console.log('🔍 [EMOJI RAIN UI] Config type:', typeof config);
            console.log('🔍 [EMOJI RAIN UI] Config.enabled:', config.enabled);
            console.log('🔍 [EMOJI RAIN UI] Config.emoji_set:', config.emoji_set);
            console.log('🔍 [EMOJI RAIN UI] Config.emoji_set type:', typeof config.emoji_set, Array.isArray(config.emoji_set));
            updateUI();
        } else {
            console.error('❌ [EMOJI RAIN UI] Config load failed:', data.error);
            showNotification('Fehler: ' + (data.error || 'Unknown error'), true);
        }
    } catch (error) {
        console.error('❌ [EMOJI RAIN UI] Exception during config load:', error);
        console.error('❌ [EMOJI RAIN UI] Error stack:', error.stack);
        showNotification('Fehler beim Laden der Konfiguration', true);
    }
}

// Resolution presets
const resolutionPresets = {
    '720p': { width: 1280, height: 720 },
    '1080p': { width: 1920, height: 1080 },
    '1440p': { width: 2560, height: 1440 },
    '4k': { width: 3840, height: 2160 }
};

// Apply resolution preset
function applyResolutionPreset() {
    const preset = document.getElementById('obs_hud_preset').value;
    if (preset !== 'custom' && resolutionPresets[preset]) {
        document.getElementById('obs_hud_width').value = resolutionPresets[preset].width;
        document.getElementById('obs_hud_height').value = resolutionPresets[preset].height;
    }
}

// Update UI with loaded config
function updateUI() {
    console.log('🎨 [EMOJI RAIN UI] Updating UI with config...');

    try {
        // Main toggle
        console.log('🎨 [EMOJI RAIN UI] Setting enabled toggle:', config.enabled);
        document.getElementById('enabled-toggle').checked = config.enabled;
        updateEnabledStatus();

        // OBS HUD settings
        console.log('🎨 [EMOJI RAIN UI] Setting OBS HUD settings...');
        document.getElementById('obs_hud_enabled').checked = config.obs_hud_enabled !== false;
        document.getElementById('obs_hud_width').value = config.obs_hud_width || 1920;
        document.getElementById('obs_hud_height').value = config.obs_hud_height || 1080;
        document.getElementById('enable_glow').checked = config.enable_glow !== false;
        document.getElementById('enable_particles').checked = config.enable_particles !== false;
        document.getElementById('enable_depth').checked = config.enable_depth !== false;
        document.getElementById('target_fps').value = config.target_fps || 60;

        // Detect preset
        const width = config.obs_hud_width || 1920;
        const height = config.obs_hud_height || 1080;
        let detectedPreset = 'custom';
        for (const [preset, res] of Object.entries(resolutionPresets)) {
            if (res.width === width && res.height === height) {
                detectedPreset = preset;
                break;
            }
        }
        document.getElementById('obs_hud_preset').value = detectedPreset;
        console.log('🎨 [EMOJI RAIN UI] Detected resolution preset:', detectedPreset);

        // Canvas settings
        console.log('🎨 [EMOJI RAIN UI] Setting canvas settings...');
        document.getElementById('width_px').value = config.width_px || 1280;
        document.getElementById('height_px').value = config.height_px || 720;

        // Emoji set
        console.log('🎨 [EMOJI RAIN UI] Setting emoji set...');
        console.log('🎨 [EMOJI RAIN UI] config.emoji_set:', config.emoji_set);

        if (!config.emoji_set) {
            console.error('❌ [EMOJI RAIN UI] emoji_set is undefined or null!');
            config.emoji_set = ["💧","💙","💚","💜","❤️","🩵","✨","🌟","🔥","🎉"];
        }

        if (!Array.isArray(config.emoji_set)) {
            console.error('❌ [EMOJI RAIN UI] emoji_set is not an array:', typeof config.emoji_set);
            console.error('❌ [EMOJI RAIN UI] emoji_set value:', config.emoji_set);
            config.emoji_set = ["💧","💙","💚","💜","❤️","🩵","✨","🌟","🔥","🎉"];
        }

        document.getElementById('emoji_set').value = config.emoji_set.join(',');
        console.log('🎨 [EMOJI RAIN UI] Emoji set value set to:', document.getElementById('emoji_set').value);
        updateEmojiPreview();

        // Custom images
        console.log('🎨 [EMOJI RAIN UI] Setting custom images...');
        document.getElementById('use_custom_images').checked = config.use_custom_images || false;
        document.getElementById('image_urls').value = (config.image_urls || []).join('\n');

        // Effect
        console.log('🎨 [EMOJI RAIN UI] Setting effect...');
        document.getElementById('effect').value = config.effect || 'bounce';

        // Physics
        console.log('🎨 [EMOJI RAIN UI] Setting physics...');
        setRangeValue('physics_gravity_y', config.physics_gravity_y);
        setRangeValue('physics_air', config.physics_air);
        setRangeValue('physics_friction', config.physics_friction);
        setRangeValue('physics_restitution', config.physics_restitution);
        setRangeValue('physics_wind_strength', config.physics_wind_strength);
        setRangeValue('physics_wind_variation', config.physics_wind_variation);

        // Appearance
        console.log('🎨 [EMOJI RAIN UI] Setting appearance...');
        document.getElementById('emoji_min_size_px').value = config.emoji_min_size_px;
        document.getElementById('emoji_max_size_px').value = config.emoji_max_size_px;
        setRangeValue('emoji_rotation_speed', config.emoji_rotation_speed);
        document.getElementById('emoji_lifetime_ms').value = config.emoji_lifetime_ms;
        document.getElementById('emoji_fade_duration_ms').value = config.emoji_fade_duration_ms;
        document.getElementById('max_emojis_on_screen').value = config.max_emojis_on_screen;

        // Scaling rules
        console.log('🎨 [EMOJI RAIN UI] Setting scaling rules...');
        document.getElementById('like_count_divisor').value = config.like_count_divisor;
        document.getElementById('like_min_emojis').value = config.like_min_emojis;
        document.getElementById('like_max_emojis').value = config.like_max_emojis;
        document.getElementById('gift_base_emojis').value = config.gift_base_emojis;
        setRangeValue('gift_coin_multiplier', config.gift_coin_multiplier);
        document.getElementById('gift_max_emojis').value = config.gift_max_emojis;

        console.log('✅ [EMOJI RAIN UI] UI update completed successfully');
    } catch (error) {
        console.error('❌ [EMOJI RAIN UI] Error updating UI:', error);
        console.error('❌ [EMOJI RAIN UI] Error stack:', error.stack);
        showNotification('Fehler beim Aktualisieren der UI', true);
    }
}

function setRangeValue(id, value) {
    const input = document.getElementById(id);
    const valueDisplay = document.getElementById(id + '_value');
    input.value = value;
    valueDisplay.textContent = value;
}

// Save configuration
async function saveConfig() {
    const imageUrlsText = document.getElementById('image_urls').value;
    const imageUrls = imageUrlsText.split('\n').map(url => url.trim()).filter(url => url);

    const newConfig = {
        enabled: document.getElementById('enabled-toggle').checked,
        // OBS HUD settings
        obs_hud_enabled: document.getElementById('obs_hud_enabled').checked,
        obs_hud_width: parseInt(document.getElementById('obs_hud_width').value),
        obs_hud_height: parseInt(document.getElementById('obs_hud_height').value),
        enable_glow: document.getElementById('enable_glow').checked,
        enable_particles: document.getElementById('enable_particles').checked,
        enable_depth: document.getElementById('enable_depth').checked,
        target_fps: parseInt(document.getElementById('target_fps').value),
        // Standard canvas settings
        width_px: parseInt(document.getElementById('width_px').value),
        height_px: parseInt(document.getElementById('height_px').value),
        emoji_set: document.getElementById('emoji_set').value.split(',').map(e => e.trim()).filter(e => e),
        use_custom_images: document.getElementById('use_custom_images').checked,
        image_urls: imageUrls,
        effect: document.getElementById('effect').value,
        physics_gravity_y: parseFloat(document.getElementById('physics_gravity_y').value),
        physics_air: parseFloat(document.getElementById('physics_air').value),
        physics_friction: parseFloat(document.getElementById('physics_friction').value),
        physics_restitution: parseFloat(document.getElementById('physics_restitution').value),
        physics_wind_strength: parseFloat(document.getElementById('physics_wind_strength').value),
        physics_wind_variation: parseFloat(document.getElementById('physics_wind_variation').value),
        emoji_min_size_px: parseInt(document.getElementById('emoji_min_size_px').value),
        emoji_max_size_px: parseInt(document.getElementById('emoji_max_size_px').value),
        emoji_rotation_speed: parseFloat(document.getElementById('emoji_rotation_speed').value),
        emoji_lifetime_ms: parseInt(document.getElementById('emoji_lifetime_ms').value),
        emoji_fade_duration_ms: parseInt(document.getElementById('emoji_fade_duration_ms').value),
        max_emojis_on_screen: parseInt(document.getElementById('max_emojis_on_screen').value),
        like_count_divisor: parseInt(document.getElementById('like_count_divisor').value),
        like_min_emojis: parseInt(document.getElementById('like_min_emojis').value),
        like_max_emojis: parseInt(document.getElementById('like_max_emojis').value),
        gift_base_emojis: parseInt(document.getElementById('gift_base_emojis').value),
        gift_coin_multiplier: parseFloat(document.getElementById('gift_coin_multiplier').value),
        gift_max_emojis: parseInt(document.getElementById('gift_max_emojis').value)
    };

    try {
        const response = await fetch('/api/emoji-rain/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config: newConfig, enabled: newConfig.enabled })
        });

        const data = await response.json();

        if (data.success) {
            config = newConfig;
            showNotification('Konfiguration gespeichert!');
        } else {
            showNotification('Fehler beim Speichern: ' + data.error, true);
        }
    } catch (error) {
        showNotification('Netzwerkfehler beim Speichern', true);
        console.error(error);
    }
}

// Test emoji rain
async function testEmojiRain() {
    try {
        const response = await fetch('/api/emoji-rain/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ count: 10 })
        });

        const data = await response.json();

        if (data.success) {
            showNotification('Test-Emojis gespawnt!');
        } else {
            showNotification('Fehler: ' + data.error, true);
        }
    } catch (error) {
        showNotification('Netzwerkfehler beim Testen', true);
        console.error(error);
    }
}

// Toggle enabled status - listener added below
function onEnabledToggleChange(event) {
    const enabled = event.target.checked;

    fetch('/api/emoji-rain/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            config.enabled = enabled;
            updateEnabledStatus();
            showNotification(enabled ? 'Emoji Rain aktiviert!' : 'Emoji Rain deaktiviert!');
        } else {
            event.target.checked = !enabled;
            showNotification('Fehler: ' + data.error, true);
        }
    })
    .catch(error => {
        event.target.checked = !enabled;
        showNotification('Netzwerkfehler', true);
        console.error(error);
    });
}

function updateEnabledStatus() {
    const status = document.getElementById('enabled-status');
    const enabled = document.getElementById('enabled-toggle').checked;
    status.textContent = enabled ? 'Aktiviert' : 'Deaktiviert';
    status.style.color = enabled ? '#4CAF50' : '#ccc';
}

// Update emoji preview
function updateEmojiPreview() {
    const input = document.getElementById('emoji_set').value;
    const emojis = input.split(',').map(e => e.trim()).filter(e => e);
    const preview = document.getElementById('emoji-preview');

    preview.innerHTML = '';
    emojis.forEach(emoji => {
        const span = document.createElement('span');
        span.className = 'emoji-preview-item';
        span.textContent = emoji;
        preview.appendChild(span);
    });
}

// Range input value display
function setupRangeInputs() {
    document.querySelectorAll('input[type="range"]').forEach(input => {
        input.addEventListener('input', function() {
            const valueDisplay = document.getElementById(this.id + '_value');
            if (valueDisplay) {
                valueDisplay.textContent = this.value;
            }
        });
    });
}

// Show notification
function showNotification(message, isError = false) {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = 'notification' + (isError ? ' error' : '');
    notification.classList.add('show');

    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// Upload images
async function uploadImages() {
    const fileInput = document.getElementById('image-upload');
    const files = fileInput.files;

    if (files.length === 0) {
        showNotification('Bitte wähle mindestens eine Datei aus', true);
        return;
    }

    const progressEl = document.getElementById('upload-progress');
    progressEl.style.display = 'block';
    progressEl.textContent = `Uploading ${files.length} file(s)...`;

    let uploaded = 0;
    let failed = 0;

    for (let i = 0; i < files.length; i++) {
        const formData = new FormData();
        formData.append('image', files[i]);

        try {
            const response = await fetch('/api/emoji-rain/upload', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                uploaded++;
                progressEl.textContent = `Uploaded ${uploaded}/${files.length}...`;
            } else {
                failed++;
                console.error('Upload failed:', data.error);
            }
        } catch (error) {
            failed++;
            console.error('Upload error:', error);
        }
    }

    // Clear file input
    fileInput.value = '';

    // Hide progress
    setTimeout(() => {
        progressEl.style.display = 'none';
    }, 2000);

    // Show result
    if (failed > 0) {
        showNotification(`${uploaded} hochgeladen, ${failed} fehlgeschlagen`, failed > uploaded);
    } else {
        showNotification(`${uploaded} Bild(er) erfolgreich hochgeladen!`);
    }

    // Refresh image list
    await loadUploadedImages();
}

// Load uploaded images
async function loadUploadedImages() {
    try {
        const response = await fetch('/api/emoji-rain/images');
        const data = await response.json();

        const grid = document.getElementById('uploaded-images-grid');

        if (data.success && data.images.length > 0) {
            grid.innerHTML = '';

            // Update image URLs in textarea
            const currentUrls = document.getElementById('image_urls').value.split('\n').map(u => u.trim()).filter(u => u);
            const uploadedUrls = data.images.map(img => img.url);
            const allUrls = [...new Set([...uploadedUrls, ...currentUrls])];
            document.getElementById('image_urls').value = allUrls.join('\n');

            // Render image grid - CSP-compliant (no innerHTML with inline styles)
            data.images.forEach(img => {
                const item = document.createElement('div');
                item.className = 'image-item';

                // Create img element
                const imgEl = document.createElement('img');
                imgEl.src = img.url;
                imgEl.alt = img.filename;
                imgEl.title = img.filename;

                // Create delete button
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'delete-btn';
                deleteBtn.setAttribute('data-filename', img.filename);
                deleteBtn.title = 'Löschen';
                deleteBtn.textContent = '×';

                item.appendChild(imgEl);
                item.appendChild(deleteBtn);
                grid.appendChild(item);
            });
        } else {
            // CSP-compliant: Create element instead of innerHTML with inline styles
            grid.innerHTML = '';
            const emptyMsg = document.createElement('div');
            emptyMsg.textContent = 'Keine Bilder hochgeladen';
            emptyMsg.style.textAlign = 'center';
            emptyMsg.style.color = '#9ca3af';
            emptyMsg.style.gridColumn = '1 / -1';
            grid.appendChild(emptyMsg);
        }
    } catch (error) {
        console.error('Error loading images:', error);
    }
}

// Delete image
async function deleteImage(filename) {
    if (!confirm(`Bild "${filename}" wirklich löschen?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/emoji-rain/images/${filename}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            showNotification('Bild gelöscht!');

            // Remove URL from textarea
            const currentUrls = document.getElementById('image_urls').value.split('\n');
            const urlToRemove = `/uploads/emoji-rain/${filename}`;
            const newUrls = currentUrls.filter(url => url.trim() !== urlToRemove);
            document.getElementById('image_urls').value = newUrls.join('\n');

            // Reload image list
            await loadUploadedImages();
        } else {
            showNotification('Fehler beim Löschen: ' + data.error, true);
        }
    } catch (error) {
        showNotification('Netzwerkfehler beim Löschen', true);
        console.error(error);
    }
}

// ========== INITIALIZATION ==========

// Initialize everything when DOM is ready
function initializeEmojiRainUI() {
    console.log('🚀 [EMOJI RAIN UI] Initializing Emoji Rain UI...');

    loadConfig();
    loadUploadedImages();

    console.log('✅ [EMOJI RAIN UI] Initialization started');

    // ========== EVENT LISTENERS (CSP-compliant) ==========

    // Enable/disable toggle
    document.getElementById('enabled-toggle').addEventListener('change', onEnabledToggleChange);

    // Resolution preset selector
    document.getElementById('obs_hud_preset').addEventListener('change', applyResolutionPreset);

    // Upload images button
    document.getElementById('upload-images-btn').addEventListener('click', uploadImages);

    // Save config button
    document.getElementById('save-config-btn').addEventListener('click', saveConfig);

    // Test emoji rain button
    document.getElementById('test-emoji-rain-btn').addEventListener('click', testEmojiRain);

    // Emoji set input
    document.getElementById('emoji_set').addEventListener('input', updateEmojiPreview);

    // Range inputs
    setupRangeInputs();

    // Delete image buttons (event delegation)
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('delete-btn')) {
            const filename = e.target.getAttribute('data-filename');
            if (filename) {
                deleteImage(filename);
            }
        }
    });
}

// Run when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeEmojiRainUI);
} else {
    initializeEmojiRainUI();
}
