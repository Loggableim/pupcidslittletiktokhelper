# Coin Calculation Fix Documentation

## Problem Statement

The application had multiple critical bugs where TikTok gift coins were being calculated incorrectly across various plugins and modules. The main issue was that plugins were using `data.diamondCount` (the raw diamond value per individual gift) instead of `data.coins` (the correctly calculated total value: `diamondCount * 2 * repeatCount`).

### Example of the Bug

When a user sent "Rose x10":
- **Correct calculation**: 1 diamond * 2 * 10 repeats = **20 coins**
- **Incorrect calculation**: Just using `diamondCount` = **1 coin** (50x too low!)

## Root Cause Analysis

The TikTok Live Connector library emits gift events with the following structure:

```javascript
{
  gift: {
    id: 5655,
    name: 'Rose',
    diamond_count: 1  // Diamonds per individual gift
  },
  repeatCount: 10,     // How many gifts in the combo/streak
  repeatEnd: true,     // Whether the streak has ended
  giftType: 1         // 0 = normal, 1 = streakable
}
```

### Coin Calculation Formula

The correct formula is:
```
coins = diamondCount * 2 * repeatCount
```

Where:
- `diamondCount` = Number of diamonds per individual gift
- `2` = Conversion rate from diamonds to coins (TikTok standard)
- `repeatCount` = Number of gifts in the combo/streak

### Streakable Gifts

For streakable gifts (giftType === 1), the event is emitted multiple times during the streak:
1. First gift: `repeatCount=1, repeatEnd=false`
2. Subsequent gifts: `repeatCount=N, repeatEnd=false`
3. Final gift: `repeatCount=N, repeatEnd=true`

**Important**: Coins should only be counted when `repeatEnd === true` for streakable gifts.

## Fixed Modules

### 1. Goals Plugin (`plugins/goals/backend/event-handlers.js`)

**Before:**
```javascript
const coins = data.diamondCount || 0;  // WRONG: Uses raw diamond count
```

**After:**
```javascript
const coins = data.coins || 0;  // CORRECT: Uses pre-calculated coins
```

### 2. ClarityHUD Plugin (`plugins/clarityhud/backend/api.js`)

**Before:**
```javascript
coins: data.diamondCount || 0  // WRONG: Multiple places
```

**After:**
```javascript
coins: data.coins || 0  // CORRECT: Uses pre-calculated coins
```

### 3. Multicam Plugin (`plugins/multicam/main.js`)

**Before:**
```javascript
const { diamondCount } = data;
const coins = diamondCount || 0;  // WRONG
```

**After:**
```javascript
const coins = data.coins || 0;  // CORRECT
```

### 4. Viewer-XP Plugin (`plugins/viewer-xp/main.js`)

**Before:**
```javascript
const coins = data.gift?.diamond_count || 0;  // WRONG: Nested diamond count
```

**After:**
```javascript
const coins = data.coins || 0;  // CORRECT
```

### 5. API Bridge Plugin (`plugins/api-bridge/main.js`)

**Before:**
```javascript
amount: data.giftCount,  // WRONG: Should be repeatCount
totalDiamonds: data.giftCount * data.diamondCount
// Missing coins field
```

**After:**
```javascript
amount: data.repeatCount || 1,  // CORRECT
totalDiamonds: (data.repeatCount || 1) * data.diamondCount,
coins: data.coins || 0  // Added coins field
```

### 6. LastEvent Spotlight Plugin (`plugins/lastevent-spotlight/main.js`)

**Before:**
```javascript
coins: data.coins || data.diamondCount  // RISKY: Falls back to wrong value
```

**After:**
```javascript
coins: data.coins || 0  // SAFE: Only uses correct value
```

## Enhanced Debug Logging

Added comprehensive debug logging to `modules/tiktok.js`:

```javascript
// Raw event structure logging
console.log(`🔍 [RAW GIFT EVENT]`, {
  hasGift: !!data.gift,
  hasRepeatCount: data.repeatCount !== undefined,
  hasRepeatEnd: data.repeatEnd !== undefined,
  hasDiamondCount: data.diamondCount !== undefined,
  giftType: data.giftType,
  rawRepeatCount: data.repeatCount,
  rawRepeatEnd: data.repeatEnd,
  rawDiamondCount: data.diamondCount
});

// Calculation logging
console.log(`🎁 [GIFT CALC] ${giftName}: diamondCount=${diamondCount}, repeatCount=${repeatCount}, coins=${coins}, giftType=${giftType}, repeatEnd=${repeatEnd}`);

// Streak status logging
if (shouldCount) {
  console.log(`✅ [GIFT COUNTED] Total coins now: ${totalCoins}`);
} else {
  console.log(`⏳ [STREAK RUNNING] ${giftName} x${repeatCount} (${coins} coins, not counted yet)`);
}
```

## Testing

Created comprehensive test suite in `test-coin-calculation.js` with 5 test cases:

1. ✅ Rose x1 (Non-streakable) → 2 coins
2. ✅ Rose x10 (Streakable, not ended) → 20 coins (not counted)
3. ✅ Rose x10 (Streakable, ended) → 20 coins (counted)
4. ✅ Heart Me x5 → 100 coins
5. ✅ Perfume x3 → 120 coins

All tests pass.

## Impact

This fix ensures that:
- **Goals System**: Coin goals increment by the correct amount
- **Dashboard**: Total coins display accurately
- **Leaderboard**: User coin totals are correct
- **Plugins**: All plugins receive consistent coin values
- **IFTTT/Flows**: Triggers based on coin thresholds work correctly
- **Alerts**: Gift alerts show correct coin values

## Migration Notes

**No database migration needed** - the bug only affected new events, not historical data. However, historical coin counts in the database may be incorrect and could be cleaned up if needed.

## Verification

To verify the fix is working:

1. Run test suite: `node test-coin-calculation.js`
2. Connect to a TikTok stream and watch console for debug logs
3. Send test gifts and verify coins are calculated correctly
4. Check dashboard total coins matches sum of all gifts * 2 * repeat count

## Related Files

- `modules/tiktok.js` - Main gift event handler with coin calculation
- `plugins/goals/backend/event-handlers.js` - Goals plugin gift handler
- `plugins/clarityhud/backend/api.js` - ClarityHUD gift display
- `plugins/multicam/main.js` - Multicam gift mapping
- `plugins/viewer-xp/main.js` - XP tier calculation
- `plugins/api-bridge/main.js` - External API bridge
- `plugins/lastevent-spotlight/main.js` - Last event overlay
- `test-coin-calculation.js` - Test suite
