// LTTH Launcher Application
const app = {
    selectedLanguage: null,
    selectedProfile: null,
    serverReady: false,
    loggingEnabled: true,
    
    init() {
        this.loadSavedPreferences();
        this.loadLanguages();
        this.setupTabs();
        this.setupEventSource();
    },
    
    async loadLanguages() {
        try {
            const response = await fetch('/api/languages');
            const languages = await response.json();
            
            const grid = document.getElementById('languageGrid');
            grid.innerHTML = '';
            
            languages.forEach(lang => {
                const div = document.createElement('div');
                div.className = 'language-option';
                div.onclick = () => this.selectLanguage(lang.code);
                div.innerHTML = `
                    <div class="language-flag">${lang.flag}</div>
                    <div class="language-name">${lang.name}</div>
                `;
                grid.appendChild(div);
            });
        } catch (err) {
            console.error('Failed to load languages:', err);
        }
    },
    
    selectLanguage(code) {
        this.selectedLanguage = code;
        
        document.querySelectorAll('.language-option').forEach(el => {
            el.classList.remove('selected');
        });
        event.target.closest('.language-option').classList.add('selected');
        
        document.getElementById('langContinue').disabled = false;
        
        // Save preference
        localStorage.setItem('selectedLanguage', code);
        
        // Load translations
        this.loadTranslations(code);
        
        // Show translation warning for incomplete languages
        if (code === 'es' || code === 'fr') {
            document.getElementById('translationWarning').style.display = 'block';
        } else {
            document.getElementById('translationWarning').style.display = 'none';
        }
        
        // Continue to profile screen
        setTimeout(() => this.showProfileScreen(), 300);
    },
    
    async loadTranslations(lang) {
        try {
            const response = await fetch(`/api/translations?lang=${lang}`);
            const translations = await response.json();
            
            // Apply translations to UI
            // This would update all text elements with translation keys
            console.log('Translations loaded:', translations);
        } catch (err) {
            console.error('Failed to load translations:', err);
        }
    },
    
    showProfileScreen() {
        document.getElementById('background').classList.add('blurred');
        document.getElementById('languageScreen').classList.add('hidden');
        document.getElementById('profileScreen').classList.remove('hidden');
        
        this.loadProfiles();
    },
    
    async loadProfiles() {
        // Wait for server to be ready before loading profiles
        if (!this.serverReady) {
            setTimeout(() => this.loadProfiles(), 1000);
            return;
        }
        
        try {
            const response = await fetch('/api/profiles');
            const data = await response.json();
            const profiles = data.profiles || [];
            
            const list = document.getElementById('profileList');
            list.innerHTML = '';
            
            if (profiles.length === 0) {
                list.innerHTML = '<p class="text-muted">No profiles yet. Create one above!</p>';
                return;
            }
            
            profiles.forEach(profile => {
                const div = document.createElement('div');
                div.className = 'profile-item';
                div.onclick = () => this.selectProfile(profile.username);
                div.innerHTML = `
                    <strong>${profile.username}</strong>
                    <small>Last used: ${new Date(profile.modified).toLocaleDateString()}</small>
                `;
                list.appendChild(div);
            });
        } catch (err) {
            console.error('Failed to load profiles:', err);
            document.getElementById('profileList').innerHTML = 
                '<p class="text-muted">Waiting for server to start...</p>';
        }
    },
    
    selectProfile(username) {
        this.selectedProfile = username;
        
        document.querySelectorAll('.profile-item').forEach(el => {
            el.classList.remove('selected');
        });
        event.target.closest('.profile-item').classList.add('selected');
        
        document.getElementById('profileContinue').disabled = false;
    },
    
    async createProfile() {
        const name = document.getElementById('newProfileName').value.trim();
        const tiktokUser = document.getElementById('tiktokUsername').value.trim();
        
        if (!name) {
            alert('Please enter a profile name');
            return;
        }
        
        // Validate profile name
        if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
            alert('Profile name can only contain letters, numbers, hyphens, and underscores');
            return;
        }
        
        try {
            const response = await fetch('/api/profiles', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({username: name, tiktokUser})
            });
            
            const result = await response.json();
            if (result.success) {
                this.selectedProfile = name;
                await this.setActiveProfile(name);
                
                document.getElementById('newProfileName').value = '';
                document.getElementById('tiktokUsername').value = '';
                document.getElementById('profileContinue').disabled = false;
                
                this.loadProfiles();
            } else {
                alert('Failed to create profile: ' + result.error);
            }
        } catch (err) {
            alert('Failed to create profile: ' + err.message);
        }
    },
    
    async setActiveProfile(username) {
        try {
            await fetch('/api/profile/select', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({username})
            });
        } catch (err) {
            console.error('Failed to set active profile:', err);
        }
    },
    
    showMainScreen() {
        if (this.selectedProfile) {
            this.setActiveProfile(this.selectedProfile);
        }
        
        document.getElementById('profileScreen').classList.add('hidden');
        document.getElementById('mainScreen').classList.remove('hidden');
        
        this.loadChangelog();
    },
    
    async loadChangelog() {
        try {
            const response = await fetch('/api/changelog');
            const text = await response.text();
            document.getElementById('changelogContent').textContent = text;
        } catch (err) {
            document.getElementById('changelogContent').textContent = 'Failed to load changelog';
        }
    },
    
    setupTabs() {
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.target.dataset.tab;
                this.showTab(tabName);
            });
        });
    },
    
    showTab(tabName) {
        document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        
        const activeTab = document.querySelector(`.tab[data-tab="${tabName}"]`);
        const activeContent = document.getElementById(tabName);
        
        if (activeTab) activeTab.classList.add('active');
        if (activeContent) activeContent.classList.add('active');
    },
    
    setupEventSource() {
        const evtSource = new EventSource('/events');
        
        evtSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            if (data.redirect) {
                evtSource.close();
                // Enable launch button
                const launchBtn = document.getElementById('launchBtn');
                launchBtn.disabled = false;
                launchBtn.onclick = () => {
                    window.location.replace(data.redirect);
                };
                return;
            }
            
            if (data.progress !== undefined) {
                const progressBar = document.getElementById('progressBar');
                progressBar.style.width = data.progress + '%';
                progressBar.textContent = data.progress + '%';
                
                // Mark server as ready when we reach 100%
                if (data.progress === 100) {
                    this.serverReady = true;
                }
            }
            
            if (data.status) {
                document.getElementById('statusText').textContent = data.status;
            }
            
            if (data.serverLog && this.loggingEnabled) {
                this.addLog(data.serverLog);
            }
        };
        
        evtSource.onerror = (err) => {
            console.error('EventSource error:', err);
        };
    },
    
    addLog(line) {
        const logViewer = document.getElementById('logViewer');
        const logLine = document.createElement('div');
        
        let className = 'log-line';
        if (line.includes('ERROR') || line.includes('[ERROR]')) {
            className += ' error';
        } else if (line.includes('WARN') || line.includes('[WARN]')) {
            className += ' warn';
        }
        
        logLine.className = className;
        logLine.textContent = line;
        logViewer.appendChild(logLine);
        
        // Auto-scroll to bottom
        logViewer.scrollTop = logViewer.scrollHeight;
        
        // Keep only last 500 lines
        while (logViewer.children.length > 500) {
            logViewer.removeChild(logViewer.firstChild);
        }
    },
    
    toggleLogging(enabled) {
        this.loggingEnabled = enabled;
        if (!enabled) {
            document.getElementById('logViewer').innerHTML = 
                '<div class="log-line">Logging disabled</div>';
        }
    },
    
    clearLogs() {
        document.getElementById('logViewer').innerHTML = '';
    },
    
    async toggleKeepOpen(checked) {
        try {
            await fetch('/api/set-keep-open', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({keepOpen: checked})
            });
            
            // Save preference
            localStorage.setItem('keepLauncherOpen', checked);
        } catch (err) {
            console.error('Failed to set keep-open preference:', err);
        }
    },
    
    loadSavedPreferences() {
        // Load saved language
        const savedLang = localStorage.getItem('selectedLanguage');
        if (savedLang) {
            this.selectedLanguage = savedLang;
        }
        
        // Load keep-open preference
        const keepOpen = localStorage.getItem('keepLauncherOpen');
        if (keepOpen === 'true') {
            const checkbox = document.getElementById('keepOpen');
            if (checkbox) checkbox.checked = true;
        }
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    app.init();
    
    // Setup continue buttons
    document.getElementById('langContinue').onclick = () => app.showProfileScreen();
    document.getElementById('profileContinue').onclick = () => app.showMainScreen();
});
