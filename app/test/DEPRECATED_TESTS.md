# Test Deprecation Notice

## ⚠️ Deprecated Tests

The following test files test modules that have been deprecated as part of the TikTok connection system refactoring:

### Deprecated Test Files

1. **room-id-resolver.test.js**
   - Tests the deprecated `RoomIdResolver` module
   - Room ID resolution is now handled by the official tiktok-live-connector library
   - No replacement needed - library handles this internally

2. **http-client-enhancer.test.js**
   - Tests the deprecated `HttpClientEnhancer` module
   - HTTP client configuration is now done via `webClientOptions` in connection options
   - No replacement needed - library handles this internally

3. **tiktok-error-handling.test.js**
   - Tests error handling that relied on custom modules
   - Error handling is now simplified and uses library error patterns
   - Partially valid - error analysis is still present but simplified

## What To Do

These tests are kept for historical reference but **should not be run** as they test deprecated functionality.

### For Developers

If you need to test the connection system:

1. Use integration tests with real TikTok streams (when available)
2. Test the simplified error handling in `tiktok.js`
3. Verify connection options are passed correctly to the library

### Recommended Testing Approach

Instead of unit testing deprecated modules, test the integration:

```javascript
// Test connection with different modes
const tests = [
  {
    name: 'Connect with HTML scraping mode',
    config: {
      connectWithUniqueId: false,
      disableEulerFallbacks: false
    }
  },
  {
    name: 'Connect with Euler Stream mode',
    config: {
      connectWithUniqueId: true,
      disableEulerFallbacks: false
    }
  },
  {
    name: 'Connect with pure HTML mode',
    config: {
      connectWithUniqueId: false,
      disableEulerFallbacks: true
    }
  }
];
```

## See Also

- `TIKTOK_CONNECTION_REFACTORING_V2.md` - Full documentation of the refactoring
- `modules/tiktok.js` - The refactored connection module
- [TikTok-Live-Connector Documentation](https://github.com/zerodytrash/TikTok-Live-Connector)
