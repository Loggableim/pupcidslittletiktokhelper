document.addEventListener('DOMContentLoaded', () => {
    const adminPanel = document.getElementById('admin-panel');
    const ttsContainer = document.getElementById('tts-container');
    const volumeSlider = document.getElementById('volume');
    const rateSlider = document.getElementById('rate');
    const pitchSlider = document.getElementById('pitch');
    const voiceSelect = document.getElementById('voice');
    const testText = document.getElementById('test-text');
    const testButton = document.getElementById('test-button');
    const skipButton = document.getElementById('skip-button');
    const pauseButton = document.getElementById('pause-button');
    const resumeButton = document.getElementById('resume-button');
    const clearButton = document.getElementById('clear-button');

    const queue = [];
    let isSpeaking = false;
    let isPaused = false;
    let currentUtterance = null;
    let voices = [];
    let settings = {
        volume: 1,
        rate: 1,
        pitch: 1,
        voice: null
    };

    function loadVoices() {
        voices = window.speechSynthesis.getVoices();
        voiceSelect.innerHTML = voices
            .map((voice, index) => `<option value="${index}">${voice.name} (${voice.lang})</option>`)
            .join('');
        if (settings.voice) {
            const voiceIndex = voices.findIndex(v => v.name === settings.voice.name && v.lang === settings.voice.lang);
            if (voiceIndex > -1) {
                voiceSelect.value = voiceIndex;
            }
        }
    }

    function processQueue() {
        if (isSpeaking || isPaused || queue.length === 0) {
            return;
        }
        isSpeaking = true;
        const { text, user } = queue.shift();
        displayTts(user, text);
        speak(text);
    }

    function speak(text) {
        if (text) {
            const utterance = new SpeechSynthesisUtterance(text);
            currentUtterance = utterance;
            utterance.volume = settings.volume;
            utterance.rate = settings.rate;
            utterance.pitch = settings.pitch;
            if (settings.voice) {
                utterance.voice = settings.voice;
            }
            utterance.onend = () => {
                isSpeaking = false;
                currentUtterance = null;
                hideTts();
                processQueue();
            };
            utterance.onerror = (event) => {
                console.error('SpeechSynthesisUtterance.onerror', event);
                isSpeaking = false;
                currentUtterance = null;
                hideTts();
                processQueue();
            };
            window.speechSynthesis.speak(utterance);
        } else {
            isSpeaking = false;
            processQueue();
        }
    }

    function displayTts(user, text) {
        ttsContainer.innerHTML = `<p><strong>${user}:</strong> ${text}</p>`;
        ttsContainer.style.display = 'block';
    }

    function hideTts() {
        ttsContainer.style.display = 'none';
    }

    function connect() {
        const urlParams = new URLSearchParams(window.location.search);
        const isAdmin = urlParams.get('admin') === 'true';

        if (isAdmin) {
            adminPanel.style.display = 'block';
            loadSettings();
            if (window.speechSynthesis.onvoiceschanged !== undefined) {
                window.speechSynthesis.onvoiceschanged = loadVoices;
            }
            loadVoices();
        }

        const ws = new WebSocket('ws://localhost:8080');

        ws.onopen = () => console.log('WebSocket connected');
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'tts') {
                queue.push(data.payload);
                processQueue();
            }
        };
        ws.onclose = () => {
            console.log('WebSocket disconnected, attempting to reconnect...');
            setTimeout(connect, 2000);
        };
        ws.onerror = (error) => console.error('WebSocket error:', error);
    }

    function updateSetting(key, value, isVoice = false) {
        if (isVoice) {
            settings[key] = voices[value] || null;
        } else {
            settings[key] = parseFloat(value);
        }
        saveSettings();
    }

    function saveSettings() {
        const voiceData = settings.voice ? { name: settings.voice.name, lang: settings.voice.lang } : null;
        const settingsToSave = { ...settings, voice: voiceData };
        localStorage.setItem('ttsSettings', JSON.stringify(settingsToSave));
    }

    function loadSettings() {
        const savedSettings = localStorage.getItem('ttsSettings');
        if (savedSettings) {
            const parsed = JSON.parse(savedSettings);
            settings.volume = parsed.volume || 1;
            settings.rate = parsed.rate || 1;
            settings.pitch = parsed.pitch || 1;
            settings.voice = parsed.voice || null;

            volumeSlider.value = settings.volume;
            rateSlider.value = settings.rate;
            pitchSlider.value = settings.pitch;
        }
    }

    // Event Listeners
    volumeSlider.addEventListener('input', (e) => updateSetting('volume', e.target.value));
    rateSlider.addEventListener('input', (e) => updateSetting('rate', e.target.value));
    pitchSlider.addEventListener('input', (e) => updateSetting('pitch', e.target.value));
    voiceSelect.addEventListener('change', (e) => updateSetting('voice', e.target.value, true));

    testButton.addEventListener('click', () => {
        const text = testText.value;
        if (text) {
            speak(text);
        }
    });

    skipButton.addEventListener('click', () => {
        if (isSpeaking && currentUtterance) {
            window.speechSynthesis.cancel();
        }
    });

    pauseButton.addEventListener('click', () => {
        if (isSpeaking && !isPaused) {
            isPaused = true;
            window.speechSynthesis.pause();
        }
    });

    resumeButton.addEventListener('click', () => {
        if (isPaused) {
            isPaused = false;
            window.speechSynthesis.resume();
        }
    });

    clearButton.addEventListener('click', () => {
        queue.length = 0;
        if (isSpeaking) {
            window.speechSynthesis.cancel();
        }
    });

    // Initial connection
    connect();
});