# TikTok TTS Engine Fix Documentation

## ⚠️ CRITICAL UPDATE (November 2024)

**All public TikTok TTS endpoints are currently DOWN worldwide.**

This is not specific to this implementation - it affects ALL community TikTok TTS services:
- Weilbyte Workers: 500 errors
- TikAPI: 403 errors  
- Official TikTok APIs: 404 errors

**GitHub Issue**: https://github.com/Weilbyte/tiktok-tts/issues/54

**RECOMMENDED**: Use Google Cloud TTS, ElevenLabs, or browser SpeechSynthesis instead.

See `plugins/tts/engines/TIKTOK_TTS_STATUS.md` for detailed alternatives.

---

## Original Problem (Before Service Outage)

The TikTok TTS (Text-to-Speech) engine was failing with 500 Internal Server Error from all configured endpoints:

```
2025-11-21 11:49:39 [error]: TTS engine tiktok failed: All TikTok TTS endpoints failed. Last error: Request failed with status code 500
```

## Root Cause

The original implementation relied solely on third-party proxy services that were experiencing outages:
- `tiktok-tts.weilnet.workers.dev` - 500 errors
- `countik.com/api/text/speech` - 500 errors  
- `gesserit.co/api/tiktok-tts` - 500 errors

## Solution

Implemented a hybrid endpoint approach with multiple fallback options:

### 1. Proxy Services (Tried First)
- **Weilbyte's Endpoint**: `https://tiktok-tts.weilnet.workers.dev/api/generation`
  - Public service, no authentication required
  - 300 character limit per request
  - Format: `{ text: "...", voice: "voice_id" }`
  
- **TikAPI Public Endpoint**: `https://tikapi.io/api/v1/public/tts`
  - Alternative public service
  - Similar format to Weilbyte

### 2. Official TikTok API Endpoints (Fallback)
- `https://api16-normal-c-useast1a.tiktokv.com/media/api/text/speech/invoke`
- `https://api22-normal-c-alisg.tiktokv.com/media/api/text/speech/invoke` (Asia region)

**Format for official endpoints:**
```javascript
{
  text_speaker: "voice_id",
  req_text: "text to speak",
  speaker_map_type: "0",
  aid: "1233"  // TikTok Application ID
}
```

**Headers:**
- Content-Type: `application/x-www-form-urlencoded`
- User-Agent: Modern Android client (v13, Pixel 7)

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
