# TTS Engine Improvements - November 2024

## Overview

This document describes the improvements made to the TTS (Text-to-Speech) plugin to address issues with Google TTS authentication, Speechify API failures, TikTok TTS endpoint changes, and engine fallback logic.

## Issues Addressed

### 1. Google TTS Authentication Errors

**Problem:**
- Google Cloud TTS API was returning: "API keys are not supported by this API. Expected OAuth2 access token or other authentication credentials"
- Users were confused about whether to use API keys or OAuth2

**Solution:**
- Enhanced error handling with context-aware error messages
- Added `_getAuthErrorHelp()` method that detects specific error types and provides actionable guidance
- Clear distinction between OAuth2 confusion, invalid API key, and billing issues
- Direct links to Google Cloud Console for easy troubleshooting

**Implementation Details:**
- Location: `plugins/tts/engines/google-engine.js`
- New method: `_getAuthErrorHelp(errorMsg)` 
- Detects: OAuth2 errors, invalid key errors, billing errors
- Provides: Step-by-step instructions, console links, common solutions

### 2. Speechify Voice Fetching (404 Errors)

**Problem:**
- Speechify API was returning 404 when fetching voices
- Error messages were generic and unhelpful
- Users didn't know if it was a temporary issue or endpoint change

**Solution:**
- Enhanced error logging in `_fetchVoices()` method
- Specific detection of 404 errors with logging of attempted endpoint URL
- Directs users to check Speechify API documentation
- Maintains existing fallback to cached or static voices

**Implementation Details:**
- Location: `plugins/tts/engines/speechify-engine.js`
- Enhanced logging shows status code, error message, and attempted URL
- For 404 errors: Logs endpoint URL and suggests checking API documentation
- Fallback chain: Fresh API → Expired cache → Static voices

### 3. TikTok TTS Endpoint Changes (All 404s)

**Problem:**
- All TikTok TTS endpoints were returning 404
- Indicates TikTok changed their API
- Error messages didn't provide clear alternatives

**Solution:**
- Completely rewrote error messages with structured output
- Detects 404 errors specifically and identifies root cause
- Provides clear alternatives (ElevenLabs, Google Cloud TTS)
- Shows admin panel URL for easy configuration changes
- Distinguishes between 404, authentication, and network errors

**Implementation Details:**
- Location: `plugins/tts/engines/tiktok-engine.js`
- Error output structure:
  ```
  ❌ TikTok TTS UNAVAILABLE - All endpoints returned errors
  
  🔍 ROOT CAUSE: [Specific reason]
  
  📋 RECOMMENDED ACTIONS: [Step-by-step solutions]
  
  ⚙️  HOW TO SWITCH: [Configuration instructions]
  ```

### 4. Engine Fallback Logic Improvements

**Problem:**
- System defaulted to Google TTS even when it failed
- Fallback chain wasn't optimal (didn't prioritize ElevenLabs premium quality)
- No clear logging of fallback attempts

**Solution:**
- Improved fallback chain for ALL engines:
  - **Google fails** → ElevenLabs → Speechify → TikTok
  - **ElevenLabs fails** → Speechify → Google → TikTok
  - **Speechify fails** → ElevenLabs → Google → TikTok
  - **TikTok fails** → ElevenLabs → Speechify → Google
- Added clear logging messages showing which fallback is being used
- Enhanced engine availability checks before synthesis
- Prioritizes premium quality engines (ElevenLabs) when available

**Implementation Details:**
- Location: `plugins/tts/main.js`
- Two-stage fallback:
  1. **Pre-synthesis**: Check engine availability, fallback before attempting
  2. **Post-synthesis**: If synthesis fails, try alternative engines
- Each fallback includes voice adjustment to match target engine

### 5. Logging and Visibility Improvements

**Problem:**
- Users didn't know which engines were available
- Fallback attempts weren't clearly logged
- Difficult to diagnose TTS issues

**Solution:**
- Enhanced startup logging with engine initialization status (✅ or ⚠️)
- Summary of available engines and configuration at startup
- Clear fallback logging with engine names
- Error messages include actionable next steps

**Implementation Details:**
- Location: `plugins/tts/main.js`
- Startup logs show:
  ```
  TTS: ✅ Google Cloud TTS engine initialized
  TTS: ⚠️  Speechify TTS engine NOT initialized (no API key)
  TTS: ✅ ElevenLabs TTS engine initialized
  TTS: Available engines: Google Cloud TTS, ElevenLabs
  TTS: Default engine: google, Auto-fallback: enabled
  ```

## Configuration

### Enable Auto-Fallback

Auto-fallback is enabled by default. To disable:

```javascript
{
  "enableAutoFallback": false
}
```

### Recommended Configuration

For best reliability when TikTok TTS is unavailable:

```javascript
{
  "defaultEngine": "elevenlabs",  // or "google" if you have API key
  "enableAutoFallback": true,     // Enable automatic fallback
  "elevenlabsApiKey": "your-key", // Add ElevenLabs API key
  "googleApiKey": "your-key",     // Add Google API key as backup
  "enabledForChat": true,
  "autoLanguageDetection": true
}
```

## Fallback Chains

### Primary Engine: Google

1. ✅ Try Google Cloud TTS
2. ❌ Google fails → Try ElevenLabs (premium quality)
3. ❌ ElevenLabs unavailable → Try Speechify
4. ❌ Speechify unavailable → Try TikTok
5. ❌ All failed → Error with actionable guidance

