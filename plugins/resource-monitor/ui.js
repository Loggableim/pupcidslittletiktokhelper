// Socket.IO connection
const socket = io();

// State
let metrics = {
    cpu: { usage: 0, cores: [], temp: null, model: '', peak: 0, history: [] },
    ram: { used: 0, total: 0, percent: 0, process: 0, peak: 0, history: [], breakdown: {} },
    gpu: { usage: null, vram: { used: 0, total: 0 }, temp: null, model: '', enabled: false, history: [] },
    processes: []
};

let charts = {
    cpu: null,
    ram: null,
    gpu: null
};

let compactMode = false;
let lastUpdateTime = Date.now();

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    setupEventListeners();
    requestMetrics();

    // Request metrics every 2 seconds
    setInterval(requestMetrics, 2000);
});

// Setup event listeners
function setupEventListeners() {
    // Compact mode toggle
    const compactToggle = document.getElementById('compact-toggle');
    if (compactToggle) {
        compactToggle.addEventListener('change', (e) => {
            compactMode = e.target.checked;
            const app = document.getElementById('app');
            if (app) {
                app.classList.toggle('compact-mode', compactMode);
            }
        });
    }

    // Export button
    const exportBtn = document.querySelector('[data-action="export"]');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportMetrics);
    }

    // Toggle section buttons
    const toggleButtons = document.querySelectorAll('[data-toggle]');
    toggleButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const sectionId = btn.getAttribute('data-toggle');
            toggleSection(sectionId);
        });
    });

    // Socket events
    socket.on('connect', () => {
        updateConnectionStatus(true);
    });

    socket.on('disconnect', () => {
        updateConnectionStatus(false);
    });

    socket.on('resource-monitor:metrics', (data) => {
        updateMetrics(data);
    });
}

// Request metrics from server
function requestMetrics() {
    socket.emit('resource-monitor:request-metrics');
}

// Update connection status
function updateConnectionStatus(connected) {
    const indicator = document.getElementById('status-indicator');
    const text = document.getElementById('status-text');

    if (!indicator || !text) {
        console.warn('Status elements not found');
        return;
    }

    if (connected) {
        indicator.className = 'w-3 h-3 rounded-full bg-green-500';
        text.textContent = 'Connected';
        text.className = 'text-green-400';
    } else {
        indicator.className = 'w-3 h-3 rounded-full bg-red-500';
        text.textContent = 'Disconnected';
        text.className = 'text-red-400';
    }
}

// Update metrics
function updateMetrics(data) {
    if (!data) return;

    lastUpdateTime = Date.now();

    const lastUpdateEl = document.getElementById('last-update');
    if (lastUpdateEl) {
        lastUpdateEl.textContent = new Date().toLocaleTimeString();
    }

    const updateIntervalEl = document.getElementById('update-interval');
    if (updateIntervalEl) {
        updateIntervalEl.textContent = data.updateInterval || 2000;
    }

    // Update CPU
    if (data.cpu) {
        updateCPU(data.cpu);
    }

    // Update RAM
    if (data.ram) {
        updateRAM(data.ram);
    }

    // Update GPU
    if (data.gpu) {
        updateGPU(data.gpu);
    }

    // Update processes
    if (data.processes) {
        updateProcesses(data.processes);
    }

    // Check for warnings
    checkWarnings();
}

// Safe element update helper
function safeUpdateElement(id, callback) {
    const el = document.getElementById(id);
    if (el && callback) {
        callback(el);
    }
}

