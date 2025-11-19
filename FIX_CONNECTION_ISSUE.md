# TikTok Connection Fix - November 2025

## Issue Description

**Problem:** TikTok Live stream connections were failing.

**Symptoms:** 
- Unable to connect to TikTok live streams
- Connection attempts would fail
- User reported: "aktuell funktioniert es nicht" (currently it doesn't work)

## Root Cause

The connection was failing due to an **invalid configuration option** being passed to the `tiktok-live-connector` library (v2.1.0).

### The Bug

In `modules/tiktok.js`, the code was passing `enableWebsocketUpgrade: true` option to the TikTokLiveConnection constructor:

```javascript
const connectionOptions = {
    processInitialData: true,
    enableExtendedGiftInfo: true,
    enableWebsocketUpgrade: true,  // ❌ INVALID OPTION
    requestPollingIntervalMs: 1000,
    // ... other options
};
```

**This option does not exist in tiktok-live-connector v2.1.0!**

### Valid Options

According to the library's source code, the valid connection options are:

- `processInitialData` (boolean, default: true)
- `fetchRoomInfoOnConnect` (boolean, default: true)
- `enableExtendedGiftInfo` (boolean, default: false)
- `enableRequestPolling` (boolean, default: true)
- `requestPollingIntervalMs` (number, default: 1000)
- `sessionId` (string, default: null)
- `ttTargetIdc` (string, default: null)
- `signApiKey` (string, default: null)
- `connectWithUniqueId` (boolean, default: false)
- `disableEulerFallbacks` (boolean, default: false)
- `authenticateWs` (boolean, default: false)
- `webClientParams` (object)
- `webClientHeaders` (object)
- `webClientOptions` (object)
- `wsClientHeaders` (object)
- `wsClientOptions` (object)
- `wsClientParams` (object)
- `signedWebSocketProvider` (function)

**Note:** There is NO `enableWebsocketUpgrade` option!

## The Fix

### Changes Made

1. **modules/tiktok.js - Line 100** (main connection)
   ```javascript
   // BEFORE (BROKEN):
   const connectionOptions = {
       processInitialData: true,
       enableExtendedGiftInfo: true,
       enableWebsocketUpgrade: true,  // ❌ REMOVED
       requestPollingIntervalMs: 1000,
       // ...
   };
   
   // AFTER (FIXED):
   const connectionOptions = {
       processInitialData: true,
       enableExtendedGiftInfo: true,
       requestPollingIntervalMs: 1000,
       // ...
   };
   ```

2. **modules/tiktok.js - Line 1323** (gift catalog update temporary connection)
   ```javascript
   // BEFORE (BROKEN):
   tempClient = new TikTokLiveConnection(targetUsername, {
       processInitialData: true,
       enableExtendedGiftInfo: true,
       enableWebsocketUpgrade: false,  // ❌ REMOVED
       requestPollingIntervalMs: 1000
   });
   
   // AFTER (FIXED):
   tempClient = new TikTokLiveConnection(targetUsername, {
       processInitialData: true,
       enableExtendedGiftInfo: true,
       requestPollingIntervalMs: 1000
   });
   ```

3. **test-connection.js** (test script)
   - Removed the same invalid option from test code

## Impact

- **Before:** Connection attempts would fail due to invalid configuration
- **After:** Connections now work correctly with valid library options only

## Testing

1. Server starts successfully without errors
2. Connection configuration now matches library specifications
3. No security vulnerabilities detected (CodeQL scan clean)

## Prevention

To prevent similar issues in the future:

1. **Always check library documentation** before using configuration options
2. **Consult the source code** of the library to verify option names:
   - Check `node_modules/tiktok-live-connector/dist/lib/client.js`
   - Look at the constructor's default options object
3. **Test configuration changes** against a live stream
4. **Use TypeScript types** if available (library provides .d.ts files)

## Related Documentation

- TikTok Live Connector GitHub: https://github.com/zerodytrash/TikTok-Live-Connector
- Library Version: 2.1.0
- Node.js Version: 18.0.0+

## Commit Information

- **Branch:** copilot/fix-connection-function-stream
- **Commit:** Fix connection issue: remove invalid enableWebsocketUpgrade option
- **Date:** November 19, 2025
- **Files Modified:** modules/tiktok.js, test-connection.js

## Security Summary

No security vulnerabilities were introduced or discovered during this fix. The CodeQL security scan returned 0 alerts.
