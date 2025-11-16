const DatabaseManager = require('./modules/database');
const path = require('path');

const dbPath = path.join(__dirname, 'user_configs', 'default.db');
const dbManager = new DatabaseManager(dbPath);

console.log('DatabaseManager created');
console.log('Has prepare method:', typeof dbManager.prepare === 'function');
console.log('Has exec method:', typeof dbManager.exec === 'function');

// Test exec method
try {
    const result = dbManager.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='goals'`);
    console.log('exec() works:', true);
} catch (error) {
    console.error('exec() error:', error.message);
}

// Test prepare method
try {
    const stmt = dbManager.prepare('SELECT * FROM goals');
    const goals = stmt.all();
    console.log('prepare() works:', true);
    console.log('Goals count:', goals.length);
} catch (error) {
    console.error('prepare() error:', error.message);
}

// Test insert
const id = `goal_test_${Date.now()}`;
try {
    const stmt = dbManager.prepare(`
        INSERT INTO goals (
            id, name, goal_type, enabled, current_value, target_value, start_value,
            template_id, animation_on_update, animation_on_reach,
            on_reach_action, on_reach_increment, theme_json,
            overlay_width, overlay_height
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
        id, 'Test Goal via Manager', 'custom', 1, 0, 1000, 0,
        'compact-bar', 'smooth-progress', 'celebration',
        'hide', 100, null,
        500, 100
    );
    console.log('Insert via manager - changes:', result.changes);
    
    // Read back
    const getStmt = dbManager.prepare('SELECT * FROM goals WHERE id = ?');
    const goal = getStmt.get(id);
    console.log('Goal retrieved:', goal ? goal.name : 'Not found');
} catch (error) {
    console.error('Insert error:', error.message);
}

dbManager.close();