// Update CPU display
function updateCPU(cpu) {
    const usage = Math.round(cpu.usage || 0);

    // Update percentage with animation
    const percentEl = document.getElementById('cpu-percentage');
    if (parseInt(percentEl.textContent) !== usage) {
        percentEl.classList.add('value-changed');
        setTimeout(() => percentEl.classList.remove('value-changed'), 300);
    }
    percentEl.textContent = usage + '%';

    // Update model
    if (cpu.model) {
        document.getElementById('cpu-model').textContent = cpu.model;
    }

    // Update cores
    document.getElementById('cpu-cores').textContent = `${cpu.physicalCores || 0} / ${cpu.logicalCores || 0}`;

    // Update temperature
    document.getElementById('cpu-temp').textContent = cpu.temp ? `${cpu.temp}°C` : 'N/A';

    // Update progress bars and circles
    const color = getColorClass(usage, 5, 8);
    updateProgressBar('cpu-progress-bar', usage, color);
    updateCircularProgress('cpu-progress-circle', usage, color);

    // Update status
    document.getElementById('cpu-status').textContent = getStatusText(usage, 5, 8);

    // Track peak
    if (usage > metrics.cpu.peak) {
        metrics.cpu.peak = usage;
        document.getElementById('cpu-peak').textContent = usage + '%';
    }

    // Update history
    metrics.cpu.history.push(usage);
    if (metrics.cpu.history.length > 60) {
        metrics.cpu.history.shift();
    }

    // Calculate average
    const avg = Math.round(metrics.cpu.history.reduce((a, b) => a + b, 0) / metrics.cpu.history.length);
    document.getElementById('cpu-avg').textContent = avg + '%';

    // Update chart
    updateChart('cpu', metrics.cpu.history, color);

    // Update per-core display
    if (cpu.cores && cpu.cores.length > 0) {
        updateCoresGrid(cpu.cores);
    }
}

// Update RAM display
function updateRAM(ram) {
    const percent = Math.round(ram.percent || 0);
    const used = formatBytes(ram.used || 0);
    const total = formatBytes(ram.total || 0);
    const free = formatBytes(ram.free || 0);

    // Update percentage with animation
    safeUpdateElement('ram-percentage', (el) => {
        if (parseInt(el.textContent) !== percent) {
            el.classList.add('value-changed');
            setTimeout(() => el.classList.remove('value-changed'), 300);
        }
        el.textContent = percent + '%';
    });

    // Update used display
    safeUpdateElement('ram-used', (el) => el.textContent = used);
    safeUpdateElement('ram-total', (el) => el.textContent = `Total: ${total}`);
    safeUpdateElement('ram-used-stat', (el) => el.textContent = used);
    safeUpdateElement('ram-free', (el) => el.textContent = free);
    safeUpdateElement('ram-process', (el) => el.textContent = formatBytes(ram.processMemory || 0));

    // Update progress bars and circles
    const color = getColorClass(percent, 70, 85);
    updateProgressBar('ram-progress-bar', percent, color);
    updateCircularProgress('ram-progress-circle', percent, color);

    // Track peak
    if (percent > metrics.ram.peak) {
        metrics.ram.peak = percent;
        document.getElementById('ram-peak').textContent = percent + '%';
    }

    // Update history
    metrics.ram.history.push(percent);
    if (metrics.ram.history.length > 60) {
        metrics.ram.history.shift();
    }

    // Update chart
    updateChart('ram', metrics.ram.history, color);

    // Update memory breakdown
    if (ram.breakdown) {
        updateMemoryBreakdown(ram.breakdown);
    }
}

// Update GPU display
function updateGPU(gpu) {
    if (!gpu || !gpu.enabled) {
        document.getElementById('gpu-percentage').textContent = 'N/A';
        document.getElementById('gpu-status').textContent = 'Disabled';
        document.getElementById('gpu-model').textContent = 'GPU Acceleration: Disabled';
        document.getElementById('gpu-acceleration').textContent = 'Disabled';
        return;
    }

    const usage = Math.round(gpu.usage || 0);

    // Update percentage
    const percentEl = document.getElementById('gpu-percentage');
    if (parseInt(percentEl.textContent) !== usage) {
        percentEl.classList.add('value-changed');
        setTimeout(() => percentEl.classList.remove('value-changed'), 300);
    }
    percentEl.textContent = usage + '%';

    // Update model
    if (gpu.model) {
        document.getElementById('gpu-model').textContent = gpu.model;
    }

    // Update VRAM
    document.getElementById('gpu-vram-used').textContent = formatBytes(gpu.vram?.used || 0);
    document.getElementById('gpu-vram-total').textContent = formatBytes(gpu.vram?.total || 0);

    // Update temperature
    document.getElementById('gpu-temp').textContent = gpu.temp ? `${gpu.temp}°C` : 'N/A';

    // Update acceleration status
    document.getElementById('gpu-acceleration').textContent = gpu.enabled ? 'Enabled' : 'Disabled';
    document.getElementById('gpu-status').textContent = 'Active';

    // Update progress bars and circles
    const color = getColorClass(usage, 70, 85);
    updateProgressBar('gpu-progress-bar', usage, color);
    updateCircularProgress('gpu-progress-circle', usage, color);

    // Update history
    metrics.gpu.history.push(usage);
    if (metrics.gpu.history.length > 60) {
        metrics.gpu.history.shift();
    }

    // Update chart
    updateChart('gpu', metrics.gpu.history, color);

    // Update GPU info
    updateGPUInfo(gpu);
}

