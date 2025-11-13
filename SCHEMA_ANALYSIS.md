# Database Schema Validation Report - Goals Plugin

## Executive Summary
The database schema in `plugins/goals/main.js` is well-structured with proper use of prepared statements for security. However, there are missing foreign key relationships and indexes that could improve data integrity and query performance.

---

## 1. TABLE STRUCTURE ANALYSIS

### A. goals_config Table (Lines 74-89)

**Structure:**
```
id                INTEGER PRIMARY KEY AUTOINCREMENT
goal_type         TEXT NOT NULL UNIQUE
enabled           INTEGER DEFAULT 1
name              TEXT NOT NULL
start_value       INTEGER DEFAULT 0
current_value     INTEGER DEFAULT 0
target_value      INTEGER DEFAULT 1000
progression_mode  TEXT DEFAULT 'fixed'
increment_amount  INTEGER DEFAULT 100
style_json        TEXT
created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP
```

**Validation Results:**

✅ GOOD:
- PRIMARY KEY with AUTOINCREMENT for unique identification
- UNIQUE constraint on goal_type prevents duplicate goal types
- NOT NULL constraints on critical fields (goal_type, name)
- DEFAULT values for boolean fields (enabled=1)
- Timestamp tracking (created_at, updated_at)
- TEXT columns allow flexibility for style_json

⚠️ ISSUES:
- NO FOREIGN KEY constraint (could reference goals_history)
- NO INDEX on goal_type (though UNIQUE adds some performance benefit)
- progression_mode TEXT doesn't validate against allowed values ('fixed', 'add', 'double', 'hide')
- start_value defaults to 0, which may not match all use cases

---

### B. goals_history Table (Lines 92-103)

**Structure:**
```
id         INTEGER PRIMARY KEY AUTOINCREMENT
goal_type  TEXT NOT NULL
event_type TEXT NOT NULL
old_value  INTEGER
new_value  INTEGER
delta      INTEGER
metadata   TEXT
timestamp  DATETIME DEFAULT CURRENT_TIMESTAMP
```

**Validation Results:**

✅ GOOD:
- Proper audit trail with old_value and new_value
- delta field for calculating changes
- metadata field allows flexible event-specific data
- timestamp with DEFAULT CURRENT_TIMESTAMP
- NULL-able value fields allow different event types

⚠️ ISSUES:
- NO FOREIGN KEY constraint on goal_type (should reference goals_config.goal_type)
- NO INDEX on goal_type (critical for filtering queries on line 929-935)
- NO INDEX on timestamp (would optimize ORDER BY timestamp queries)
- event_type TEXT doesn't validate against allowed values (should be: 'value_changed', 'target_changed')

---

### C. goals_tikfinity_config Table (Lines 106-115)

**Structure:**
```
id              INTEGER PRIMARY KEY CHECK (id = 1)
enabled         INTEGER DEFAULT 1
websocket_url   TEXT DEFAULT 'ws://localhost:21213'
auto_reconnect  INTEGER DEFAULT 1
created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
```

**Validation Results:**

✅ GOOD:
- CHECK constraint (id = 1) ensures single row (singleton pattern)
- Default websocket URL provided
- Boolean fields as INTEGER (0/1) consistent with rest of schema
- Created/updated timestamps

⚠️ ISSUES:
- websocket_url has no format/validation (could validate URL format)
- No backup mechanism if single row is deleted

---

## 2. DEFAULT GOALS SEEDING (Lines 137-224)

**Analysis:**

✅ GOOD:
- All 4 goal types properly initialized: 'coin', 'likes', 'follower', 'custom'
- Uses INSERT OR IGNORE pattern (safe, idempotent)
- Default styles are valid JSON
- Proper progression modes assigned:
  - 'coin' → mode: 'add' (good for accumulating)
  - 'likes' → mode: 'add' (good for streaming)
  - 'follower' → mode: 'add' (good for long-term)
  - 'custom' → mode: 'fixed' (allows manual management)
- Realistic default targets (1000 coins, 500 likes, 10 followers, 100 custom)

⚠️ ISSUES:
- Custom goal has increment_amount=0 (should probably be documented why)
- No validation that goal_type matches allowed types before insertion
- Label templates hardcoded in default goals (good) but changes would require code update

---

## 3. loadGoals() FUNCTION VERIFICATION (Lines 229-265)

**Analysis:**

✅ GOOD:
- Uses prepared statement: `db.prepare('SELECT * FROM goals_config')`
- No user input in SQL (safe from injection)
- Proper type conversion: `Boolean(row.enabled)` (line 241)
- Correctly maps snake_case to camelCase for JavaScript
- Calculates derived values:
  - percent: `calculatePercent(currentValue, targetValue)` (line 254)
  - remaining: `Math.max(0, targetValue - currentValue)` (line 255)
  - isCompleted: `currentValue >= targetValue` (line 256)
- Stores goals in Map for O(1) lookups by goalType
- Logs loading confirmation

⚠️ ISSUES:
- JSON.parse() on line 248 has NO error handling for malformed style_json
  - Recommendation: Use try-catch for JSON.parse():
    ```javascript
    try {
        goal.style = row.style_json ? JSON.parse(row.style_json) : {};
    } catch (error) {
        this.api.log(`Malformed style_json for ${row.goal_type}`, 'error');
        goal.style = {};
    }
    ```
- No check that loadGoals() returns exactly 4 goals
- Silent failure if database read fails (error caught but only logged)

