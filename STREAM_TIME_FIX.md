# Stream Time Fix Documentation

## Problem Description

The dashboard was showing the software start time instead of the actual TikTok stream duration. This happened because the `streamStartTime` was being set to `Date.now()` when the TikTok API roomInfo didn't contain the expected time fields.

## Latest Updates (2024-11-17)

### Enhanced Detection System
- ✅ Expanded field checking from 10 to 30+ possible field locations
- ✅ Added support for nested roomInfo structures (room, data, common objects)
- ✅ Added duration-based calculation support
- ✅ Comprehensive debug logging showing all available roomInfo keys
- ✅ Added detection method tracking
- ✅ Added visual debug panel in dashboard
- ✅ Optional roomInfo structure dump to JSON file
- ✅ Auto-correction when first event arrives

### Debug Features
See [STREAM_TIME_DEBUG.md](./STREAM_TIME_DEBUG.md) for complete debug guide including:
- How to interpret the debug panel
- How to dump roomInfo structure
- Troubleshooting common issues
- API field reference

## Root Causes

1. **Limited field checking**: Only 4 field names were being checked (`create_time`, `createTime`, `start_time`, `startTime`)
2. **No fallback mechanism**: If roomInfo didn't have these fields, it would fall back to current time
3. **No persistence**: Stream start time was reset on reconnection
4. **No event-based detection**: Didn't use event timestamps to estimate stream start

## Solution

### 1. Enhanced Field Detection

The `_extractStreamStartTime()` method now checks 10 different field names:
- `start_time` (priority 1 - most specific)
- `startTime`
- `create_time`
- `createTime`
- `finish_time`
- `finishTime`
- `liveStartTime`
- `live_start_time`
- `streamStartTime`
- `stream_start_time`

### 2. Event-Based Time Tracking

Added `trackEarliestEventTime()` helper function that:
- Extracts `createTime` from all incoming TikTok events
- Maintains `_earliestEventTime` as the earliest timestamp seen
- Uses this as a fallback when roomInfo doesn't have explicit start time
- Automatically sets stream start from first event if not already set

Events tracked:
- `chat`
- `gift`
- `follow`
- `share`
- `like`
- `subscribe`
- `roomUser`

### 3. Stream Start Time Persistence

Added `_persistedStreamStart` variable to:
- Store the stream start time when first detected
- Restore it on reconnection to the same stream
- Prevent timer reset during WebSocket reconnections
- Only clear when disconnecting permanently or changing streams

### 4. Robust Timestamp Validation

The extraction method now:
- Validates timestamps are not in the future
- Validates timestamps are not before 2020
- Handles both seconds and milliseconds timestamps
- Handles both string and numeric timestamps
- Converts seconds to milliseconds automatically

### 5. Improved Logging

Added comprehensive logging to help diagnose issues:
- Shows which roomInfo keys are available
- Indicates which field provided the start time
- Warns when using fallback methods
- Provides helpful hints for troubleshooting

## Code Changes

### modules/tiktok.js

1. **Constructor** - Added new tracking variables:
   ```javascript
   this._earliestEventTime = null;
   this._persistedStreamStart = null;
   ```

2. **connect()** - Added persistence logic:
   ```javascript
   if (this._persistedStreamStart && this.currentUsername === username) {
       this.streamStartTime = this._persistedStreamStart;
   } else {
       this.streamStartTime = this._extractStreamStartTime(state.roomInfo);
       this._persistedStreamStart = this.streamStartTime;
   }
   ```

3. **disconnect()** - Modified to preserve stream time:
   ```javascript
   // Only clear stream start time if not reconnecting to same stream
   if (previousUsername) {
       console.log(`🔄 Disconnected but preserving stream start time...`);
   } else {
       this.streamStartTime = null;
       this._persistedStreamStart = null;
       this._earliestEventTime = null;
   }
   ```