// Update processes table
function updateProcesses(processes) {
    const tbody = document.getElementById('processes-table');

    if (!processes || processes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-gray-500">No process data available</td></tr>';
        return;
    }

    tbody.innerHTML = processes.slice(0, 10).map(proc => `
        <tr class="border-b border-gray-700 hover:bg-gray-700 transition">
            <td class="py-3 pr-4">${proc.name || 'Unknown'}</td>
            <td class="py-3 pr-4">${proc.pid || '-'}</td>
            <td class="py-3 pr-4">${proc.cpu ? proc.cpu.toFixed(1) + '%' : '-'}</td>
            <td class="py-3">${formatBytes(proc.memory || 0)}</td>
        </tr>
    `).join('');
}

// Update cores grid
function updateCoresGrid(cores) {
    const grid = document.getElementById('cpu-cores-grid');
    grid.innerHTML = cores.map((usage, i) => {
        const percent = Math.round(usage);
        const color = getColorClass(percent, 5, 8);
        return `
            <div class="core-item">
                <div class="text-xs text-gray-400 mb-1">Core ${i}</div>
                <div class="font-semibold text-white mb-2">${percent}%</div>
                <div class="h-2 bg-gray-900 rounded overflow-hidden">
                    <div class="h-full progress-fill ${color}" style="width: ${percent}%"></div>
                </div>
            </div>
        `;
    }).join('');
}

// Update memory breakdown
function updateMemoryBreakdown(breakdown) {
    const container = document.getElementById('ram-breakdown');
    container.innerHTML = Object.entries(breakdown).map(([key, value]) => `
        <div class="memory-item">
            <span class="text-gray-400">${formatKey(key)}</span>
            <span class="text-white font-semibold">${formatBytes(value)}</span>
        </div>
    `).join('');
}

// Update GPU info
function updateGPUInfo(gpu) {
    const info = document.getElementById('gpu-info');
    const details = [
        { label: 'Model', value: gpu.model || 'Unknown' },
        { label: 'Driver Version', value: gpu.driver || 'N/A' },
        { label: 'Vendor', value: gpu.vendor || 'N/A' },
        { label: 'Memory Type', value: gpu.memoryType || 'N/A' }
    ];

    info.innerHTML = details.map(({ label, value }) => `
        <div class="flex justify-between">
            <span class="text-gray-400">${label}:</span>
            <span class="text-white">${value}</span>
        </div>
    `).join('');
}

// Check for warnings
function checkWarnings() {
    const warnings = [];

    // CPU warnings
    if (metrics.cpu.history.length > 0) {
        const avgCPU = metrics.cpu.history.reduce((a, b) => a + b, 0) / metrics.cpu.history.length;
        if (avgCPU > 8) {
            warnings.push({
                type: 'critical',
                message: `CPU usage is critically high: ${Math.round(avgCPU)}% (target: <5%)`
            });
        } else if (avgCPU > 5) {
            warnings.push({
                type: 'warning',
                message: `CPU usage is above target: ${Math.round(avgCPU)}% (target: <5%)`
            });
        }
    }

    // RAM warnings
    if (metrics.ram.history.length > 0) {
        const currentRAM = metrics.ram.history[metrics.ram.history.length - 1];
        if (currentRAM > 85) {
            warnings.push({
                type: 'critical',
                message: `RAM usage is critically high: ${currentRAM}%`
            });
        } else if (currentRAM > 70) {
            warnings.push({
                type: 'warning',
                message: `RAM usage is high: ${currentRAM}%`
            });
        }
    }

    // Display warnings
    const section = document.getElementById('warnings-section');
    const list = document.getElementById('warnings-list');

    if (warnings.length > 0) {
        section.classList.remove('hidden');
        list.innerHTML = warnings.map(w => `
            <div class="warning-badge ${w.type}">
                <span>${w.type === 'critical' ? '🔴' : '⚠️'}</span>
                <span>${w.message}</span>
            </div>
        `).join('');
    } else {
        section.classList.add('hidden');
    }
}

