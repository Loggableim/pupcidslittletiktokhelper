// ========== AUDIO ENGINE SETTINGS ==========

// Master Volume Control
const masterVolumeSlider = document.getElementById('master-volume');
const masterVolumeLabel = document.getElementById('master-volume-label');

if (masterVolumeSlider) {
    // Load saved master volume
    const savedVolume = localStorage.getItem('master-volume') || '100';
    masterVolumeSlider.value = savedVolume;
    masterVolumeLabel.textContent = savedVolume;

    masterVolumeSlider.addEventListener('input', (e) => {
        const volume = e.target.value;
        masterVolumeLabel.textContent = volume;
        localStorage.setItem('master-volume', volume);

        // Sende an Overlay
        socket.emit('audio:master-volume', { volume: parseFloat(volume) / 100 });
        console.log(`Master volume set to ${volume}%`);
    });
}

// Audio Output Device Selection
async function loadAudioDevices() {
    const select = document.getElementById('audio-output-device');
    if (!select) return;

    try {
        // Enumerate audio output devices (nur in Chromium/OBS)
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
            console.warn('enumerateDevices() not supported');
            return;
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioOutputs = devices.filter(device => device.kind === 'audiooutput');

        // Clear existing options (except default)
        select.innerHTML = '<option value="default">Standard-Ausgabegerät</option>';

        // Add audio output devices
        audioOutputs.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `Audio Output ${select.options.length}`;
            select.appendChild(option);
        });

        // Load saved device
        const savedDevice = localStorage.getItem('audio-output-device');
        if (savedDevice) {
            select.value = savedDevice;
        }

        // Device change handler
        select.addEventListener('change', (e) => {
            const deviceId = e.target.value;
            localStorage.setItem('audio-output-device', deviceId);

            // Sende an Overlay
            socket.emit('audio:set-output-device', { deviceId });
            console.log(`Audio output device changed to: ${deviceId}`);
        });

    } catch (error) {
        console.error('Error loading audio devices:', error);
    }
}

// Load audio devices when Settings tab is opened
document.querySelector('[data-tab="settings"]')?.addEventListener('click', () => {
    loadAudioDevices();
    updateAudioStatus();
});

// Audio Status updaten
function updateAudioStatus() {
    // Anfrage an Overlay für aktuellen Status
    socket.emit('audio:get-status');
}

// Audio Status vom Overlay empfangen
socket.on('audio:status', (status) => {
    const statusEl = document.getElementById('audio-status');
    const samplerateEl = document.getElementById('audio-samplerate');
    const latencyEl = document.getElementById('audio-latency');

    if (statusEl) {
        statusEl.textContent = status.state === 'running' ? '✅ Aktiv' : '⚠️ Pausiert';
        statusEl.className = status.state === 'running' ? 'font-semibold text-green-400' : 'font-semibold text-yellow-400';
    }

    if (samplerateEl) {
        samplerateEl.textContent = status.sampleRate ? `${status.sampleRate} Hz` : '-';
    }

    if (latencyEl) {
        latencyEl.textContent = status.latency ? `${(status.latency * 1000).toFixed(1)} ms` : '-';
    }
});

// Audio Test Button
const testAudioBtn = document.getElementById('test-audio-btn');
if (testAudioBtn) {
    testAudioBtn.addEventListener('click', () => {
        // Spiele Test-Ton ab (440 Hz Sinuswelle für 0.5s)
        socket.emit('audio:test');
        console.log('Playing test audio...');

        // Visual Feedback
        testAudioBtn.disabled = true;
        testAudioBtn.textContent = '🎵 Spielt ab...';

        setTimeout(() => {
            testAudioBtn.disabled = false;
            testAudioBtn.textContent = '🎵 Test Audio abspielen';
        }, 1000);
    });
}

console.log('🎵 Audio Engine Settings initialized');
