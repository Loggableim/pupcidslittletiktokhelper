/**
 * Plugin Manager - Frontend-Logik für Plugin-Verwaltung
 */

class PluginManager {
    constructor() {
        this.plugins = [];
        this.init();
    }

    init() {
        // Event-Listener registrieren
        const uploadBtn = document.getElementById('upload-plugin-btn');
        const fileInput = document.getElementById('plugin-file-input');
        const reloadBtn = document.getElementById('reload-plugins-btn');

        if (uploadBtn) {
            uploadBtn.addEventListener('click', () => {
                fileInput.click();
            });
        }

        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                this.handleFileUpload(e.target.files[0]);
            });
        }

        if (reloadBtn) {
            reloadBtn.addEventListener('click', () => {
                this.reloadAllPlugins();
            });
        }

        // Plugins laden beim Tab-Wechsel
        const pluginsTab = document.querySelector('[data-tab="plugins"]');
        if (pluginsTab) {
            pluginsTab.addEventListener('click', () => {
                this.loadPlugins();
            });
        }
    }

    /**
     * Lädt alle Plugins vom Server
     */
    async loadPlugins() {
        try {
            const response = await fetch('/api/plugins');
            const data = await response.json();

            if (data.success) {
                this.plugins = data.plugins;
                this.renderPlugins();
            } else {
                this.showError('Fehler beim Laden der Plugins: ' + data.error);
            }
        } catch (error) {
            console.error('Error loading plugins:', error);
            this.showError('Fehler beim Laden der Plugins: ' + error.message);
        }
    }

    /**
     * Rendert die Plugin-Liste
     */
    renderPlugins() {
        const container = document.getElementById('plugins-container');
        if (!container) return;

        if (this.plugins.length === 0) {
            container.innerHTML = `
                <div class="text-center text-gray-400 py-8">
                    <p>Keine Plugins gefunden.</p>
                    <p class="text-sm mt-2">Lade ein Plugin hoch, um zu beginnen.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.plugins.map(plugin => this.renderPlugin(plugin)).join('');

        // Event-Listener für Buttons
        this.plugins.forEach(plugin => {
            const enableBtn = document.getElementById(`enable-${plugin.id}`);
            const disableBtn = document.getElementById(`disable-${plugin.id}`);
            const reloadBtn = document.getElementById(`reload-${plugin.id}`);
            const deleteBtn = document.getElementById(`delete-${plugin.id}`);

            if (enableBtn) {
                enableBtn.addEventListener('click', () => this.enablePlugin(plugin.id));
            }
            if (disableBtn) {
                disableBtn.addEventListener('click', () => this.disablePlugin(plugin.id));
            }
            if (reloadBtn) {
                reloadBtn.addEventListener('click', () => this.reloadPlugin(plugin.id));
            }
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => this.deletePlugin(plugin.id));
            }
        });
    }

    /**
     * Rendert ein einzelnes Plugin
     */
    renderPlugin(plugin) {
        const statusBadge = plugin.enabled
            ? '<span class="px-2 py-1 text-xs bg-green-600 rounded">Aktiv</span>'
            : '<span class="px-2 py-1 text-xs bg-gray-600 rounded">Inaktiv</span>';

        const actionButtons = plugin.enabled
            ? `
                <button id="reload-${plugin.id}" class="px-3 py-1 text-sm bg-blue-600 rounded hover:bg-blue-700">
                    🔄 Reload
                </button>
                <button id="disable-${plugin.id}" class="px-3 py-1 text-sm bg-yellow-600 rounded hover:bg-yellow-700">
                    ⏸️ Deaktivieren
                </button>
            `
            : `
                <button id="enable-${plugin.id}" class="px-3 py-1 text-sm bg-green-600 rounded hover:bg-green-700">
                    ▶️ Aktivieren
                </button>
            `;

        return `
            <div class="bg-gray-700 rounded-lg p-4">
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <div class="flex items-center gap-3 mb-2">
                            <h3 class="text-lg font-semibold">${this.escapeHtml(plugin.name)}</h3>
                            ${statusBadge}
                            <span class="text-xs text-gray-400">v${this.escapeHtml(plugin.version)}</span>
                        </div>
                        <p class="text-sm text-gray-300 mb-2">${this.escapeHtml(plugin.description || 'Keine Beschreibung')}</p>
                        <div class="flex gap-4 text-xs text-gray-400">
                            <span>📦 ID: ${this.escapeHtml(plugin.id)}</span>
                            <span>👤 Autor: ${this.escapeHtml(plugin.author || 'Unbekannt')}</span>
                            ${plugin.type ? `<span>🏷️ Typ: ${this.escapeHtml(plugin.type)}</span>` : ''}
                        </div>
                        ${plugin.loadedAt ? `<div class="text-xs text-gray-500 mt-1">Geladen: ${new Date(plugin.loadedAt).toLocaleString()}</div>` : ''}
                    </div>
                    <div class="flex flex-col gap-2 ml-4">
                        ${actionButtons}
                        <button id="delete-${plugin.id}" class="px-3 py-1 text-sm bg-red-600 rounded hover:bg-red-700">
                            🗑️ Löschen
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Aktiviert ein Plugin
     */
    async enablePlugin(pluginId) {
        try {
            const response = await fetch(`/api/plugins/${pluginId}/enable`, {
                method: 'POST'
            });
            const data = await response.json();

            if (data.success) {
                this.showSuccess(`Plugin ${pluginId} aktiviert`);
                await this.loadPlugins();
            } else {
                this.showError('Fehler: ' + data.error);
            }
        } catch (error) {
            console.error('Error enabling plugin:', error);
            this.showError('Fehler beim Aktivieren: ' + error.message);
        }
    }

    /**
     * Deaktiviert ein Plugin
     */
    async disablePlugin(pluginId) {
        try {
            const response = await fetch(`/api/plugins/${pluginId}/disable`, {
                method: 'POST'
            });
            const data = await response.json();

            if (data.success) {
                this.showSuccess(`Plugin ${pluginId} deaktiviert`);
                await this.loadPlugins();
            } else {
                this.showError('Fehler: ' + data.error);
            }
        } catch (error) {
            console.error('Error disabling plugin:', error);
            this.showError('Fehler beim Deaktivieren: ' + error.message);
        }
    }

    /**
     * Lädt ein Plugin neu
     */
    async reloadPlugin(pluginId) {
        try {
            const response = await fetch(`/api/plugins/${pluginId}/reload`, {
                method: 'POST'
            });
            const data = await response.json();

            if (data.success) {
                this.showSuccess(`Plugin ${pluginId} neu geladen`);
                await this.loadPlugins();
            } else {
                this.showError('Fehler: ' + data.error);
            }
        } catch (error) {
            console.error('Error reloading plugin:', error);
            this.showError('Fehler beim Neuladen: ' + error.message);
        }
    }

    /**
     * Löscht ein Plugin
     */
    async deletePlugin(pluginId) {
        if (!confirm(`Plugin "${pluginId}" wirklich löschen?`)) {
            return;
        }

        try {
            const response = await fetch(`/api/plugins/${pluginId}`, {
                method: 'DELETE'
            });
            const data = await response.json();

            if (data.success) {
                this.showSuccess(`Plugin ${pluginId} gelöscht`);
                await this.loadPlugins();
            } else {
                this.showError('Fehler: ' + data.error);
            }
        } catch (error) {
            console.error('Error deleting plugin:', error);
            this.showError('Fehler beim Löschen: ' + error.message);
        }
    }

    /**
     * Lädt alle Plugins neu
     */
    async reloadAllPlugins() {
        if (!confirm('Alle Plugins neu laden?')) {
            return;
        }

        try {
            const response = await fetch('/api/plugins/reload', {
                method: 'POST'
            });
            const data = await response.json();

            if (data.success) {
                this.showSuccess('Alle Plugins neu geladen');
                await this.loadPlugins();
            } else {
                this.showError('Fehler: ' + data.error);
            }
        } catch (error) {
            console.error('Error reloading plugins:', error);
            this.showError('Fehler beim Neuladen: ' + error.message);
        }
    }

    /**
     * Behandelt Plugin-Upload
     */
    async handleFileUpload(file) {
        if (!file) return;

        if (!file.name.endsWith('.zip')) {
            this.showError('Bitte wähle eine ZIP-Datei aus');
            return;
        }

        const formData = new FormData();
        formData.append('plugin', file);

        try {
            this.showInfo('Plugin wird hochgeladen...');

            const response = await fetch('/api/plugins/upload', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();

            if (data.success) {
                this.showSuccess(`Plugin "${data.plugin.name}" erfolgreich hochgeladen und geladen`);
                await this.loadPlugins();
            } else {
                this.showError('Fehler beim Hochladen: ' + data.error);
            }
        } catch (error) {
            console.error('Error uploading plugin:', error);
            this.showError('Fehler beim Hochladen: ' + error.message);
        } finally {
            // Input zurücksetzen
            document.getElementById('plugin-file-input').value = '';
        }
    }

    /**
     * Hilfsfunktionen für Benachrichtigungen
     */
    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showInfo(message) {
        this.showNotification(message, 'info');
    }

    showNotification(message, type = 'info') {
        // Einfache Notification (kann später mit besserer UI ersetzt werden)
        const colors = {
            success: 'bg-green-600',
            error: 'bg-red-600',
            info: 'bg-blue-600'
        };

        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 ${colors[type]} text-white px-6 py-3 rounded-lg shadow-lg z-50`;
        notification.textContent = message;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    /**
     * HTML-Escaping
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Plugin Manager initialisieren, wenn DOM geladen ist
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.pluginManager = new PluginManager();
    });
} else {
    window.pluginManager = new PluginManager();
}
