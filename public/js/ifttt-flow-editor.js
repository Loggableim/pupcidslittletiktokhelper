/**
 * IFTTT Flow Editor
 * Visual drag-and-drop flow builder for automation rules
 */

(function() {
    'use strict';

    // State
    const state = {
        triggers: [],
        conditions: [],
        actions: [],
        flows: [],
        selectedNode: null,
        currentFlow: {
            id: null,
            name: '',
            description: '',
            enabled: true,
            nodes: [],
            connections: []
        },
        zoom: 1.0,
        pan: { x: 0, y: 0 },
        isDraggingCanvas: false,
        isDraggingNode: false,
        draggedNode: null,
        dragOffset: { x: 0, y: 0 }
    };

    // Socket.io connection
    const socket = io();

    // DOM Elements
    const elements = {
        triggerList: document.getElementById('trigger-list'),
        conditionList: document.getElementById('condition-list'),
        actionList: document.getElementById('action-list'),
        flowCanvas: document.getElementById('flow-canvas'),
        connectionsSvg: document.getElementById('connections-svg'),
        flowNameInput: document.getElementById('flow-name-input'),
        flowDescriptionInput: document.getElementById('flow-description-input'),
        flowEnabledInput: document.getElementById('flow-enabled-input'),
        nodeProperties: document.getElementById('node-properties'),
        nodePropertiesContent: document.getElementById('node-properties-content'),
        saveFlowBtn: document.getElementById('save-flow-btn'),
        testFlowBtn: document.getElementById('test-flow-btn'),
        clearCanvasBtn: document.getElementById('clear-canvas-btn'),
        zoomInBtn: document.getElementById('zoom-in-btn'),
        zoomOutBtn: document.getElementById('zoom-out-btn'),
        zoomLevel: document.getElementById('zoom-level'),
        executionLog: document.getElementById('execution-log'),
        statTotalFlows: document.getElementById('stat-total-flows'),
        statActiveFlows: document.getElementById('stat-active-flows'),
        statExecutions: document.getElementById('stat-executions'),
        statSuccessRate: document.getElementById('stat-success-rate')
    };

    // Initialize
    async function init() {
        try {
            console.log('🚀 Initializing IFTTT Flow Editor...');
            
            // Check if Socket.io is available
            if (typeof io === 'undefined') {
                console.error('Socket.io not loaded!');
                showNotification('Socket.io library not loaded. Real-time features will not work.', 'error');
            }
            
            await loadRegistries();
            await loadFlows();
            await loadStats();
            
            setupEventListeners();
            setupSocketListeners();
            
            // Start monitoring
            setInterval(loadStats, 5000);
            setInterval(loadExecutionHistory, 2000);
            
            console.log('✅ IFTTT Flow Editor initialized');
            showNotification('Flow Editor ready! 🎉', 'success');
        } catch (error) {
            console.error('❌ Failed to initialize Flow Editor:', error);
            showNotification('Failed to initialize: ' + error.message, 'error');
        }
    }

    // Load IFTTT registries
    async function loadRegistries() {
        try {
            console.log('Loading IFTTT registries...');
            const [triggersRes, conditionsRes, actionsRes] = await Promise.all([
                fetch('/api/ifttt/triggers'),
                fetch('/api/ifttt/conditions'),
                fetch('/api/ifttt/actions')
            ]);

            if (!triggersRes.ok || !conditionsRes.ok || !actionsRes.ok) {
                throw new Error('Failed to fetch IFTTT components');
            }

            state.triggers = await triggersRes.json();
            const conditionData = await conditionsRes.json();
            state.conditions = conditionData.conditions || [];
            state.actions = await actionsRes.json();

            console.log('Registries loaded:', {
                triggers: state.triggers.length,
                conditions: state.conditions.length,
                actions: state.actions.length
            });

            renderComponents();
            console.log(`✅ Loaded ${state.triggers.length} triggers, ${state.conditions.length} conditions, ${state.actions.length} actions`);
        } catch (error) {
            console.error('Error loading registries:', error);
            showNotification('Failed to load IFTTT components: ' + error.message, 'error');
        }
    }

    // Load flows
    async function loadFlows() {
        try {
            const response = await fetch('/api/flows');
            state.flows = await response.json();
            console.log(`✅ Loaded ${state.flows.length} flows`);
        } catch (error) {
            console.error('Error loading flows:', error);
        }
    }

    // Load statistics
    async function loadStats() {
        try {
            const response = await fetch('/api/ifttt/stats');
            const stats = await response.json();
            
            elements.statTotalFlows.textContent = stats.totalFlows || 0;
            elements.statActiveFlows.textContent = stats.activeFlows || 0;
            elements.statExecutions.textContent = stats.totalExecutions || 0;
            
            const successRate = stats.totalExecutions > 0
                ? ((stats.successfulExecutions / stats.totalExecutions) * 100).toFixed(1)
                : 100;
            elements.statSuccessRate.textContent = successRate + '%';
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    // Load execution history
    async function loadExecutionHistory() {
        try {
            const response = await fetch('/api/ifttt/execution-history?count=10');
            const history = await response.json();
            
            if (history.length === 0) return;
            
            elements.executionLog.innerHTML = history.map(exec => {
                const timestamp = new Date(exec.timestamp).toLocaleTimeString();
                const status = exec.success ? 'success' : 'error';
                const icon = exec.success ? '✅' : '❌';
                return `<div class="log-entry log-${status}">${icon} ${timestamp} - ${exec.flowName} (${exec.executionTime}ms)</div>`;
            }).join('');
        } catch (error) {
            // Silently fail - don't spam console
        }
    }

    // Render component lists
    function renderComponents() {
        // Group by category
        const triggersByCategory = groupByCategory(state.triggers);
        const conditionsByCategory = groupByCategory(state.conditions);
        const actionsByCategory = groupByCategory(state.actions);

        elements.triggerList.innerHTML = renderComponentList(state.triggers, 'trigger');
        elements.conditionList.innerHTML = renderComponentList(state.conditions.slice(0, 8), 'condition'); // Show top conditions
        elements.actionList.innerHTML = renderComponentList(state.actions.slice(0, 10), 'action'); // Show top actions
    }

    function groupByCategory(items) {
        return items.reduce((acc, item) => {
            if (!acc[item.category]) {
                acc[item.category] = [];
            }
            acc[item.category].push(item);
            return acc;
        }, {});
    }

    function renderComponentList(items, type) {
        return items.map(item => `
            <div class="component-item" draggable="true" 
                 data-type="${type}" 
                 data-id="${item.id}"
                 data-name="${item.name}">
                <div class="component-icon">
                    <span style="font-size: 16px;">${getIcon(item.icon, type)}</span>
                </div>
                <div class="component-label">${item.name}</div>
            </div>
        `).join('');
    }

    function getIcon(icon, type) {
        const icons = {
            // Common icons
            'gift': '🎁',
            'message-circle': '💬',
            'user-plus': '👤',
            'share-2': '🔗',
            'heart': '❤️',
            'log-in': '👋',
            'star': '⭐',
            'users': '👥',
            'wifi': '📡',
            'wifi-off': '📴',
            'alert-triangle': '⚠️',
            'clock': '⏰',
            'timer': '⏱️',
            'calendar': '📅',
            'hand': '✋',
            'globe': '🌐',
            'puzzle': '🧩',
            'target': '🎯',
            'trending-up': '📈',
            'mic': '🎤',
            'bell': '🔔',
            'volume-2': '🔊',
            'image': '🖼️',
            'type': '📝',
            'cloud-rain': '🌧️',
            'send': '📤',
            'database': '💾',
            'plus': '➕',
            'video': '📹',
            'radio': '📻',
            'file-text': '📄',
            'save': '💾',
            'zap': '⚡',
            'git-branch': '🌿'
        };
        
        return icons[icon] || (type === 'trigger' ? '⚡' : type === 'condition' ? '❓' : '▶️');
    }

    // Setup event listeners
    function setupEventListeners() {
        // Component drag & drop - Use event delegation for dynamically added elements
        elements.triggerList.addEventListener('dragstart', handleComponentDragStart);
        elements.conditionList.addEventListener('dragstart', handleComponentDragStart);
        elements.actionList.addEventListener('dragstart', handleComponentDragStart);
        
        elements.flowCanvas.addEventListener('dragover', handleCanvasDragOver);
        elements.flowCanvas.addEventListener('drop', handleCanvasDrop);

        // Canvas interactions
        elements.flowCanvas.addEventListener('mousedown', handleCanvasMouseDown);
        elements.flowCanvas.addEventListener('mousemove', handleCanvasMouseMove);
        elements.flowCanvas.addEventListener('mouseup', handleCanvasMouseUp);
        document.addEventListener('mouseup', handleCanvasMouseUp); // Also listen globally

        // Toolbar buttons
        if (elements.saveFlowBtn) {
            elements.saveFlowBtn.addEventListener('click', saveFlow);
        }
        if (elements.testFlowBtn) {
            elements.testFlowBtn.addEventListener('click', testFlow);
        }
        if (elements.clearCanvasBtn) {
            elements.clearCanvasBtn.addEventListener('click', clearCanvas);
        }
        if (elements.zoomInBtn) {
            elements.zoomInBtn.addEventListener('click', () => setZoom(state.zoom + 0.1));
        }
        if (elements.zoomOutBtn) {
            elements.zoomOutBtn.addEventListener('click', () => setZoom(state.zoom - 0.1));
        }

        // Flow properties
        if (elements.flowNameInput) {
            elements.flowNameInput.addEventListener('input', () => {
                state.currentFlow.name = elements.flowNameInput.value;
            });
        }
        
        if (elements.flowDescriptionInput) {
            elements.flowDescriptionInput.addEventListener('input', () => {
                state.currentFlow.description = elements.flowDescriptionInput.value;
            });
        }
        
        if (elements.flowEnabledInput) {
            elements.flowEnabledInput.addEventListener('change', () => {
                state.currentFlow.enabled = elements.flowEnabledInput.checked;
            });
        }
    }

    // Setup Socket.io listeners
    function setupSocketListeners() {
        socket.on('ifttt:execution', (execution) => {
            addLogEntry(execution);
        });

        socket.on('ifttt:debug', (debug) => {
            addDebugEntry(debug);
        });

        socket.on('notification', (notification) => {
            showNotification(notification.message, notification.type);
        });
    }

    // Component drag & drop handlers
    function handleComponentDragStart(e) {
        const item = e.target.closest('.component-item');
        if (!item) return;
        
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('component-type', item.dataset.type);
        e.dataTransfer.setData('component-id', item.dataset.id);
        e.dataTransfer.setData('component-name', item.dataset.name);
        console.log('Dragging component:', item.dataset.name);
    }

    function handleCanvasDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    }

    function handleCanvasDrop(e) {
        e.preventDefault();
        
        const type = e.dataTransfer.getData('component-type');
        const id = e.dataTransfer.getData('component-id');
        const name = e.dataTransfer.getData('component-name');
        
        if (!type || !id) return;
        
        const rect = elements.flowCanvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / state.zoom;
        const y = (e.clientY - rect.top) / state.zoom;
        
        createNode(type, id, name, x, y);
    }

    // Create node on canvas
    function createNode(type, componentId, name, x, y) {
        const node = {
            id: `node_${Date.now()}`,
            type,
            componentId,
            name,
            x,
            y,
            config: {}
        };
        
        state.currentFlow.nodes.push(node);
        renderNode(node);
    }

    // Render node
    function renderNode(node) {
        const nodeEl = document.createElement('div');
        nodeEl.className = `flow-node ${node.type}`;
        nodeEl.id = node.id;
        nodeEl.style.left = `${node.x}px`;
        nodeEl.style.top = `${node.y}px`;
        
        const icon = getNodeIcon(node);
        
        nodeEl.innerHTML = `
            <div class="connection-point input"></div>
            <div class="node-header">
                <div class="node-icon">${icon}</div>
                <div class="node-title">${node.name}</div>
            </div>
            <div class="node-content">
                <span class="badge badge-${node.type}">${node.type}</span>
            </div>
            <div class="connection-point output"></div>
        `;
        
        nodeEl.addEventListener('click', () => selectNode(node));
        nodeEl.addEventListener('mousedown', (e) => startNodeDrag(e, node));
        
        elements.flowCanvas.appendChild(nodeEl);
    }

    function getNodeIcon(node) {
        let item;
        if (node.type === 'trigger') {
            item = state.triggers.find(t => t.id === node.componentId);
        } else if (node.type === 'condition') {
            item = state.conditions.find(c => c.id === node.componentId);
        } else if (node.type === 'action') {
            item = state.actions.find(a => a.id === node.componentId);
        }
        
        return getIcon(item?.icon, node.type);
    }

    // Node selection
    function selectNode(node) {
        // Deselect previous
        const prevSelected = elements.flowCanvas.querySelector('.flow-node.selected');
        if (prevSelected) {
            prevSelected.classList.remove('selected');
        }
        
        // Select new
        const nodeEl = document.getElementById(node.id);
        if (nodeEl) {
            nodeEl.classList.add('selected');
        }
        
        state.selectedNode = node;
        showNodeProperties(node);
    }

    // Show node properties
    function showNodeProperties(node) {
        elements.nodeProperties.style.display = 'block';
        
        let component;
        if (node.type === 'trigger') {
            component = state.triggers.find(t => t.id === node.componentId);
        } else if (node.type === 'condition') {
            component = state.conditions.find(c => c.id === node.componentId);
        } else if (node.type === 'action') {
            component = state.actions.find(a => a.id === node.componentId);
        }
        
        if (!component) return;
        
        elements.nodePropertiesContent.innerHTML = `
            <div class="form-group">
                <div class="form-label">${component.name}</div>
                <p style="font-size: 13px; color: #94a3b8; margin: 4px 0 12px 0;">${component.description || ''}</p>
            </div>
            ${component.fields ? renderFields(component.fields, node) : '<p style="color: #64748b; font-size: 13px;">No configuration needed</p>'}
            <div class="form-group">
                <button class="btn btn-danger" onclick="deleteNode('${node.id}')" style="width: 100%; margin-top: 12px;">Delete Node</button>
            </div>
        `;
    }

    function renderFields(fields, node) {
        return fields.map(field => {
            const value = node.config[field.name] || field.default || '';
            
            if (field.type === 'textarea') {
                return `
                    <div class="form-group">
                        <label class="form-label">${field.label}</label>
                        <textarea class="form-textarea" 
                                  data-node="${node.id}" 
                                  data-field="${field.name}"
                                  placeholder="${field.placeholder || ''}"
                                  onchange="updateNodeConfig(this)">${value}</textarea>
                    </div>
                `;
            } else if (field.type === 'select') {
                const options = field.options || [];
                return `
                    <div class="form-group">
                        <label class="form-label">${field.label}</label>
                        <select class="form-select" 
                                data-node="${node.id}" 
                                data-field="${field.name}"
                                onchange="updateNodeConfig(this)">
                            ${options.map(opt => `<option value="${opt}" ${opt === value ? 'selected' : ''}>${opt}</option>`).join('')}
                        </select>
                    </div>
                `;
            } else if (field.type === 'number' || field.type === 'range') {
                return `
                    <div class="form-group">
                        <label class="form-label">${field.label}</label>
                        <input type="number" class="form-input" 
                               data-node="${node.id}" 
                               data-field="${field.name}"
                               value="${value}"
                               min="${field.min || ''}"
                               max="${field.max || ''}"
                               step="${field.step || '1'}"
                               onchange="updateNodeConfig(this)">
                    </div>
                `;
            } else if (field.type === 'checkbox') {
                return `
                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                            <input type="checkbox" 
                                   data-node="${node.id}" 
                                   data-field="${field.name}"
                                   ${value ? 'checked' : ''}
                                   onchange="updateNodeConfig(this)">
                            <span class="form-label" style="margin: 0;">${field.label}</span>
                        </label>
                    </div>
                `;
            } else {
                return `
                    <div class="form-group">
                        <label class="form-label">${field.label}</label>
                        <input type="text" class="form-input" 
                               data-node="${node.id}" 
                               data-field="${field.name}"
                               value="${value}"
                               placeholder="${field.placeholder || ''}"
                               onchange="updateNodeConfig(this)">
                    </div>
                `;
            }
        }).join('');
    }

    // Global functions for onclick handlers
    window.updateNodeConfig = function(el) {
        const nodeId = el.dataset.node;
        const fieldName = el.dataset.field;
        const value = el.type === 'checkbox' ? el.checked : el.value;
        
        const node = state.currentFlow.nodes.find(n => n.id === nodeId);
        if (node) {
            node.config[fieldName] = value;
            console.log(`Updated ${nodeId}.${fieldName} = ${value}`);
        }
    };

    window.deleteNode = function(nodeId) {
        if (!confirm('Delete this node?')) return;
        
        // Remove from state
        state.currentFlow.nodes = state.currentFlow.nodes.filter(n => n.id !== nodeId);
        
        // Remove from DOM
        const nodeEl = document.getElementById(nodeId);
        if (nodeEl) {
            nodeEl.remove();
        }
        
        // Clear properties
        elements.nodeProperties.style.display = 'none';
        state.selectedNode = null;
    };

    // Node dragging
    function startNodeDrag(e, node) {
        if (e.target.classList.contains('connection-point')) return;
        
        e.stopPropagation();
        state.isDraggingNode = true;
        state.draggedNode = node;
        
        const nodeEl = document.getElementById(node.id);
        const rect = nodeEl.getBoundingClientRect();
        const canvasRect = elements.flowCanvas.getBoundingClientRect();
        
        state.dragOffset = {
            x: (e.clientX - rect.left) / state.zoom,
            y: (e.clientY - rect.top) / state.zoom
        };
    }

    // Canvas interactions
    function handleCanvasMouseDown(e) {
        if (e.target === elements.flowCanvas || e.target.id === 'flow-canvas') {
            state.isDraggingCanvas = true;
        }
    }

    function handleCanvasMouseMove(e) {
        if (state.isDraggingNode && state.draggedNode) {
            const rect = elements.flowCanvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) / state.zoom - state.dragOffset.x;
            const y = (e.clientY - rect.top) / state.zoom - state.dragOffset.y;
            
            state.draggedNode.x = Math.max(0, x);
            state.draggedNode.y = Math.max(0, y);
            
            const nodeEl = document.getElementById(state.draggedNode.id);
            if (nodeEl) {
                nodeEl.style.left = `${state.draggedNode.x}px`;
                nodeEl.style.top = `${state.draggedNode.y}px`;
            }
        }
    }

    function handleCanvasMouseUp(e) {
        state.isDraggingCanvas = false;
        state.isDraggingNode = false;
        state.draggedNode = null;
    }

    // Zoom
    function setZoom(newZoom) {
        state.zoom = Math.max(0.5, Math.min(2.0, newZoom));
        elements.zoomLevel.textContent = `${Math.round(state.zoom * 100)}%`;
        elements.flowCanvas.style.transform = `scale(${state.zoom})`;
    }

    // Save flow
    async function saveFlow() {
        try {
            console.log('Saving flow...', state.currentFlow);
            
            if (!state.currentFlow.name || state.currentFlow.name.trim() === '') {
                showNotification('Please enter a flow name', 'error');
                elements.flowNameInput.focus();
                return;
            }

            if (state.currentFlow.nodes.length === 0) {
                showNotification('Please add at least one node to the flow', 'error');
                return;
            }

            // Build flow structure
            const trigger = state.currentFlow.nodes.find(n => n.type === 'trigger');
            if (!trigger) {
                showNotification('Flow must have a trigger', 'error');
                return;
            }

            const actions = state.currentFlow.nodes
                .filter(n => n.type === 'action')
                .map(n => ({
                    type: n.componentId,
                    ...n.config
                }));

            if (actions.length === 0) {
                showNotification('Flow must have at least one action', 'error');
                return;
            }

            const flowData = {
                name: state.currentFlow.name.trim(),
                trigger_type: trigger.componentId,
                trigger_condition: trigger.config || {},
                actions: actions,
                enabled: state.currentFlow.enabled ? 1 : 0
            };

            console.log('Flow data to save:', flowData);

            const url = state.currentFlow.id ? `/api/flows/${state.currentFlow.id}` : '/api/flows';
            const method = state.currentFlow.id ? 'PUT' : 'POST';
            
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(flowData)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Server error: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            console.log('Save result:', result);
            
            if (result.success !== false) {
                if (result.id && !state.currentFlow.id) {
                    state.currentFlow.id = result.id;
                }
                showNotification('Flow saved successfully! ✅', 'success');
                await loadFlows();
                await loadStats();
            } else {
                showNotification(`Error: ${result.error || 'Unknown error'}`, 'error');
            }
        } catch (error) {
            console.error('Error saving flow:', error);
            showNotification('Failed to save flow: ' + error.message, 'error');
        }
    }

    // Test flow
    async function testFlow() {
        try {
            console.log('Testing flow...');
            
            if (!state.currentFlow.id) {
                showNotification('Please save the flow first before testing', 'error');
                return;
            }

            const testData = {
                username: 'TestUser',
                nickname: 'Test User',
                message: 'Test message from flow editor',
                giftName: 'Rose',
                coins: 100,
                repeatCount: 5,
                likeCount: 10
            };

            console.log('Test data:', testData);

            const response = await fetch(`/api/flows/${state.currentFlow.id}/test`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(testData)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Server error: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            console.log('Test result:', result);
            
            if (result.success !== false) {
                showNotification('Flow test triggered successfully! 🧪', 'success');
                addLogEntry({
                    flowName: state.currentFlow.name,
                    success: true,
                    executionTime: result.executionTime || 0
                });
            } else {
                showNotification(`Test failed: ${result.error || 'Unknown error'}`, 'error');
            }
        } catch (error) {
            console.error('Error testing flow:', error);
            showNotification('Failed to test flow: ' + error.message, 'error');
        }
    }

    // Clear canvas
    function clearCanvas() {
        if (!confirm('Clear all nodes from canvas?')) return;
        
        state.currentFlow.nodes = [];
        state.currentFlow.connections = [];
        state.selectedNode = null;
        
        elements.flowCanvas.querySelectorAll('.flow-node').forEach(node => node.remove());
        elements.nodeProperties.style.display = 'none';
    }

    // Notifications
    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
            color: white;
            padding: 12px 20px;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 9999;
            animation: slideIn 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    function addLogEntry(execution) {
        const timestamp = new Date().toLocaleTimeString();
        const status = execution.success ? 'success' : 'error';
        const icon = execution.success ? '✅' : '❌';
        
        const entry = document.createElement('div');
        entry.className = `log-entry log-${status}`;
        entry.textContent = `${icon} ${timestamp} - ${execution.flowName} (${execution.executionTime}ms)`;
        
        elements.executionLog.insertBefore(entry, elements.executionLog.firstChild);
        
        // Keep only last 20 entries
        while (elements.executionLog.children.length > 20) {
            elements.executionLog.removeChild(elements.executionLog.lastChild);
        }
    }
    
    function addDebugEntry(debug) {
        const timestamp = new Date(debug.timestamp).toLocaleTimeString();
        let icon = '📡';
        let message = '';
        let status = 'info';
        
        switch (debug.type) {
            case 'event_received':
                icon = '📨';
                message = `Event: ${debug.eventType} (${debug.matchingFlows} flow(s))`;
                status = 'info';
                break;
            case 'flow_started':
                icon = '▶️';
                message = `Flow started: ${debug.flowName}`;
                status = 'info';
                break;
            case 'flow_skipped':
                icon = '⏭️';
                message = `Flow skipped: ${debug.flowName} (${debug.reason})`;
                status = 'info';
                break;
            case 'conditions_met':
                icon = '✓';
                message = `Conditions met: ${debug.flowName}`;
                status = 'success';
                break;
            case 'action_started':
                icon = '🔧';
                message = `Action: ${debug.actionType} in ${debug.flowName}`;
                status = 'info';
                break;
            case 'action_completed':
                icon = '✅';
                message = `Action completed: ${debug.actionType} (${debug.executionTime}ms)`;
                status = 'success';
                break;
            case 'action_failed':
                icon = '❌';
                message = `Action failed: ${debug.actionType} - ${debug.error}`;
                status = 'error';
                break;
            case 'flow_completed':
                icon = '🏁';
                message = `Flow completed: ${debug.flowName} (${debug.executionTime}ms, ${debug.actionsExecuted} action(s))`;
                status = 'success';
                break;
            case 'flow_error':
                icon = '💥';
                message = `Flow error: ${debug.flowName} - ${debug.error}`;
                status = 'error';
                break;
            case 'error':
                icon = '❌';
                message = `Error: ${debug.error}`;
                status = 'error';
                break;
            default:
                message = `${debug.type}: ${JSON.stringify(debug)}`;
        }
        
        const entry = document.createElement('div');
        entry.className = `log-entry log-${status}`;
        entry.textContent = `${icon} ${timestamp} - ${message}`;
        entry.title = JSON.stringify(debug, null, 2); // Show full data on hover
        
        elements.executionLog.insertBefore(entry, elements.executionLog.firstChild);
        
        // Keep only last 20 entries
        while (elements.executionLog.children.length > 20) {
            elements.executionLog.removeChild(elements.executionLog.lastChild);
        }
    }

    // Initialize on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
