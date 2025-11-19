# Quick Start Guide - Eulerstream Migration

## For Users Upgrading from Previous Version

### ⚠️ IMPORTANT: API Key Required

After this update, you **MUST** have an Eulerstream API key to connect to TikTok LIVE.

## Step 1: Get Your Eulerstream API Key

1. Visit https://www.eulerstream.com
2. Sign up for a free account
3. Navigate to your dashboard
4. Copy your API key

## Step 2: Configure API Key

Choose one of these methods:

### Method A: Environment Variable (Recommended)

**Windows:**
```bash
set EULER_API_KEY=your_eulerstream_api_key_here
npm start
```

**Linux/Mac:**
```bash
export EULER_API_KEY=your_eulerstream_api_key_here
npm start
```

**Permanent (Create .env file):**
```bash
# In project root directory, create .env file
EULER_API_KEY=your_eulerstream_api_key_here
```

### Method B: Dashboard Settings

1. Start the server: `npm start`
2. Open http://localhost:3000/dashboard.html
3. Go to Settings → TikTok Connection
4. Enter your API key in the "Eulerstream API Key" field
5. Save settings

## Step 3: Test Connection

1. Make sure a TikTok user is currently LIVE
2. In the dashboard, enter their username (without @)
3. Click "Connect"
4. You should see: "✅ Connected to TikTok LIVE via Eulerstream"

## Troubleshooting

### Error: "Eulerstream API key is required"

**Problem**: No API key configured

**Solution**: Follow Step 2 above to configure your API key

### Error: "Invalid or missing Eulerstream API key"

**Problem**: API key is incorrect

**Solution**: 
1. Verify your API key at https://www.eulerstream.com
2. Make sure there are no extra spaces
3. Try regenerating your key in the Eulerstream dashboard

### Error: "User is not currently live"

**Problem**: The TikTok user is not streaming

**Solution**: 
1. Verify the username is correct (without @)
2. Check if the user is actually LIVE on TikTok app
3. Try a different username

### Events Not Appearing

**Problem**: Connected but no events showing

**Solution**:
1. Check browser console for errors
2. Verify overlay is loaded (if using OBS)
3. Make sure the stream has activity (chat, gifts, etc.)
4. Check WebSocket connection in browser dev tools

## What Changed?

### ✅ Everything Still Works

- All events (chat, gifts, follows, shares, likes)
- TTS (Text-to-Speech)
- Alerts
- Soundboard
- Goals
- Flows (IFTTT automation)
- All overlays
- All plugins

### ⚠️ Only Difference

- You now need an Eulerstream API key
- Connection method changed to WebSocket (faster and more reliable!)

## Need Help?

1. **Migration Guide**: See `EULERSTREAM_MIGRATION.md` for technical details
2. **Issues**: Report at https://github.com/Loggableim/pupcidslittletiktokhelper/issues
3. **Email**: loggableim@gmail.com

## Benefits of This Update

✅ **Faster**: Direct WebSocket connection
✅ **More Reliable**: Official Eulerstream SDK
✅ **Better Support**: Eulerstream maintains the connection infrastructure
✅ **Future-Proof**: Using the official API designed for TikTok LIVE