### Primary Engine: ElevenLabs

1. ✅ Try ElevenLabs
2. ❌ ElevenLabs fails → Try Speechify
3. ❌ Speechify unavailable → Try Google
4. ❌ Google unavailable → Try TikTok
5. ❌ All failed → Error with actionable guidance

### Primary Engine: TikTok

1. ✅ Try TikTok
2. ❌ TikTok fails → Try ElevenLabs (premium upgrade)
3. ❌ ElevenLabs unavailable → Try Speechify
4. ❌ Speechify unavailable → Try Google
5. ❌ All failed → Error with actionable guidance

## Error Messages

### Google TTS Errors

**OAuth2 Confusion:**
```
Google Cloud TTS API requires an API key, not OAuth2 tokens.
Please ensure you have:
1. Created a Google Cloud Project
2. Enabled the Text-to-Speech API
3. Created an API Key (not OAuth credentials)
4. Enabled billing for your project
5. Added the API key to TTS Admin Panel > Configuration
Visit: https://console.cloud.google.com/apis/credentials
```

**Invalid API Key:**
```
Your Google Cloud API key is invalid. Please check:
1. The API key is correctly copied
2. The API key has not been revoked
3. API restrictions allow Text-to-Speech API
Visit: https://console.cloud.google.com/apis/credentials
```

**Billing Not Enabled:**
```
Google Cloud TTS requires billing to be enabled. Please:
1. Visit https://console.cloud.google.com/billing
2. Enable billing for your project
3. Wait a few minutes for changes to propagate
```

### Speechify Errors

**404 Endpoint Error:**
```
Speechify: Voices API returned 404 - API endpoint may have changed
Speechify: Attempted URL: https://api.sws.speechify.com/v1/audio_models
Speechify: Please check https://speechify.com/api for updated endpoint
Speechify: Using static fallback voices
```

### TikTok TTS Errors

**404 All Endpoints:**
```
❌ TikTok TTS UNAVAILABLE - All endpoints returned errors

🔍 ROOT CAUSE: TikTok API endpoints have changed (all returned 404)

📋 RECOMMENDED ACTIONS:
   1. Use ElevenLabs TTS (best quality, requires API key)
   2. Use Google Cloud TTS (good quality, requires API key)
   3. Use Browser TTS (free, no setup needed, client-side)

⚙️  HOW TO SWITCH:
   • Open TTS Admin Panel: http://localhost:3000/plugins/tts/ui/admin-panel.html
   • Go to Configuration tab
   • Set "Default Engine" to "elevenlabs" or "google"
   • Add your API key in the respective field
   • Enable "Auto Fallback" for redundancy
```

## Testing

All improvements are covered by automated tests:

```bash
# Run all TTS tests
node test/tts-engine-improvements.test.js
node test/tts-autofallback.test.js
```

Test coverage includes:
- ✅ Engine initialization
- ✅ Voice list availability
- ✅ Default voice selection per language
- ✅ Error message formatting
- ✅ API key updates
- ✅ Auto-fallback configuration

## Migration Guide

### For Users Currently Using Google TTS

If you're seeing OAuth2 errors:
1. Verify you created an **API Key** (not OAuth2 credentials)
2. Enable billing for your Google Cloud project
3. Check API restrictions allow Text-to-Speech API
4. As a backup, add ElevenLabs or Speechify API key

### For Users Currently Using TikTok TTS

If TikTok TTS returns 404:
1. Switch to ElevenLabs (recommended, premium quality)
2. Or switch to Google Cloud TTS (good quality)
3. Or use Browser TTS (free, no API key needed)
4. Update default engine in Admin Panel
5. Enable auto-fallback for redundancy

### For Users Currently Using Speechify

If voice fetching fails:
1. System will automatically use static fallback voices
2. Consider adding ElevenLabs or Google as backup
3. Enable auto-fallback for redundancy

## Files Modified

1. **plugins/tts/engines/google-engine.js**
   - Added `_getAuthErrorHelp()` method
   - Enhanced error handling in `synthesize()`
   - Improved authentication error messages

2. **plugins/tts/engines/speechify-engine.js**
   - Enhanced `_fetchVoices()` error logging
   - Specific 404 error detection
   - Better fallback logging

3. **plugins/tts/engines/tiktok-engine.js**
   - Rewrote error messages in `_synthesizeChunk()`
   - Added structured error output
   - Provided actionable recommendations

4. **plugins/tts/main.js**
   - Enhanced engine initialization logging
   - Improved pre-synthesis engine checks
   - Smart fallback chain implementation
   - Better startup visibility

5. **test/tts-engine-improvements.test.js** (new)
   - Comprehensive test suite for improvements
   - 13 tests covering all major features

## Support

For issues or questions:
1. Check debug logs in Admin Panel > Debug Logs tab
2. Look for SPEAK_STEP4 and SPEAK_STEP5 logs
3. Verify engine initialization logs at startup
4. Check error messages for actionable guidance

## Future Improvements

Potential enhancements:
- Add support for more TTS engines
- Implement voice quality scoring for better fallback decisions
- Add cost tracking across all engines
- Implement voice preview in admin panel
- Add browser-based TTS as ultimate fallback
