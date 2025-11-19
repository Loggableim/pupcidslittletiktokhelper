const socket = io();

// Load overall stats
async function loadStats() {
  try {
    const response = await fetch('/api/viewer-xp/stats');
    const stats = await response.json();
    
    document.getElementById('totalViewers').textContent = stats.totalViewers.toLocaleString();
    document.getElementById('totalXP').textContent = stats.totalXPEarned.toLocaleString();
    document.getElementById('avgLevel').textContent = stats.avgLevel.toFixed(1);
    document.getElementById('activeToday').textContent = stats.activeToday.toLocaleString();
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

// Load leaderboard
async function loadLeaderboard() {
  const filter = document.getElementById('leaderboardFilter').value;
  const days = filter ? parseInt(filter) : null;
  
  try {
    let url = '/api/viewer-xp/leaderboard?limit=50';
    if (days) url += `&days=${days}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    const tbody = document.getElementById('leaderboardTable');
    tbody.innerHTML = '';
    
    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center">No viewers yet</td></tr>';
      return;
    }
    
    data.forEach((viewer, index) => {
      const xpValue = days ? viewer.xp_period : viewer.xp;
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${index + 1}</td>
        <td style="color: ${viewer.name_color || '#fff'}">${viewer.username}</td>
        <td><span class="badge level-badge">Level ${viewer.level}</span></td>
        <td>${viewer.title || '-'}</td>
        <td>${xpValue.toLocaleString()} XP</td>
        <td>
          <div class="xp-bar-mini">
            <div class="xp-bar-fill" style="width: 75%"></div>
          </div>
        </td>
        <td>
          <button class="btn btn-sm btn-primary action-btn" data-action="viewDetails" data-username="${viewer.username}">
            Details
          </button>
        </td>
      `;
      tbody.appendChild(row);
    });
    
    // Setup event delegation for dynamically created buttons
    setupLeaderboardEventListeners();
  } catch (error) {
    console.error('Error loading leaderboard:', error);
  }
}

// Setup event listeners for leaderboard buttons
function setupLeaderboardEventListeners() {
  const tbody = document.getElementById('leaderboardTable');
  
  // Remove existing listener if any (to prevent duplicates)
  const newTbody = tbody.cloneNode(true);
  tbody.parentNode.replaceChild(newTbody, tbody);
  
  // Add event delegation
  document.getElementById('leaderboardTable').addEventListener('click', function(event) {
    const button = event.target.closest('button[data-action="viewDetails"]');
    if (button) {
      const username = button.getAttribute('data-username');
      viewDetails(username);
    }
  });
}

// Load XP actions
async function loadActions() {
  try {
    const response = await fetch('/api/viewer-xp/actions');
    const actions = await response.json();
    
    const tbody = document.getElementById('actionsTable');
    tbody.innerHTML = '';
    
    actions.forEach(action => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${action.action_type}</td>
        <td>
          <input type="number" class="form-control form-control-sm" 
            value="${action.xp_amount}" 
            data-action="${action.action_type}" 
            data-field="xp_amount">
        </td>
        <td>
          <input type="number" class="form-control form-control-sm" 
            value="${action.cooldown_seconds}" 
            data-action="${action.action_type}" 
            data-field="cooldown_seconds">
        </td>
        <td>
          <input type="checkbox" class="form-check-input" 
            ${action.enabled ? 'checked' : ''} 
            data-action="${action.action_type}" 
            data-field="enabled">
        </td>
        <td>
          <button class="btn btn-sm btn-success" data-action-type="${action.action_type}" data-save-action="true">
            Save
          </button>
        </td>
      `;
      tbody.appendChild(row);
    });
    
    // Setup event delegation for action buttons
    setupActionsEventListeners();
  } catch (error) {
    console.error('Error loading actions:', error);
  }
}

// Setup event listeners for action table buttons
function setupActionsEventListeners() {
  const tbody = document.getElementById('actionsTable');
  
  // Remove existing listener if any
  const newTbody = tbody.cloneNode(true);
  tbody.parentNode.replaceChild(newTbody, tbody);
  
  // Add event delegation
  document.getElementById('actionsTable').addEventListener('click', function(event) {
    const button = event.target.closest('button[data-save-action="true"]');
    if (button) {
      const actionType = button.getAttribute('data-action-type');
      updateAction(actionType);
    }
  });
}

// Load general settings
async function loadGeneralSettings() {
  try {
    const response = await fetch('/api/viewer-xp/settings');
    const settings = await response.json();
    
    document.getElementById('enableDailyBonus').checked = settings.enableDailyBonus;
    document.getElementById('enableStreaks').checked = settings.enableStreaks;
    document.getElementById('enableWatchTime').checked = settings.enableWatchTime;
    document.getElementById('watchTimeInterval').value = settings.watchTimeInterval;
    document.getElementById('announceLevelUps').checked = settings.announceLevel;
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

// Update action
async function updateAction(actionType) {
  const xpInput = document.querySelector(`input[data-action="${actionType}"][data-field="xp_amount"]`);
  const cooldownInput = document.querySelector(`input[data-action="${actionType}"][data-field="cooldown_seconds"]`);
  const enabledInput = document.querySelector(`input[data-action="${actionType}"][data-field="enabled"]`);
  
  try {
    await fetch(`/api/viewer-xp/actions/${actionType}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        xp_amount: parseInt(xpInput.value),
        cooldown_seconds: parseInt(cooldownInput.value),
        enabled: enabledInput.checked
      })
    });
    
    alert('Action updated successfully!');
  } catch (error) {
    console.error('Error updating action:', error);
    alert('Error updating action');
  }
}

