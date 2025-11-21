# TikTok TTS Engine - SessionID Required

## ✅ SOLUTION FOUND (November 2024)

**TikTok TTS is working!** It requires a valid SessionID from a logged-in TikTok account.

Tools like TikFinity and TikTok-Chat-Reader work because they use authenticated SessionIDs.

## 🔑 How to Get Your SessionID

### Step 1: Log into TikTok
1. Open your browser and go to https://www.tiktok.com
2. Log in with your TikTok account

### Step 2: Extract SessionID from Cookies
1. Press `F12` to open Developer Tools
2. Go to the **Application** tab (Chrome) or **Storage** tab (Firefox)
3. In the left sidebar, expand **Cookies**
4. Click on `https://www.tiktok.com`
5. Find the cookie named `sessionid`
6. Copy the **Value** (it will be a long string of letters and numbers)

### Step 3: Configure SessionID

**Option A: Environment Variable (Recommended)**
```bash
# Add to your .env file
TIKTOK_SESSION_ID=your_session_id_here
```

**Option B: Via TTS Plugin Settings**
1. Open the dashboard
2. Go to TTS settings
3. Find "TikTok SessionID" field
4. Paste your SessionID
5. Save settings

## ⚠️ Important Notes

### SessionID Expires
- SessionIDs expire after some time (weeks/months)
- When it expires, you'll get 401/403 errors
- **Solution**: Just get a fresh SessionID and update it

### Keep it Private
- Your SessionID is like a password - keep it secret!
- Don't share it publicly or commit it to GitHub
- Use environment variables (.env file)

### Regional Endpoints
The engine uses multiple TikTok API endpoints for redundancy:
- US East: `api16-normal-useast5.us.tiktokv.com`
- Asia: `api22-normal-c-alisg.tiktokv.com`
- US East 2: `api16-normal-c-useast2a.tiktokv.com`

## 🚀 Quick Start

1. **Get SessionID** (see instructions above)
2. **Set environment variable**:
   ```bash
   echo "TIKTOK_SESSION_ID=your_session_id_here" >> .env
   ```
3. **Restart the application**
4. **Test TTS** - it should work now!

## 🐛 Troubleshooting

### Error: "No TikTok SessionID configured"
- You haven't set the TIKTOK_SESSION_ID environment variable
- **Fix**: Follow the instructions above to get and set your SessionID

### Error: "All TikTok TTS endpoints failed" with 401/403
- Your SessionID is invalid or expired
- **Fix**: Get a fresh SessionID from TikTok cookies

### Error: "All TikTok TTS endpoints failed" with 404
- The API endpoints may have changed
- **Fix**: Check for updates or try alternative TTS engines

### Still Not Working?
Try these alternatives:
1. **Google Cloud TTS** - Most reliable, 300+ voices, requires API key
2. **ElevenLabs TTS** - Highest quality, natural voices, requires API key  
3. **Browser SpeechSynthesis** - Free, client-side, no setup required

## 📋 How It Works

When you make a TTS request:

1. **Authentication**: Your SessionID is sent in the Cookie header
2. **Request**: Text and voice ID are sent to TikTok API
3. **Response**: TikTok returns base64-encoded MP3 audio
4. **Playback**: Audio is decoded and played

### Example Request
```javascript
POST https://api16-normal-useast5.us.tiktokv.com/media/api/text/speech/invoke
Headers:
  Cookie: sessionid=YOUR_SESSION_ID
  Content-Type: application/x-www-form-urlencoded
Body:
  text_speaker=en_us_001
  req_text=Hello world
  speaker_map_type=0
  aid=1233
```

### Example Response
```json
{
  "status_code": 0,
  "data": {
    "v_str": "base64_encoded_audio_data..."
  }
}
```

## 🔄 Updating SessionID Regularly

### Automated Reminder
Consider setting up a monthly reminder to update your SessionID:
1. Get fresh SessionID from TikTok
2. Update .env file or TTS settings
3. Restart application

### Signs SessionID Needs Updating
- TTS starts failing with 401/403 errors
- "Invalid SessionID" messages in logs
- TikTok asks you to log in again on the website

## 💡 Why SessionID is Required

TikTok TTS is not a public API - it's an internal API for TikTok's apps.  
To prevent abuse, TikTok requires authentication via SessionID.

This is how tools like TikFinity work - they ask users to provide their SessionID.

## 🆘 Support

If you need help:
1. Check the main README
2. Open a GitHub issue
3. Email: loggableim@gmail.com

## 📅 Last Updated

2025-11-21 - SessionID authentication implemented and working
