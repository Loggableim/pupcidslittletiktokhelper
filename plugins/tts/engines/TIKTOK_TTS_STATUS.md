# TikTok TTS Engine - Service Unavailable

## ⚠️ Current Status (November 2024)

**All public TikTok TTS endpoints are currently DOWN.**

This is not an issue with this codebase - it's a widespread problem affecting all community-based TikTok TTS services worldwide.

### Error Details

When attempting to use TikTok TTS, you will see errors like:
- `500 Internal Server Error` from Weilbyte Workers endpoint
- `403 Forbidden` from TikAPI endpoint  
- `404 Not Found` from official TikTok API endpoints

### Root Cause

TikTok has either:
1. Changed their internal API authentication requirements
2. Blocked public access to their TTS endpoints
3. Discontinued public TTS API access

This affects all third-party TikTok TTS implementations, including:
- Weilbyte/tiktok-tts (GitHub)
- All proxy services
- Direct API access attempts

**Reference:** https://github.com/Weilbyte/tiktok-tts/issues/54

## 🔧 Recommended Solutions

### Option 1: Use Google Cloud TTS (Most Reliable)

1. Get a Google Cloud API key from https://cloud.google.com/text-to-speech
2. Configure in the TTS plugin settings
3. Select "Google Cloud TTS" as your engine
4. Very high quality, 300+ voices, multiple languages

### Option 2: Use ElevenLabs TTS (Highest Quality)

1. Get an API key from https://elevenlabs.io
2. Configure in the TTS plugin settings
3. Select "ElevenLabs" as your engine
4. Best quality, natural-sounding voices

### Option 3: Use Browser SpeechSynthesis (Free, No Setup)

The TTS plugin can use the browser's built-in speech synthesis as a fallback:

1. No API key required
2. Works client-side in the browser overlay
3. Available voices depend on your operating system
4. Quality varies but is free and reliable

### Option 4: Use Speechify Engine

If you have Speechify configured, it will work as a fallback.

## 🔍 Monitoring for Service Restoration

We will continue monitoring for TikTok TTS service restoration:

1. Watch GitHub issues: https://github.com/Weilbyte/tiktok-tts/issues
2. Check TikTok developer forums
3. Monitor community TTS projects

When service is restored, this codebase will automatically work again without changes.

## 📝 Technical Details

### What We Tried

The implementation attempted multiple endpoint types:

**Proxy Services:**
- `https://tiktok-tts.weilnet.workers.dev/api/generation` → 500 error
- `https://tikapi.io/api/v1/public/tts` → 403 error

**Official TikTok API:**
- `https://api16-normal-c-useast1a.tiktokv.com/media/api/text/speech/invoke` → 404 error
- `https://api22-normal-c-alisg.tiktokv.com/media/api/text/speech/invoke` → 404 error

All endpoints with:
- Proper authentication headers
- Correct request format
- Multiple retry attempts
- Automatic failover

**Conclusion:** The issue is not with the implementation, but with TikTok's services.

### Why Can't We Fix It?

TikTok does not provide an official public TTS API. All community implementations rely on:
1. Reverse-engineered internal endpoints
2. Unofficial proxy services
3. Extracted authentication tokens

When TikTok changes their backend or blocks access, there's no official channel to restore service.

## 🆘 Support

If you need help configuring an alternative TTS engine:

1. Check the TTS plugin documentation
2. Visit the main README
3. Open a GitHub issue
4. Email: loggableim@gmail.com

## 📅 Last Updated

2025-11-21 - All TikTok TTS endpoints confirmed down
