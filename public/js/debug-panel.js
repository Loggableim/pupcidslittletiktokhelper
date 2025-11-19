/**
 * Debug Panel - Client-side component for debug logging
 * Include this script in dashboard.html to enable debug panel
 */

(function() {
    'use strict';

    // Create debug panel HTML
    const panelHTML = `
        <div id="debug-panel" style="display: none; position: fixed; bottom: 20px; right: 20px; width: 500px; 
             max-height: 600px; background: #1e1e1e; border: 2px solid #00ff00; border-radius: 8px; 
             font-family: 'Courier New', monospace; font-size: 12px; color: #00ff00; z-index: 10000; 
             box-shadow: 0 0 20px rgba(0,255,0,0.3);">
          
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

        init() {
            // Inject panel HTML into document
            const container = document.createElement('div');
            container.innerHTML = panelHTML;
            document.body.appendChild(container.firstElementChild);

            // Attach event listeners
            document.getElementById('debug-toggle-logs').addEventListener('click', () => this.toggleLogging());
            document.getElementById('debug-clear').addEventListener('click', () => this.clear());
            document.getElementById('debug-export').addEventListener('click', () => this.exportLogs());
            document.getElementById('debug-close').addEventListener('click', () => this.hide());

            document.querySelectorAll('.debug-filter').forEach(cb => {
                cb.addEventListener('change', (e) => this.setFilter(e.target.value, e.target.checked));
            });

            // Hotkey: Shift+F12 to toggle panel
            document.addEventListener('keydown', (e) => {
                if (e.shiftKey && e.key === 'F12') {
                    e.preventDefault();
                    this.toggleVisibility();
                }
            });

            console.log('🔧 Debug Panel initialized. Press Shift+F12 to open.');
        },

        toggleVisibility() {
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