---

## 4. SQL INJECTION VULNERABILITY ASSESSMENT

**All prepared statement usages (SAFE):**

| Line Range | Type | Pattern | Risk |
|-----------|------|---------|------|
| 205-209 | INSERT | INSERT ... VALUES (?, ?, ?) | ✅ SAFE |
| 232 | SELECT | No parameters | ✅ SAFE |
| 281 | SELECT | No parameters | ✅ SAFE |
| 430-435 | UPDATE | WHERE goal_type = ? | ✅ SAFE |
| 438-442 | INSERT | INSERT ... VALUES (?, ?, ?, ?, ?) | ✅ SAFE |
| 503-508 | UPDATE | WHERE goal_type = ? | ✅ SAFE |
| 540-545 | UPDATE | WHERE goal_type = ? | ✅ SAFE |
| 929-935 | SELECT | WHERE goal_type = ? LIMIT ? | ✅ SAFE |

**Dynamic query construction (Lines 738-767):**
```javascript
const allowedFields = ['name', 'start_value', 'target_value', 'progression_mode', 'increment_amount', 'enabled'];
for (const field of allowedFields) {
    if (updates[field] !== undefined) {
        updateFields.push(`${field} = ?`);
        updateValues.push(updates[field]);
    }
}
```
✅ SAFE - Uses whitelisting approach, placeholders for values

**Dynamic query construction (Lines 874-902):**
```javascript
if (enabled !== undefined) {
    updates.push('enabled = ?');
    values.push(enabled ? 1 : 0);
}
```
✅ SAFE - Field names are hardcoded in conditions, values parameterized

**RESULT: NO SQL INJECTION VULNERABILITIES FOUND**

---

## 5. DATA INTEGRITY ISSUES

### Missing Constraints:

1. **Foreign Key: goals_history → goals_config**
   - Impact: Orphaned history records if goal is deleted
   - Recommendation:
     ```sql
     ALTER TABLE goals_history 
     ADD CONSTRAINT fk_goal_type 
     FOREIGN KEY (goal_type) REFERENCES goals_config(goal_type)
     ON DELETE CASCADE;
     ```

2. **Missing Indexes:**
   - goals_history(goal_type) - needed for WHERE goal_type = ? queries
   - goals_history(timestamp) - needed for ORDER BY timestamp DESC queries
   - goals_config(goal_type) - redundant due to UNIQUE but good practice
   
   Recommendation:
   ```sql
   CREATE INDEX idx_goals_history_goal_type ON goals_history(goal_type);
   CREATE INDEX idx_goals_history_timestamp ON goals_history(timestamp DESC);
   ```

3. **Missing Check Constraint on progression_mode:**
   - Current: TEXT DEFAULT 'fixed' (no validation)
   - Should be: One of ('fixed', 'add', 'double', 'hide')
   - Recommendation: Add CHECK at table creation or application level

---

## 6. DATA TYPE CONSISTENCY

| Table | Field | Type | Issue |
|-------|-------|------|-------|
| goals_config | enabled | INTEGER | ⚠️ Should be BOOLEAN (SQLite 3.37+) or consistent |
| goals_history | old_value | INTEGER | ⚠️ Should allow NULL (correct) but type should match goal type |
| goals_config | style_json | TEXT | ⚠️ Should validate JSON structure |
| goals_tikfinity_config | websocket_url | TEXT | ⚠️ Should validate URL format |

---

## 7. SUMMARY OF ISSUES

### Critical Issues: NONE
All SQL injection vulnerabilities are properly mitigated with prepared statements.

### High Priority Issues:
1. Missing error handling for JSON.parse() in loadGoals() (line 248)
2. Missing foreign key constraint on goals_history.goal_type
3. Missing indexes on goals_history for query performance

### Medium Priority Issues:
1. No validation of progression_mode values at database level
2. No validation of event_type values at database level
3. No validation of websocket_url format

### Low Priority Issues:
1. Consider CHECK constraint for boolean fields consistency
2. Increment_amount=0 for custom goal should be documented
3. Default start_value=0 may not suit all goals

---

## 8. RECOMMENDATIONS

### Immediate Actions:
1. Add error handling for JSON.parse():
   ```javascript
   try {
       goal.style = row.style_json ? JSON.parse(row.style_json) : {};
   } catch (error) {
       this.api.log(`Invalid JSON in style_json for ${row.goal_type}`, 'error');
       goal.style = {};
   }
   ```

2. Add indexes to goals_history table for performance:
   ```sql
   CREATE INDEX idx_goals_history_goal_type ON goals_history(goal_type);
   CREATE INDEX idx_goals_history_timestamp ON goals_history(timestamp DESC);
   ```

### Future Enhancements:
1. Add CHECK constraint for progression_mode:
   ```sql
   ALTER TABLE goals_config ADD CHECK (progression_mode IN ('fixed', 'add', 'double', 'hide'));
   ```

2. Add CHECK constraint for event_type:
   ```sql
   ALTER TABLE goals_history ADD CHECK (event_type IN ('value_changed', 'target_changed'));
   ```

3. Consider enum-like validation at application level for user inputs

4. Add foreign key constraint with CASCADE delete:
   ```sql
   ALTER TABLE goals_history ADD CONSTRAINT fk_goal_type 
   FOREIGN KEY (goal_type) REFERENCES goals_config(goal_type) ON DELETE CASCADE;
   ```

