const Database = require('better-sqlite3');
const path = require('path');

// Simulate the exact setup
const dbPath = path.join(__dirname, 'user_configs', 'default.db');
console.log('Database path:', dbPath);

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Check if goals table exists
const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='goals'").get();
console.log('Goals table exists:', !!tableExists);

// Try to insert a goal
const id = `goal_test_${Date.now()}`;
const stmt = db.prepare(`
    INSERT INTO goals (
        id, name, goal_type, enabled, current_value, target_value, start_value,
        template_id, animation_on_update, animation_on_reach,
        on_reach_action, on_reach_increment, theme_json,
        overlay_width, overlay_height
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

try {
    const result = stmt.run(
        id, 'Test Goal', 'custom', 1, 0, 1000, 0,
        'compact-bar', 'smooth-progress', 'celebration',
        'hide', 100, null,
        500, 100
    );
    console.log('Insert result:', result);
    console.log('Changes:', result.changes);
    
    // Try to read it back immediately
    const getStmt = db.prepare('SELECT * FROM goals WHERE id = ?');
    const goal = getStmt.get(id);
    console.log('Retrieved goal:', goal ? 'Found' : 'Not found');
    if (goal) {
        console.log('Goal name:', goal.name);
    }
    
    // Check all goals
    const allStmt = db.prepare('SELECT * FROM goals');
    const all = allStmt.all();
    console.log('Total goals in database:', all.length);
    
} catch (error) {
    console.error('Error:', error.message);
}

db.close();
