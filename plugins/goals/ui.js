let socket = null;
let goals = [];
let editingGoalId = null;

// Initialize
function init() {
    socket = io();

    socket.on('connect', () => {
        console.log('Connected');
        socket.emit('goals:get-all');
    });

    socket.on('goals:all', (data) => {
        if (data.success) {
            goals = data.goals;
            renderGoals();
        }
    });

    socket.on('goals:created', (data) => {
        goals.push(data.goal);
        renderGoals();
    });

    socket.on('goals:updated', (data) => {
        const index = goals.findIndex(g => g.id === data.goal.id);
        if (index !== -1) {
            goals[index] = data.goal;
            renderGoals();
        }
    });

    socket.on('goals:deleted', (data) => {
        goals = goals.filter(g => g.id !== data.goalId);
        renderGoals();
    });

    socket.on('goals:value-changed', (data) => {
        const index = goals.findIndex(g => g.id === data.goal.id);
        if (index !== -1) {
            goals[index] = data.goal;
            renderGoals();
        }
    });

    // Show increment amount when needed
    document.getElementById('goal-on-reach').addEventListener('change', (e) => {
        document.getElementById('increment-amount-group').style.display =
            e.target.value === 'increment' ? 'block' : 'none';
    });
}

function renderGoals() {
    const container = document.getElementById('goals-container');

    if (goals.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🎯</div>
                <div class="empty-state-text">No goals created yet</div>
                <button class="btn btn-primary" id="create-first-goal-btn">Create Your First Goal</button>
            </div>
        `;
        // Add event listener to the newly created button
        document.getElementById('create-first-goal-btn').addEventListener('click', openCreateModal);
        return;
    }

    container.innerHTML = goals.map(goal => {
        const progress = Math.min(100, (goal.current_value / goal.target_value) * 100);
        const badgeClass = `badge-${goal.goal_type}`;
        const overlayUrl = `${window.location.origin}/goals/overlay?id=${goal.id}`;

        return `
            <div class="goal-card">
                <div class="goal-card-header">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <span class="goal-card-title">${escapeHtml(goal.name)}</span>
                        <span class="goal-card-badge ${badgeClass}">${goal.goal_type}</span>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.85rem;" onclick="editGoal('${goal.id}')">Edit</button>
                        <button class="btn btn-danger" style="padding: 6px 12px; font-size: 0.85rem;" onclick="deleteGoal('${goal.id}')">Delete</button>
                    </div>
                </div>

                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${progress}%"></div>
                </div>

                <div class="goal-stats">
                    <span>${goal.current_value} / ${goal.target_value}</span>
                    <span>${progress.toFixed(0)}%</span>
                    <span>Template: ${goal.template_id}</span>
                </div>

                <div style="margin-top: 16px;">
                    <strong style="font-size: 0.85rem; color: var(--text-secondary);">Overlay URL:</strong>
                    <div class="overlay-url">
                        ${overlayUrl}
                        <button class="btn btn-primary copy-btn" onclick="copyUrl('${overlayUrl}')">Copy</button>
                    </div>
                </div>

                <div class="goal-actions">
                    <button class="btn btn-secondary" onclick="resetGoal('${goal.id}')">Reset</button>
                    <button class="btn btn-secondary" onclick="incrementGoal('${goal.id}')">+1</button>
                    ${goal.goal_type === 'custom' ? `<button class="btn btn-secondary" onclick="setGoalValue('${goal.id}')">Set Value</button>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function openCreateModal() {
    editingGoalId = null;
    document.querySelector('.modal-header').textContent = 'Create New Goal';
    document.getElementById('goal-form').reset();
    document.getElementById('goal-modal').classList.add('active');
}

function editGoal(id) {
    const goal = goals.find(g => g.id === id);
    if (!goal) return;

    editingGoalId = id;
    document.querySelector('.modal-header').textContent = 'Edit Goal';
    document.getElementById('goal-name').value = goal.name;
    document.getElementById('goal-type').value = goal.goal_type;
    document.getElementById('goal-template').value = goal.template_id;
    document.getElementById('goal-start').value = goal.start_value;
    document.getElementById('goal-target').value = goal.target_value;
    document.getElementById('goal-anim-update').value = goal.animation_on_update;
    document.getElementById('goal-anim-reach').value = goal.animation_on_reach;
    document.getElementById('goal-on-reach').value = goal.on_reach_action;
    document.getElementById('goal-increment').value = goal.on_reach_increment;
    document.getElementById('goal-width').value = goal.overlay_width;
    document.getElementById('goal-height').value = goal.overlay_height;

    document.getElementById('increment-amount-group').style.display =
        goal.on_reach_action === 'increment' ? 'block' : 'none';

    document.getElementById('goal-modal').classList.add('active');
}

function closeModal() {
    document.getElementById('goal-modal').classList.remove('active');
    editingGoalId = null;
}

async function saveGoal(e) {
    e.preventDefault();

    const data = {
        name: document.getElementById('goal-name').value,
        goal_type: document.getElementById('goal-type').value,
        template_id: document.getElementById('goal-template').value,
        start_value: parseInt(document.getElementById('goal-start').value),
        target_value: parseInt(document.getElementById('goal-target').value),
        current_value: parseInt(document.getElementById('goal-start').value),
        animation_on_update: document.getElementById('goal-anim-update').value,
        animation_on_reach: document.getElementById('goal-anim-reach').value,
        on_reach_action: document.getElementById('goal-on-reach').value,
        on_reach_increment: parseInt(document.getElementById('goal-increment').value),
        overlay_width: parseInt(document.getElementById('goal-width').value),
        overlay_height: parseInt(document.getElementById('goal-height').value),
        enabled: 1
    };

    const url = editingGoalId ? `/api/goals/${editingGoalId}` : '/api/goals';
    const method = editingGoalId ? 'PUT' : 'POST';

    const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    const result = await response.json();
    if (result.success) {
        closeModal();
    } else {
        alert('Error saving goal: ' + result.error);
    }
}

async function deleteGoal(id) {
    if (!confirm('Are you sure you want to delete this goal?')) return;

    const response = await fetch(`/api/goals/${id}`, { method: 'DELETE' });
    const result = await response.json();
    if (!result.success) {
        alert('Error deleting goal: ' + result.error);
    }
}

async function resetGoal(id) {
    const response = await fetch(`/api/goals/${id}/reset`, { method: 'POST' });
    const result = await response.json();
    if (!result.success) {
        alert('Error resetting goal: ' + result.error);
    }
}

async function incrementGoal(id) {
    const response = await fetch(`/api/goals/${id}/increment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 1 })
    });
    const result = await response.json();
    if (!result.success) {
        alert('Error incrementing goal: ' + result.error);
    }
}

async function setGoalValue(id) {
    const value = prompt('Enter new value:');
    if (value === null) return;

    const response = await fetch(`/api/goals/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_value: parseInt(value) })
    });
    const result = await response.json();
    if (!result.success) {
        alert('Error setting value: ' + result.error);
    }
}

function copyUrl(url) {
    navigator.clipboard.writeText(url).then(() => {
        alert('URL copied to clipboard!');
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize on load
init();

// Set up event listeners
document.getElementById('create-goal-btn').addEventListener('click', openCreateModal);
document.getElementById('goal-form').addEventListener('submit', saveGoal);
document.getElementById('cancel-goal-btn').addEventListener('click', closeModal);
