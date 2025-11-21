# TikTok TTS Engine Fix Documentation

## ✅ WORKING SOLUTION (November 2024)

**TikTok TTS works!** It requires SessionID authentication (like TikFinity uses).

### Quick Setup

1. Get SessionID from TikTok cookies (see below)
2. Set `TIKTOK_SESSION_ID` environment variable
3. Restart application - TTS works!

**Full instructions**: See `plugins/tts/engines/TIKTOK_TTS_STATUS.md`

---

## How to Get SessionID

1. Log in to https://www.tiktok.com in your browser
2. Press F12 → Application/Storage → Cookies → tiktok.com
3. Find `sessionid` cookie and copy its value
4. Add to .env: `TIKTOK_SESSION_ID=your_session_id_here`

## Original Problem (Solved)

The TikTok TTS (Text-to-Speech) engine was failing with errors because it lacked authentication.

```
2025-11-21 11:49:39 [error]: TTS engine tiktok failed: All TikTok TTS endpoints failed. Last error: Request failed with status code 500
```

## Solution

Implemented SessionID authentication for TikTok TTS API access (matching TikFinity's approach):

### 1. SessionID Authentication

**Working Endpoints** (with SessionID) - Updated November 2025:

Primary endpoints (most commonly working):
- `https://api16-normal-v6.tiktokv.com/media/api/text/speech/invoke/`
- `https://api16-normal-c-useast1a.tiktokv.com/media/api/text/speech/invoke/`
- `https://api19-normal-c-useast1a.tiktokv.com/media/api/text/speech/invoke/`
- `https://api16-normal-useast5.us.tiktokv.com/media/api/text/speech/invoke/`
- `https://api22-normal-c-alisg.tiktokv.com/media/api/text/speech/invoke/`

Backup endpoints:
- `https://api16-core-c-useast1a.tiktokv.com/media/api/text/speech/invoke/`
- `https://api19-core-c-useast1a.tiktokv.com/media/api/text/speech/invoke/`
- `https://api16-core-useast5.us.tiktokv.com/media/api/text/speech/invoke/`
- `https://api22-core-c-alisg.tiktokv.com/media/api/text/speech/invoke/`

**Note**: TikTok rotates between "normal" and "core" variants. The engine tries both types automatically.

**Authentication Method**:
```javascript
headers: {
  'Cookie': `sessionid=${TIKTOK_SESSION_ID}`,
  'Content-Type': 'application/x-www-form-urlencoded',
  'User-Agent': 'com.zhiliaoapp.musically/2023400040 (Android 13)'
}
```

## Key Improvements

### Endpoint Rotation
The engine automatically rotates through all available endpoints when failures occur:
1. Try first proxy service
2. If fails, try second proxy service
3. If fails, try first official TikTok API
4. If fails, try second official TikTok API
5. Repeat cycle if all fail

### Response Format Handling
Supports multiple response formats:

**Weilnet Format:**
```json
{
  "success": true,
  "data": "base64_encoded_audio..."
}
```

**TikAPI Format:**
```json
{
  "audio": "base64_encoded_audio..."
}
```

**Official TikTok Format:**
```json
{
  "status_code": 0,
  "data": {
    "v_str": "base64_encoded_audio..."
  }
}
```

### Text Chunking
Automatically splits text longer than 300 characters into chunks:
- Splits by sentences first (. ! ?)
- Falls back to word splitting if sentence too long
- **Note:** Currently only returns first chunk (limitation)
- Users receive warning to keep messages under 300 chars

### Error Handling
- Clear logging of which endpoint type failed
- Tracks all attempted endpoints
- Provides specific error messages
- Automatic retry with backoff

## Configuration

No configuration changes required. The engine will automatically try all endpoints.

## Available Voices

All existing TikTok voices remain available:

### English Characters
- `en_us_ghostface` - Ghostface (Scream)
- `en_us_stormtrooper` - Stormtrooper
- `en_us_c3po` - C3PO
- `en_us_stitch` - Stitch
- And more...

### Standard Voices
- `en_us_001` - US Female 1 (default)
- `en_us_006` - US Male 1
- `de_001` - German Male
- `de_002` - German Female
- See full list in `plugins/tts/engines/tiktok-engine.js`

## Usage

No changes to existing TTS plugin usage. The engine update is transparent to users:

```javascript
const engine = new TikTokEngine(logger);
const audioBase64 = await engine.synthesize('Hello world', 'en_us_001');
```

## Known Limitations

1. **Long Text Handling**: Messages over 300 characters are split, but only the first chunk is returned
   - **Workaround**: Keep TTS messages under 300 characters
   - **Future**: Implement proper MP3 concatenation

2. **Network Dependency**: Requires internet access to TikTok/proxy endpoints
   - Multiple endpoints provide redundancy
   - If all fail, error is thrown

3. **Rate Limiting**: Public endpoints may have rate limits
   - Automatic rotation helps distribute load
   - Consider adding delays between requests if hitting limits

## Troubleshooting

### All Endpoints Still Failing

Check logs to see which endpoints were tried:
```
[ERROR] Tried endpoints: proxy:https://..., official:https://...
```

Possible causes:
1. Network connectivity issues
2. All proxy services down simultaneously (unlikely with 4 endpoints)
3. TikTok changed API format (would need code update)
4. Firewall blocking TikTok domains

### Partial Audio Playback

If text is being cut off, check for chunking warnings:
```
[WARN] Text was split into X chunks. Only the first chunk will be returned.
[WARN] For best results, keep TTS messages under 300 characters.
```

**Solution**: Keep messages shorter or implement custom chunking logic in the TTS plugin itself.

## Technical Details

### Request Flow
```
User Message
    ↓
TTS Plugin
    ↓
TikTokEngine.synthesize()
    ↓
_splitTextIntoChunks() → [chunk1, chunk2, ...]
    ↓
_synthesizeChunk(chunk1)
    ↓
Try Endpoint 1 (proxy) → Fail
    ↓
Try Endpoint 2 (proxy) → Fail
    ↓
Try Endpoint 3 (official) → Success!
    ↓
Return base64 audio
```

### Endpoint Selection Algorithm
```javascript
currentEndpointIndex = 0;  // Start with first endpoint

for each endpoint attempt {
  endpoint = apiEndpoints[currentEndpointIndex];
  
  for each retry {
    try {
      result = makeRequest(endpoint);
      if (success) return result;
    } catch {
      log error, continue;
    }
  }
  
  // Rotate to next endpoint
  currentEndpointIndex = (currentEndpointIndex + 1) % totalEndpoints;
}

throw "All endpoints failed";
```

## References

- TikTok-Chat-Reader: https://github.com/zerodytrash/TikTok-Chat-Reader
- Weilbyte TTS: https://github.com/Weilbyte/tiktok-tts
- TTS Voice Wizard Docs: https://ttsvoicewizard.com/docs/TTSMethods/Tiktok
- Community TikTok TTS Projects:
  - https://github.com/oscie57/tiktok-voice
  - https://github.com/agusibrahim/tiktok-tts-api

## Future Enhancements

1. **Audio Concatenation**: Properly join multiple audio chunks
   - Decode base64 → MP3 binary
   - Concatenate MP3 files (using ffmpeg or audio library)
   - Re-encode to base64
   
2. **Session-Based Authentication**: Add support for TikTok session IDs
   - Would enable more reliable access to official API
   - Requires user to provide their TikTok session cookie
   
3. **Endpoint Health Monitoring**: Track success rates per endpoint
   - Prefer endpoints with higher success rates
   - Auto-disable consistently failing endpoints
   
4. **Caching**: Cache frequently used TTS audio
   - Reduce API calls
   - Faster response times
   - Would require storage management

## Security Summary

✅ **CodeQL Analysis**: No security vulnerabilities found

The fix:
- Uses only HTTPS endpoints (encrypted communication)
- No sensitive data transmission (text and voice ID only)
- No authentication credentials required for public endpoints
- Proper error handling prevents information leakage
- Input validation via text chunking prevents oversized requests
