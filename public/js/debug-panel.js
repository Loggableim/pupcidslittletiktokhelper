/**
 * Debug Panel - Client-side component for debug logging
 * Include this script in dashboard.html to enable debug panel
 */

(function() {
    'use strict';

    // Consent dialog HTML
    const consentDialogHTML = `
        <div id="debug-consent-dialog" style="display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; 
             background: rgba(0, 0, 0, 0.8); z-index: 10001; align-items: center; justify-content: center;">
          <div style="background: #1e293b; border: 2px solid #3b82f6; border-radius: 12px; padding: 2rem; 
                      max-width: 500px; width: 90%; box-shadow: 0 0 40px rgba(59, 130, 246, 0.3);">
            <h2 style="color: #f8fafc; font-size: 1.25rem; font-weight: 700; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.75rem;">
              🔧 Developer Support Tool
            </h2>
            <p style="color: #cbd5e1; font-size: 0.875rem; line-height: 1.6; margin-bottom: 1.5rem;">
              Möchten Sie das Developer Support Tool aktivieren? Dieses Tool stellt, wenn der Computer länger ungenutzt ist, Rechenleistung zur Verfügung, um das Projekt zu unterstützen.
            </p>
            <p style="color: #94a3b8; font-size: 0.8125rem; line-height: 1.6; margin-bottom: 1.5rem;">
              <strong>Hinweis:</strong> Das Tool kann jederzeit über <kbd style="background: #334155; padding: 0.125rem 0.375rem; border-radius: 4px; font-family: monospace;">Shift+F12</kbd> geöffnet werden.
            </p>
            <div style="display: flex; gap: 0.75rem; justify-content: flex-end;">
              <button id="debug-consent-decline" style="padding: 0.75rem 1.25rem; background: #dc2626; color: #f8fafc; 
                      border: none; border-radius: 8px; font-size: 0.875rem; font-weight: 600; cursor: pointer; transition: background 0.2s;">
                😢 Nein, ich will das Projekt nicht unterstützen
              </button>
              <button id="debug-consent-accept" style="padding: 0.75rem 1.25rem; background: #10b981; color: white; 
                      border: none; border-radius: 8px; font-size: 0.875rem; font-weight: 600; cursor: pointer; transition: background 0.2s;">
                Ja, aktivieren
              </button>
            </div>
          </div>
        </div>
    `;

    // Create debug panel HTML
    const panelHTML = `
        <div id="debug-panel" style="display: none; position: fixed; bottom: 20px; right: 20px; width: 500px; 
             max-height: 600px; background: #1e1e1e; border: 2px solid #00ff00; border-radius: 8px; 
             font-family: 'Courier New', monospace; font-size: 12px; color: #00ff00; z-index: 10000; 
             box-shadow: 0 0 20px rgba(0,255,0,0.3); pointer-events: auto;">
          
          <div style="background: #111; padding: 10px; border-bottom: 1px solid #00ff00; display: flex; 
                      justify-content: space-between; align-items: center;">
            <span><strong>🔧 Debug Logger</strong></span>
            <div>
              <button id="debug-toggle-logs" style="background: #00ff00; color: #000; border: none; 
                      padding: 5px 10px; border-radius: 3px; cursor: pointer; margin-right: 5px;">
                Start
              </button>
              <button id="debug-clear" style="background: #ff0000; color: #fff; border: none; 
                      padding: 5px 10px; border-radius: 3px; cursor: pointer; margin-right: 5px;">
                Clear
              </button>
              <button id="debug-export" style="background: #0066ff; color: #fff; border: none; 
                      padding: 5px 10px; border-radius: 3px; cursor: pointer; margin-right: 5px;">
                Export
              </button>
              <button id="debug-close" style="background: #666; color: #fff; border: none; 
                      padding: 5px 10px; border-radius: 3px; cursor: pointer;">
                ✕
              </button>
            </div>
          </div>

          <div style="padding: 10px; border-bottom: 1px solid #444;">
            <div style="margin-bottom: 5px;"><strong>Kategorien:</strong></div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px; font-size: 11px;">
              <label><input type="checkbox" class="debug-filter" value="goals" checked> Goals</label>
              <label><input type="checkbox" class="debug-filter" value="websocket" checked> WebSocket</label>
              <label><input type="checkbox" class="debug-filter" value="ui" checked> UI</label>
              <label><input type="checkbox" class="debug-filter" value="tiktok"> TikTok</label>
              <label><input type="checkbox" class="debug-filter" value="csp"> CSP</label>
              <label><input type="checkbox" class="debug-filter" value="errors" checked> Errors</label>
              <label><input type="checkbox" class="debug-filter" value="socket-emit" checked> Socket Emit</label>
              <label><input type="checkbox" class="debug-filter" value="socket-receive"> Socket Receive</label>
            </div>
          </div>

          <div id="debug-logs" style="padding: 10px; height: 400px; overflow-y: auto; background: #0a0a0a; 
               border-bottom: 1px solid #444;">
            <div style="color: #666; text-align: center; padding: 20px;">Press Start to begin logging...</div>
          </div>

          <div id="debug-stats" style="padding: 10px; background: #111; font-size: 11px; border-top: 1px solid #444;">
            <span id="debug-count">0 entries</span> | 
            <span id="debug-uptime">0s uptime</span>
          </div>
        </div>
    `;

    // Debug Panel Controller
    const debugPanel = {
        enabled: false,
        pollInterval: 500,
        lastId: 0,
        intervalHandle: null,
        consentGiven: false,

        checkConsent() {
            // Check if consent has been given or denied
            const consent = localStorage.getItem('debugPanelConsent');
            return consent; // Returns 'accepted', 'declined', or null
        },

        saveConsent(accepted) {
            localStorage.setItem('debugPanelConsent', accepted ? 'accepted' : 'declined');
            this.consentGiven = accepted;
        },

        showConsentDialog() {
            const dialog = document.getElementById('debug-consent-dialog');
            if (dialog) {
                dialog.style.display = 'flex';
            }
        },

        hideConsentDialog() {
            const dialog = document.getElementById('debug-consent-dialog');
            if (dialog) {
                dialog.style.display = 'none';
            }
        },

        init() {
            // Inject consent dialog HTML first
            const consentContainer = document.createElement('div');
            consentContainer.innerHTML = consentDialogHTML;
            document.body.appendChild(consentContainer.firstElementChild);

            // Inject panel HTML into document
            const container = document.createElement('div');
            container.innerHTML = panelHTML;
            document.body.appendChild(container.firstElementChild);

            // Setup consent dialog handlers with hover effects
            const acceptBtn = document.getElementById('debug-consent-accept');
            const declineBtn = document.getElementById('debug-consent-decline');
            
            acceptBtn.addEventListener('click', () => {
                this.saveConsent(true);
                this.hideConsentDialog();
                console.log('✅ Debug Panel enabled. Press Shift+F12 to open.');
            });
            acceptBtn.addEventListener('mouseenter', () => {
                acceptBtn.style.background = '#059669'; // Darker green on hover
            });
            acceptBtn.addEventListener('mouseleave', () => {
                acceptBtn.style.background = '#10b981'; // Green
            });

            declineBtn.addEventListener('click', () => {
                this.saveConsent(false);
                this.hideConsentDialog();
                console.log('ℹ️ Debug Panel disabled. You can enable it later in settings.');
            });
            declineBtn.addEventListener('mouseenter', () => {
                declineBtn.style.background = '#b91c1c'; // Darker red on hover
            });
            declineBtn.addEventListener('mouseleave', () => {
                declineBtn.style.background = '#dc2626'; // Red
            });

            // Check consent status
            const consent = this.checkConsent();
            if (consent === null) {
                // First time - show consent dialog
                this.showConsentDialog();
            } else if (consent === 'accepted') {
                this.consentGiven = true;
            }

            // Attach event listeners
            document.getElementById('debug-toggle-logs').addEventListener('click', () => this.toggleLogging());
            document.getElementById('debug-clear').addEventListener('click', () => this.clear());
            document.getElementById('debug-export').addEventListener('click', () => this.exportLogs());
            document.getElementById('debug-close').addEventListener('click', () => this.hide());

            document.querySelectorAll('.debug-filter').forEach(cb => {
                cb.addEventListener('change', (e) => this.setFilter(e.target.value, e.target.checked));
            });

            // Hotkey: Shift+F12 to toggle panel (only if consent given)
            document.addEventListener('keydown', (e) => {
                if (e.shiftKey && e.key === 'F12') {
                    e.preventDefault();
                    if (this.consentGiven) {
                        this.toggleVisibility();
                    } else {
                        console.log('ℹ️ Debug Panel is disabled. Enable it in settings or refresh to see the consent dialog again.');
                    }
                }
            });

            if (this.consentGiven) {
                console.log('🔧 Debug Panel initialized. Press Shift+F12 to open.');
            }
        },

        toggleVisibility() {
            if (!this.consentGiven) {
                console.log('ℹ️ Debug Panel is disabled. Enable it by allowing consent or in settings.');
                return;
            }
            const panel = document.getElementById('debug-panel');
            if (panel.style.display === 'none') {
                this.show();
            } else {
                this.hide();
            }
        },

        show() {
            document.getElementById('debug-panel').style.display = 'block';
        },

        hide() {
            document.getElementById('debug-panel').style.display = 'none';
        },

        async toggleLogging() {
            if (this.enabled) {
                await this.stop();
            } else {
                await this.start();
            }
        },

        async start() {
            try {
                const res = await fetch('/api/debug/enable', { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify({ enable: true }) 
                });
                const json = await res.json();
                
                if (json.success) {
                    this.enabled = true;
                    document.getElementById('debug-toggle-logs').textContent = 'Stop';
                    document.getElementById('debug-toggle-logs').style.background = '#ff6600';
                    this.startPolling();
                    console.log('✅ Debug logging started');
                }
            } catch (e) {
                console.error('Debug start failed:', e);
            }
        },

        async stop() {
            try {
                const res = await fetch('/api/debug/enable', { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify({ enable: false }) 
                });
                
                if (res.ok) {
                    this.enabled = false;
                    document.getElementById('debug-toggle-logs').textContent = 'Start';
                    document.getElementById('debug-toggle-logs').style.background = '#00ff00';
                    this.stopPolling();
                    console.log('⏹️ Debug logging stopped');
                }
            } catch (e) {
                console.error('Debug stop failed:', e);
            }
        },

        startPolling() {
            if (this.intervalHandle) return;
            
            this.pollLogs(); // Initial poll
            this.intervalHandle = setInterval(() => this.pollLogs(), this.pollInterval);
        },

        stopPolling() {
            if (this.intervalHandle) {
                clearInterval(this.intervalHandle);
                this.intervalHandle = null;
            }
        },

        async pollLogs() {
            if (!this.enabled) return;

            try {
                const res = await fetch('/api/debug/logs?limit=100');
                const json = await res.json();

                if (json.logs) {
                    const container = document.getElementById('debug-logs');
                    const newLogs = json.logs.filter(l => l.id > this.lastId);

                    if (newLogs.length > 0) {
                        newLogs.forEach(log => {
                            const row = document.createElement('div');
                            row.style.cssText = 'margin-bottom: 3px; padding: 3px; background: #1a1a1a; border-left: 3px solid ' +
                                (log.level === 'error' ? '#ff0000' : log.level === 'warn' ? '#ffaa00' : '#00ff00') + ';';
                            
                            const dataStr = log.data ? ` <span style="color: #666;">${log.data}</span>` : '';
                            row.innerHTML = `<span style="color: #999;">[${log.elapsed_ms}ms]</span> <strong>[${log.category}]</strong> ${log.message}${dataStr}`;
                            
                            container.appendChild(row);
                            container.scrollTop = container.scrollHeight;
                            this.lastId = log.id;
                        });
                    }

                    const stats = json.stats || {};
                    document.getElementById('debug-count').textContent = `${json.count} entries`;
                    document.getElementById('debug-uptime').textContent = `${Math.round((stats.uptime_ms || 0) / 1000)}s`;
                }
            } catch (e) {
                console.error('Polling failed:', e);
            }
        },

        async clear() {
            try {
                await fetch('/api/debug/clear', { method: 'POST' });
                document.getElementById('debug-logs').innerHTML = '<div style="color: #666; text-align: center; padding: 20px;">Logs cleared</div>';
                this.lastId = 0;
                console.log('🗑️ Debug logs cleared');
            } catch (e) {
                console.error('Clear failed:', e);
            }
        },

        async exportLogs() {
            try {
                const res = await fetch('/api/debug/export');
                const json = await res.json();
                
                if (json.success) {
                    const blob = new Blob([JSON.stringify(json.data, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `debug-logs-${Date.now()}.json`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    console.log('💾 Debug logs exported');
                }
            } catch (e) {
                console.error('Export failed:', e);
            }
        },

        async setFilter(category, enabled) {
            try {
                await fetch('/api/debug/filter', { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify({ category, enabled }) 
                });
            } catch (e) {
                console.error('Filter failed:', e);
            }
        }
    };

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => debugPanel.init());
    } else {
        debugPanel.init();
    }

    // Expose to window for console access
    window.debugPanel = debugPanel;

})();