4. **registerEventListeners()** - Added event time tracking:
   ```javascript
   const trackEarliestEventTime = (data) => {
       if (data && data.createTime) {
           // Extract and validate timestamp
           // Update _earliestEventTime if earlier
           // Set streamStartTime if not already set
       }
   };
   ```

5. **_extractStreamStartTime()** - Enhanced with:
   - 10 field names instead of 4
   - Timestamp validation (range check)
   - String/numeric handling
   - Fallback to earliest event time
   - Detailed logging

## Testing

### Test Coverage

Created `test-stream-time-fix.js` with 7 comprehensive tests:

1. ✅ roomInfo with `start_time` (seconds)
2. ✅ roomInfo with `createTime` (milliseconds)
3. ✅ roomInfo with string timestamp
4. ✅ Empty roomInfo (fallback to current time)
5. ✅ Invalid future timestamp (rejected)
6. ✅ Earliest event time fallback
7. ✅ Field priority (start_time > createTime)

All tests passing!

### Manual Testing Scenarios

To test in production:

**Scenario 1: Connect during live stream**
- Expected: Stream duration shows actual time since stream started
- Check: roomInfo logs show which field provided the time

**Scenario 2: Connect before stream starts**
- Expected: Timer shows 0 until stream actually starts
- Check: First event sets the start time

**Scenario 3: WebSocket reconnection**
- Expected: Timer continues from where it left off
- Check: Logs show "Restored persisted stream start time"

**Scenario 4: Stream ends and new stream starts**
- Expected: Timer resets for new stream
- Check: New stream gets new start time

## API Fields Reference

### TikTok API roomInfo Structure

Based on tiktok-live-connector library, roomInfo may contain:

```javascript
{
    // Possible time fields (varies by API version):
    start_time: "1700000000",     // Unix timestamp in seconds
    startTime: 1700000000,        // Unix timestamp in seconds
    create_time: "1700000000",    // Room creation time (may differ from stream start)
    createTime: 1700000000,       // Room creation time
    finish_time: "1700000000",    // Stream end time (if ended)
    finishTime: 1700000000,       // Stream end time
    
    // Other metadata:
    id: "12345",
    status: 2,                    // 2 = live, 4 = ended
    title: "Stream title",
    owner: { ... },
    stats: { ... }
}
```

### Event createTime Field

All TikTok events include a `createTime` field:

```javascript
{
    createTime: "1700000000",  // Unix timestamp in seconds (string)
    // ... other event data
}
```

## Compatibility

- ✅ Works with tiktok-live-connector v2.1.0+
- ✅ Handles old and new API field names
- ✅ Backwards compatible (falls back gracefully)
- ✅ No breaking changes to existing code

## Future Improvements

Potential enhancements:

1. **Database Persistence**: Store stream start time in database for recovery after restart
2. **Stream Session Tracking**: Track multiple stream sessions per day
3. **Statistics**: Track average stream duration, total streaming time
4. **API Field Discovery**: Auto-detect new field names from actual API responses
5. **Stream State Detection**: Better detection of stream start/end events

## Troubleshooting

### Timer shows wrong duration

Check logs for:
```
📅 ✅ Stream start time extracted from roomInfo.{field}
```

If you see:
```
⚠️  Stream start time not found in roomInfo
```

Possible causes:
1. Stream started before connection
2. TikTok API changed field names
3. Limited room data (permissions issue)
4. Stream not actually live

Solutions:
- Check which field names are available in logs
- Update field list if new names discovered
- Verify stream is actually live
- Try reconnecting

### Timer resets on reconnection

Check for:
```
♻️  Restored persisted stream start time
```

If not present:
- Check that reconnection is to same username
- Verify _persistedStreamStart is not null
- Check disconnect() isn't clearing the value

### Timer starts from current time

This is expected behavior when:
- No roomInfo available
- No events received yet
- All time fields are missing/invalid

The timer will correct itself when first event arrives.

## References

- TikTok Live Connector: https://github.com/zerodytrash/TikTok-Live-Connector
- Issue: "echte Streamzeit" - Display real TikTok stream duration
- Test file: `test-stream-time-fix.js`
