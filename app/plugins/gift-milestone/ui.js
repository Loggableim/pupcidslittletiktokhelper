const socket = io();
let config = null;
let stats = null;

// Load configuration on page load
async function loadConfig() {
    try {
        const response = await fetch('/api/gift-milestone/config');
        const data = await response.json();
        if (data.success) {
            config = data.config;
            populateForm(config);
        }
    } catch (error) {
        console.error('Error loading config:', error);
        showNotification('Fehler beim Laden der Konfiguration', 'error');
    }
}

// Load statistics
async function loadStats() {
    try {
        const response = await fetch('/api/gift-milestone/stats');
        const data = await response.json();
        if (data.success) {
            stats = data.stats;
            config = data.config;
            updateStatsDisplay(stats, config);
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Populate form with config data
function populateForm(config) {
    if (!config) {
        console.warn('Config is missing');
        return;
    }

    document.getElementById('enableToggle').checked = config.enabled || false;
    document.getElementById('statusText').textContent = config.enabled ? 'Aktiviert' : 'Deaktiviert';
    document.getElementById('threshold').value = config.threshold || 1000;
    document.getElementById('incrementStep').value = config.increment_step || 1000;
    document.getElementById('mode').value = config.mode || 'auto_increment';
    document.getElementById('playbackMode').value = config.playback_mode || 'exclusive';
    document.getElementById('audioVolume').value = config.audio_volume || 80;
    document.getElementById('animationDuration').value = config.animation_duration || 0;
    document.getElementById('sessionReset').checked = config.session_reset || false;

    // Update file previews
    updateFilePreview('gif', config.animation_gif_path);
    updateFilePreview('video', config.animation_video_path);
    updateFilePreview('audio', config.animation_audio_path);
}

// Update statistics display
function updateStatsDisplay(stats, config) {
    if (!stats || !config) {
        console.warn('Stats or config is missing');
        return;
    }

    const currentCoins = stats.cumulative_coins || 0;
    const nextMilestone = stats.current_milestone || config.threshold || 1000;
    const progress = nextMilestone > 0 ? (currentCoins / nextMilestone) * 100 : 0;

    document.getElementById('currentCoins').textContent = currentCoins.toLocaleString();
    document.getElementById('nextMilestone').textContent = nextMilestone.toLocaleString();
    document.getElementById('progressPercent').textContent = Math.round(progress) + '%';
    document.getElementById('progressBar').style.width = Math.min(progress, 100) + '%';
    document.getElementById('progressBar').textContent = Math.round(progress) + '%';
}

// Update file preview
function updateFilePreview(type, path) {
    const preview = document.getElementById(`${type}Preview`);
    const deleteBtn = document.getElementById(`delete${type.charAt(0).toUpperCase() + type.slice(1)}`);

    if (path) {
        preview.textContent = `✅ ${path.split('/').pop()}`;
        preview.style.display = 'block';
        deleteBtn.style.display = 'inline-block';
    } else {
        preview.style.display = 'none';
        deleteBtn.style.display = 'none';
    }
}

// Toggle enable/disable
document.getElementById('enableToggle').addEventListener('change', async (e) => {
    const enabled = e.target.checked;
    try {
        const response = await fetch('/api/gift-milestone/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled })
        });
        const data = await response.json();
        if (data.success) {
            document.getElementById('statusText').textContent = enabled ? 'Aktiviert' : 'Deaktiviert';
            showNotification(data.message);
        }
    } catch (error) {
        console.error('Error toggling milestone:', error);
        showNotification('Fehler beim Umschalten', 'error');
    }
});

// File upload handlers
['gif', 'video', 'audio'].forEach(type => {
    document.getElementById(`${type}Input`).addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append(type, file);

        try {
            const response = await fetch(`/api/gift-milestone/upload/${type}`, {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            if (data.success) {
                updateFilePreview(type, data.url);
                showNotification(`${type.toUpperCase()} erfolgreich hochgeladen`);
            } else {
                showNotification(data.error, 'error');
            }
        } catch (error) {
            console.error(`Error uploading ${type}:`, error);
            showNotification(`Fehler beim Hochladen von ${type}`, 'error');
        }

        e.target.value = '';
    });

    // Delete handlers
    document.getElementById(`delete${type.charAt(0).toUpperCase() + type.slice(1)}`).addEventListener('click', async () => {
        if (!confirm(`${type.toUpperCase()} wirklich löschen?`)) return;

        try {
            const response = await fetch(`/api/gift-milestone/media/${type}`, {
                method: 'DELETE'
            });
            const data = await response.json();
            if (data.success) {
                updateFilePreview(type, null);
                showNotification(`${type.toUpperCase()} gelöscht`);
            }
        } catch (error) {
            console.error(`Error deleting ${type}:`, error);
            showNotification(`Fehler beim Löschen von ${type}`, 'error');
        }
    });
});

// Save configuration
document.getElementById('saveButton').addEventListener('click', async () => {
    const config = {
        enabled: document.getElementById('enableToggle').checked,
        threshold: parseInt(document.getElementById('threshold').value),
        increment_step: parseInt(document.getElementById('incrementStep').value),
        mode: document.getElementById('mode').value,
        playback_mode: document.getElementById('playbackMode').value,
        audio_volume: parseInt(document.getElementById('audioVolume').value),
        animation_duration: parseInt(document.getElementById('animationDuration').value),
        session_reset: document.getElementById('sessionReset').checked
    };

    try {
        const response = await fetch('/api/gift-milestone/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        const data = await response.json();
        if (data.success) {
            showNotification('Konfiguration gespeichert!');
            loadStats();
        } else {
            showNotification(data.error, 'error');
        }
    } catch (error) {
        console.error('Error saving config:', error);
        showNotification('Fehler beim Speichern', 'error');
    }
});

// Test button
document.getElementById('testButton').addEventListener('click', async () => {
    try {
        const response = await fetch('/api/gift-milestone/test', {
            method: 'POST'
        });
        const data = await response.json();
        if (data.success) {
            showNotification('Test-Celebration ausgelöst!');
        } else {
            showNotification(data.error, 'error');
        }
    } catch (error) {
        console.error('Error testing milestone:', error);
        showNotification('Fehler beim Testen', 'error');
    }
});

// Reset button
document.getElementById('resetButton').addEventListener('click', async () => {
    if (!confirm('Statistiken wirklich zurücksetzen? Dies kann nicht rückgängig gemacht werden!')) {
        return;
    }

    try {
        const response = await fetch('/api/gift-milestone/reset', {
            method: 'POST'
        });
        const data = await response.json();
        if (data.success) {
            showNotification('Statistiken zurückgesetzt!');
            loadStats();
        } else {
            showNotification(data.error, 'error');
        }
    } catch (error) {
        console.error('Error resetting stats:', error);
        showNotification('Fehler beim Zurücksetzen', 'error');
    }
});

// Socket.io listeners for real-time updates
socket.on('milestone:stats-update', (data) => {
    loadStats();
});

socket.on('milestone:config-update', (data) => {
    loadConfig();
});

// Show notification
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = 'notification ' + type;
    notification.style.display = 'block';

    setTimeout(() => {
        notification.style.display = 'none';
    }, 3000);
}

// Initialize
// Set up event listeners for file upload buttons
document.getElementById('select-gif-btn').addEventListener('click', () => {
    document.getElementById('gifInput').click();
});
document.getElementById('select-video-btn').addEventListener('click', () => {
    document.getElementById('videoInput').click();
});
document.getElementById('select-audio-btn').addEventListener('click', () => {
    document.getElementById('audioInput').click();
});

loadConfig();
loadStats();
setInterval(loadStats, 5000); // Update stats every 5 seconds
