# Euler Backup Key Notifier - Testing Guide

## Overview
This feature implements a 10-second non-dismissible warning popup when a user attempts to connect to TikTok Live using the Euler backup API key. The warning appears BEFORE the connection is established.

## What Was Implemented

### 1. Backend Changes (`modules/tiktok.js`)
- Added `EULER_BACKUP_KEY` constant: `euler_NTI1MTFmMmJkZmE2MTFmODA4Njk5NWVjZDA1NDk1OTUxZDMyNzE0NDIyYzJmZDVlZDRjOWU2`
- Added detection logic that checks if the configured API key matches the Euler backup key
- When detected:
  - Logs warning messages to the console
  - Emits `euler-backup-key-warning` event to the frontend
  - **Waits 10 seconds before establishing the WebSocket connection**
  - Logs completion message after the delay

### 2. Frontend Changes (`public/js/dashboard.js`)
- Added socket listener for `euler-backup-key-warning` event
- Implemented `showEulerBackupKeyWarning()` function that displays:
  - **Non-dismissible overlay** (cannot be clicked away or closed)
  - Red/alert color scheme for high visibility
  - Large countdown timer showing remaining seconds (10, 9, 8, ...)
  - Warning message in German explaining the backup key is for emergency use only
  - Link to https://www.eulerstream.com to get a free API key
  - Clear message: "⚠️ Dieses Fenster kann nicht geschlossen werden ⚠️"

## How to Test

### Automated Tests
Run the automated test suite:
```bash
node test-euler-backup-key-warning.js
```

This will verify:
- ✅ EULER_BACKUP_KEY constant is defined
- ✅ Detection logic exists
- ✅ 10-second delay is implemented
- ✅ Warning event is emitted
- ✅ Frontend handler exists
- ✅ Popup is non-dismissible
- ✅ Countdown timer works

### Manual Testing

#### Step 1: Configure the Euler Backup Key
1. Start the application: `npm start`
2. Open the dashboard in your browser (usually http://localhost:3000)
3. Go to Settings
4. Set the "TikTok Euler API Key" to: `euler_NTI1MTFmMmJkZmE2MTFmODA4Njk5NWVjZDA1NDk1OTUxZDMyNzE0NDIyYzJmZDVlZDRjOWU2`
5. Save the settings

#### Step 2: Test the Warning
1. On the dashboard, enter a TikTok username (e.g., "tiktok")
2. Click "Connect"
3. You should immediately see:
   - A **full-screen dark red overlay** appears
   - Large 🚨 emoji at the top
   - "EULER BACKUP KEY ERKANNT" heading
   - Warning text explaining this is for emergency use only
   - A large countdown timer starting at 10 seconds
   - Text: "⚠️ Dieses Fenster kann nicht geschlossen werden ⚠️"

4. **Verify non-dismissible behavior**:
   - Try clicking anywhere on the overlay → Nothing should happen
   - Try pressing ESC → Nothing should happen
   - The overlay should remain for the full 10 seconds

5. **After 10 seconds**:
   - The overlay should fade out and disappear
   - The connection to TikTok Live should be established
   - Normal event logging should begin

#### Step 3: Check Console Logs
In the server console, you should see:
```
⚠️  EULER BACKUP KEY DETECTED - Connection will be delayed by 10 seconds
⚠️  Please get your own free API key at https://www.eulerstream.com
⏳ Waiting 10 seconds before establishing connection...
✅ Delay complete, proceeding with connection
🔧 Connecting to Eulerstream WebSocket...
```

## Expected Behavior

### Timeline of Events:
1. **t=0s**: User clicks "Connect"
2. **t=0s**: Backend detects Euler backup key
3. **t=0s**: Warning popup appears on frontend with countdown at 10
4. **t=0-10s**: Countdown decreases every second (10, 9, 8, 7, ...)
5. **t=10s**: Backend establishes WebSocket connection
6. **t=10s**: Warning popup fades out
7. **t=10s+**: Normal connection established, events flow

### Key Features:
- ✅ Warning appears **before** connection is established
- ✅ Connection is **delayed by exactly 10 seconds**
- ✅ Popup is **non-dismissible** during the countdown
- ✅ User cannot skip or close the warning
- ✅ Clear message about getting their own free API key
- ✅ Automatic removal after 10 seconds

## Comparison with Fallback Key Warning

This is **different** from the existing fallback key warning:
- **Fallback key** (`euler_MmE2...`): Shows a regular yellow warning that can be closed
- **Euler backup key** (`euler_NTI1...`): Shows a RED non-dismissible warning that blocks for 10 seconds

## Testing with Different Keys

### Test Case 1: No API Key (Uses Fallback)
- Expected: Yellow fallback warning (dismissible)
- Connection: Immediate

### Test Case 2: Custom User API Key
- Expected: No warning
- Connection: Immediate

### Test Case 3: Euler Backup Key
- Expected: **RED non-dismissible warning with 10-second delay**
- Connection: **After 10 seconds**

## Troubleshooting

### Warning doesn't appear
- Check that the API key is exactly: `euler_NTI1MTFmMmJkZmE2MTFmODA4Njk5NWVjZDA1NDk1OTUxZDMyNzE0NDIyYzJmZDVlZDRjOWU2`
- Check browser console for JavaScript errors
- Verify socket.io connection is working

### Connection happens immediately
- Verify the backend code has the delay: `await new Promise(resolve => setTimeout(resolve, 10000))`
- Check server logs to confirm key detection

### Popup can be dismissed
- This would indicate a bug - the overlay should prevent all clicks
- Check that `user-select: none` is applied
- Check that click event handler has `e.preventDefault()`

## Security Considerations

✅ **No security vulnerabilities detected** by CodeQL scanner
- No hardcoded credentials exposed (API keys are expected to be visible)
- No XSS vulnerabilities (all text is properly escaped)
- No SQL injection risks (no database queries in this feature)
- No unauthorized access (feature only controls connection timing)

## Files Modified

1. **modules/tiktok.js** (+24 lines)
   - Added EULER_BACKUP_KEY constant
   - Added detection and delay logic

2. **public/js/dashboard.js** (+136 lines)
   - Added socket listener
   - Added showEulerBackupKeyWarning() function

3. **test-euler-backup-key-warning.js** (+159 lines)
   - Comprehensive test suite
   - 11 automated tests

**Total Changes**: +319 lines across 3 files