// View viewer details
async function viewDetails(username) {
  const modal = new bootstrap.Modal(document.getElementById('viewerModal'));
  const body = document.getElementById('viewerModalBody');
  body.innerHTML = 'Loading...';
  modal.show();
  
  try {
    const response = await fetch(`/api/viewer-xp/stats/${username}`);
    const stats = await response.json();
    
    let html = `
      <h5>${stats.profile.username}</h5>
      <p><strong>Level:</strong> ${stats.profile.level} | <strong>Title:</strong> ${stats.profile.title || 'None'}</p>
      <p><strong>XP:</strong> ${stats.profile.xp.toLocaleString()} | <strong>Total Earned:</strong> ${stats.profile.total_xp_earned.toLocaleString()}</p>
      <p><strong>Streak:</strong> ${stats.profile.streak_days || 0} days</p>
      <p><strong>First Seen:</strong> ${new Date(stats.profile.first_seen).toLocaleString()}</p>
      <p><strong>Last Seen:</strong> ${new Date(stats.profile.last_seen).toLocaleString()}</p>
      
      <h6 class="mt-3">XP Breakdown</h6>
      <table class="table table-dark table-sm">
        <thead><tr><th>Action</th><th>Count</th><th>Total XP</th></tr></thead>
        <tbody>
    `;
    
    stats.actions.forEach(action => {
      html += `<tr><td>${action.action_type}</td><td>${action.count}</td><td>${action.total_xp}</td></tr>`;
    });
    
    html += '</tbody></table>';
    body.innerHTML = html;
  } catch (error) {
    console.error('Error loading viewer details:', error);
    body.innerHTML = 'Error loading details';
  }
}

// Event listeners
document.getElementById('leaderboardFilter').addEventListener('change', loadLeaderboard);

document.getElementById('generalSettingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  try {
    await fetch('/api/viewer-xp/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enableDailyBonus: document.getElementById('enableDailyBonus').checked,
        enableStreaks: document.getElementById('enableStreaks').checked,
        enableWatchTime: document.getElementById('enableWatchTime').checked,
        watchTimeInterval: parseInt(document.getElementById('watchTimeInterval').value),
        announceLevelUps: document.getElementById('announceLevelUps').checked
      })
    });
    
    alert('Settings saved successfully!');
  } catch (error) {
    console.error('Error saving settings:', error);
    alert('Error saving settings');
  }
});

document.getElementById('manualAwardForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  try {
    await fetch('/api/viewer-xp/award', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: document.getElementById('awardUsername').value,
        amount: parseInt(document.getElementById('awardAmount').value),
        reason: document.getElementById('awardReason').value
      })
    });
    
    alert('XP awarded successfully!');
    document.getElementById('manualAwardForm').reset();
    loadStats();
    loadLeaderboard();
  } catch (error) {
    console.error('Error awarding XP:', error);
    alert('Error awarding XP');
  }
});

// Tab change handlers
document.getElementById('settings-tab').addEventListener('shown.bs.tab', () => {
  loadActions();
  loadGeneralSettings();
});

// Initial load
loadStats();
loadLeaderboard();

// Auto-refresh stats
setInterval(loadStats, 30000);

// Listen for XP updates
socket.on('viewer-xp:update', () => {
  loadStats();
});

socket.on('viewer-xp:level-up', () => {
  loadLeaderboard();
});