// Initialize charts
function initCharts() {
    const chartConfig = {
        type: 'line',
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: true }
            },
            scales: {
                x: { display: false },
                y: {
                    display: true,
                    min: 0,
                    max: 100,
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#9ca3af', font: { size: 10 } }
                }
            },
            elements: {
                line: { tension: 0.4, borderWidth: 2 },
                point: { radius: 0 }
            },
            animation: { duration: 500 }
        }
    };

    // Create charts
    ['cpu', 'ram', 'gpu'].forEach(type => {
        const ctx = document.getElementById(`${type}-chart`).getContext('2d');
        charts[type] = new Chart(ctx, {
            ...chartConfig,
            data: {
                labels: Array(60).fill(''),
                datasets: [{
                    data: Array(60).fill(0),
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: true
                }]
            }
        });
    });
}

// Update chart
function updateChart(type, data, colorClass) {
    if (!charts[type]) return;

    const colors = {
        green: { border: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' },
        yellow: { border: '#fbbf24', bg: 'rgba(251, 191, 36, 0.1)' },
        red: { border: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' }
    };

    const color = colors[colorClass] || colors.green;

    charts[type].data.labels = Array(data.length).fill('');
    charts[type].data.datasets[0].data = data;
    charts[type].data.datasets[0].borderColor = color.border;
    charts[type].data.datasets[0].backgroundColor = color.bg;
    charts[type].update('none');
}

// Update progress bar
function updateProgressBar(id, percent, colorClass) {
    const el = document.getElementById(id);
    el.style.width = percent + '%';
    el.className = `progress-fill ${colorClass}`;
}

// Update circular progress
function updateCircularProgress(id, percent, colorClass) {
    const circle = document.getElementById(id);
    const circumference = 565.48;
    const offset = circumference - (percent / 100) * circumference;

    circle.style.strokeDashoffset = offset;

    const colors = {
        green: '#10b981',
        yellow: '#fbbf24',
        red: '#ef4444'
    };

    circle.setAttribute('stroke', colors[colorClass] || colors.green);
}

// Get color class based on thresholds
function getColorClass(value, yellowThreshold, redThreshold) {
    if (value > redThreshold) return 'red';
    if (value > yellowThreshold) return 'yellow';
    return 'green';
}

// Get status text
function getStatusText(value, yellowThreshold, redThreshold) {
    if (value > redThreshold) return 'Critical';
    if (value > yellowThreshold) return 'Warning';
    return 'Good';
}

// Format bytes
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Format key
function formatKey(key) {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
}

// Toggle section
function toggleSection(id) {
    const el = document.getElementById(id);
    el.classList.toggle('expanded');
}

// Export metrics
function exportMetrics() {
    const exportData = {
        timestamp: new Date().toISOString(),
        cpu: {
            current: metrics.cpu.history[metrics.cpu.history.length - 1],
            peak: metrics.cpu.peak,
            average: Math.round(metrics.cpu.history.reduce((a, b) => a + b, 0) / metrics.cpu.history.length),
            history: metrics.cpu.history
        },
        ram: {
            current: metrics.ram.history[metrics.ram.history.length - 1],
            peak: metrics.ram.peak,
            average: Math.round(metrics.ram.history.reduce((a, b) => a + b, 0) / metrics.ram.history.length),
            history: metrics.ram.history
        },
        gpu: {
            current: metrics.gpu.history[metrics.gpu.history.length - 1],
            history: metrics.gpu.history
        },
        processes: metrics.processes
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resource-monitor-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
