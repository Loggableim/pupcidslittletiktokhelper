# Stream Time Detection - Debug Guide

## Overview

The dashboard now includes comprehensive stream time detection that tries to extract the actual TikTok stream start time from various sources. This ensures the timer shows the real stream duration, not the software start time.

## Detection Methods (Priority Order)

The system tries multiple methods to find the stream start time:

### 1. RoomInfo Fields (Highest Priority)
When connecting to a TikTok stream, the API provides a `roomInfo` object that may contain timing information. The system checks:

**Top-level fields:**
- `start_time` - Official stream start time
- `startTime` - Camel case variant
- `create_time` - Room creation time (may differ from stream start)
- `createTime` - Camel case variant
- `liveStartTime` - Alternative field name
- `streamStartTime` - Alternative field name
- `duration` - If provided, calculates start time as (now - duration)

**Nested fields:**
- `roomInfo.room.start_time`, `roomInfo.room.createTime`, etc.
- `roomInfo.data.start_time`, `roomInfo.data.createTime`, etc.
- `roomInfo.common.create_time`, `roomInfo.common.createTime`

### 2. Event Timestamps (Fallback)
If roomInfo doesn't contain explicit time data, the system uses the `createTime` from the first TikTok event received (chat, gift, follow, etc.). This provides a reasonable estimate of when the stream started.

### 3. Connection Time (Last Resort)
If no time data is available, the system uses the connection time as a fallback. The timer will auto-correct when the first event is received.

## Debug Panel

The dashboard now includes a **Stream Time Debug Info** panel that shows:

- **Stream Start Time**: The exact timestamp when the stream started (ISO 8601 format)
- **Current Duration**: The calculated stream duration in HH:MM:SS format
- **Detection Method**: How the start time was detected (color-coded)
  - 🟢 Green: Detected from roomInfo fields (most accurate)
  - 🟠 Orange: Detected from event timestamps (good estimate)
  - 🔴 Red: Using connection time fallback (will auto-correct)

### Enabling Debug Panel

The debug panel automatically appears when you connect to a TikTok stream. It provides real-time information about:
1. Whether the system successfully detected the stream start time
2. Which API field or method was used
3. The current stream duration

## Advanced Debugging

### Enable RoomInfo Dump

To see the exact structure of the roomInfo object from TikTok's API:

1. Open Settings in the dashboard
2. Run this in the browser console:
   ```javascript
   fetch('/api/settings', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ key: 'tiktok_debug_roominfo', value: 'true' })
   })
   ```
3. Connect to a TikTok stream
4. Check `data/debug/roomInfo_<username>_<timestamp>.json` for the full structure

This helps identify:
- Available field names in the actual API response
- Nested structures that might contain time data
- New fields that TikTok may have added

### Console Logs

When connecting to a stream, the console shows:

```
🔍 [DEBUG] roomInfo keys available: id, owner, title, stats, ...
🔍 [DEBUG] roomInfo.room keys: ...
🔍 [DEBUG] roomInfo.data keys: ...
📅 ✅ Stream start time extracted from roomInfo.start_time: 2024-11-17T20:30:00.000Z
   ⏱️  Stream duration at connection: 1234s
```

If detection fails:
```
⚠️  Stream start time not found in roomInfo. Using current time as fallback.
💡 Possible reasons:
   1. Stream started before connection established
   2. TikTok API changed field names/structure
   3. Limited room data due to permissions/privacy
💡 The timer will auto-correct when first event is received (earliest event time)
```

## Troubleshooting

### Timer shows "00:00:00" even though stream is running
- **Cause**: Connection happened before stream started, or API didn't provide start time
- **Solution**: Wait for first event (chat, gift, etc.) - timer will auto-correct

### Timer shows wrong duration
- **Cause**: Detection method may be using wrong field
- **Solution**: 
  1. Check debug panel to see detection method
  2. Enable roomInfo dump (see above)
  3. Report the issue with the roomInfo structure

### Timer resets on reconnection
- **Cause**: Stream persistence isn't working
- **Solution**: This should not happen - the system persists stream start time across reconnections. If it does, please report as a bug.

## API Field Reference

Based on TikTok Live Connector v2.1.0, roomInfo typically contains:

```javascript
{
  // Time fields (what we're looking for)
  start_time: 1700000000,        // Unix timestamp (seconds)
  create_time: 1700000000,       // Room creation time
  
  // Alternative locations
  room: {
    start_time: 1700000000,
    create_time: 1700000000
  },
  
  // Other metadata
  id: "room_id",
  owner: { ... },
  title: "Stream title",
  stats: { ... }
}
```

## Event Timestamp Reference

All TikTok events include a `createTime` field:

```javascript
{
  createTime: "1700000000",  // Unix timestamp as string
  // ... event-specific data
}
```

The system automatically tracks the earliest event timestamp and uses it as a fallback if roomInfo doesn't provide explicit timing.

## Technical Details

### Timestamp Validation

All timestamps are validated:
- Must be after 2020-01-01 (to reject invalid/placeholder values)
- Must not be in the future (to reject invalid timestamps)
- Handles both seconds and milliseconds formats
- Handles both string and numeric formats

### Persistence

Stream start time is persisted across:
- WebSocket reconnections
- Network interruptions
- Temporary disconnects

It's only cleared when:
- Manually disconnecting
- Connecting to a different user
- Application restart

### Auto-Correction

If the initial detection uses connection time as fallback:
1. System monitors all incoming events
2. When first event arrives, extracts its createTime
3. Updates stream start time to earliest event time
4. Broadcasts updated info to dashboard
5. Debug panel updates to show new detection method

This ensures the timer eventually shows the correct duration even if initial detection failed.
