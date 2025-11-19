# Eulerstream API Integration Guide

This document provides detailed information about the Eulerstream API integration, troubleshooting common issues, and configuration requirements.

## Overview

This application uses the **Eulerstream WebSocket SDK** (https://www.eulerstream.com/docs) to connect to TikTok LIVE streams. Eulerstream provides a reliable, real-time WebSocket API for accessing TikTok LIVE events such as chat messages, gifts, likes, follows, and more.

## Requirements

### 1. Eulerstream API Key (REQUIRED)

An Eulerstream API key is **mandatory** for connecting to TikTok LIVE streams. There is no fallback or default key provided for security reasons.

#### How to Get Your API Key:

1. Visit [https://www.eulerstream.com](https://www.eulerstream.com)
2. Create an account or log in to your existing account
3. Navigate to your dashboard
4. Generate a new API key
5. Copy the API key (it should be a long alphanumeric string, 64+ characters)

### 2. Configuration Methods

You can configure the API key in one of the following ways (listed in order of priority):

#### Method 1: Dashboard Settings UI (Recommended)

1. Start the application
2. Open the dashboard in your browser
3. Navigate to Settings
4. Set the setting `tiktok_euler_api_key` to your API key value
5. Save the settings

#### Method 2: Environment Variable (EULER_API_KEY)

Create a `.env` file in the project root (or set environment variable):

```bash
EULER_API_KEY=your_eulerstream_api_key_here
```

#### Method 3: Environment Variable (SIGN_API_KEY) - Legacy

For backward compatibility, the legacy environment variable name is also supported:

```bash
SIGN_API_KEY=your_eulerstream_api_key_here
```

## Connection Configuration

### Enterprise API Infrastructure (Recommended)

This application now uses the **Enterprise API infrastructure** by default, which is recommended by Eulerstream for better reliability and live stream detection. This feature:

- **Improves live stream detection accuracy**: Better detection of when streamers go live
- **Enhanced reliability**: More stable WebSocket connections
- **Better API key handling**: Proper validation for both standard and enterprise API keys

**Technical Details:**
The application automatically enables the `useEnterpriseApi` feature flag when connecting to Eulerstream. This ensures optimal compatibility with both standard API keys and enterprise/account API keys.

**No configuration needed**: This is enabled automatically in the connection settings.

## Common Issues and Troubleshooting

### Error: 4401 - INVALID_AUTH

**Symptom:**
```
Eulerstream WebSocket disconnected: 4401 - INVALID_AUTH
WS State Error - The provided API Key is invalid.
```

**Causes:**
- The API key is missing
- The API key is invalid or expired
- The API key is malformed (extra spaces, truncated, etc.)
- The API key format has changed and needs to be regenerated

**Solutions:**
1. **Verify API Key:** Log in to https://www.eulerstream.com and check your API key
2. **Regenerate Key:** Generate a new API key from the Eulerstream dashboard
3. **Update Configuration:** Update the API key in your configuration using one of the methods above
4. **Check Format:** Ensure the API key is a long alphanumeric string (64+ characters) with no extra spaces or quotes
5. **Clear Old Keys:** Remove any old or cached API keys from environment variables or settings

### Error: 4400 - INVALID_OPTIONS

**Symptom:**
```
Eulerstream WebSocket disconnected: 4400 - INVALID_OPTIONS
```

**Causes:**
- Invalid username format
- Invalid connection parameters

**Solutions:**
1. **Check Username:** Ensure the TikTok username is correct (without @ symbol)
2. **Verify User Exists:** Confirm the user account exists on TikTok
3. **Check API Key:** Make sure the API key is valid

### Error: 4404 - NOT_LIVE

**Symptom:**
```
Eulerstream WebSocket disconnected: 4404 - NOT_LIVE
```

**Causes:**
- The TikTok user is not currently streaming
- API configuration issue preventing proper live stream detection (less common)

**Solutions:**
1. **Verify Stream Status:** Check if the user is actually live on TikTok
2. **Wait and Retry:** Wait for the user to start streaming, then reconnect
3. **Check API Configuration:** If you're certain the user is live:
   - Ensure you're using the latest version of the application (includes Enterprise API fix)
   - Verify your API key is valid and has proper permissions
   - Try regenerating your API key from the Eulerstream dashboard
   - Contact Eulerstream support if the issue persists

**Note:** As of the latest update, the application uses the Enterprise API infrastructure which significantly improves live stream detection accuracy. If you continue to get NOT_LIVE errors for streams that are actually live, ensure you're running the latest version.

### Error: No API Key Configured

**Symptom:**
```
Eulerstream API key is required. Please configure it in one of the following ways...
```

**Causes:**
- No API key has been configured

**Solutions:**
1. Follow the configuration methods above to set up your API key

## API Key Security Best Practices

1. **Never commit API keys to version control:** Use environment variables or secure configuration
2. **Never expose API keys in client-side code:** API keys should only be used server-side
3. **Rotate keys regularly:** Generate new API keys periodically for security
4. **Use environment-specific keys:** Use different API keys for development and production
5. **Revoke compromised keys immediately:** If a key is exposed, revoke it in the Eulerstream dashboard

## Validation and Logging

The application performs the following validations:

1. **API Key Presence:** Checks if an API key is configured
2. **API Key Format:** Basic validation that the key is a string with minimum 32 characters
3. **Secure Logging:** Only the first 8 and last 4 characters of the API key are logged for verification

Example log output:
```
🔑 Eulerstream API Key configured (69247cb1...b7a8)
```

## WebSocket Close Codes Reference

| Code | Name                    | Description                                           |
|------|-------------------------|-------------------------------------------------------|
| 1000 | NORMAL                  | Normal connection closure                             |
| 1006 | ABNORMAL_CLOSURE        | Connection closed abnormally (no close frame)         |
| 1011 | INTERNAL_SERVER_ERROR   | Server encountered an unexpected condition            |
| 4005 | STREAM_END              | TikTok stream has ended                               |
| 4006 | NO_MESSAGES_TIMEOUT     | No messages received in timeout period                |
| 4400 | INVALID_OPTIONS         | Invalid connection options provided                   |
| 4401 | INVALID_AUTH            | Invalid or expired API key                            |
| 4403 | NO_PERMISSION           | No permission to access the requested creator         |
| 4404 | NOT_LIVE                | The requested user is not currently live              |
| 4429 | TOO_MANY_CONNECTIONS    | Too many concurrent connections                       |
| 4500 | TIKTOK_CLOSED_CONNECTION| TikTok closed the connection                          |
| 4555 | MAX_LIFETIME_EXCEEDED   | WebSocket exceeded 8-hour lifetime limit              |

## Auto-Reconnect Behavior

The application implements smart auto-reconnect logic:

- **Normal disconnections:** Automatically attempts to reconnect up to 5 times
- **Authentication errors (4401, 4400):** Auto-reconnect is DISABLED - requires manual fix and reconnection
- **User not live (4404):** Auto-reconnect is DISABLED - wait for user to go live
- **Other errors:** Attempts auto-reconnect with 5-second delay between attempts

## Testing Your Connection

To test your Eulerstream connection:

1. Ensure you have a valid API key configured
2. Find a TikTok user who is currently live
3. Use the test connection script:

```bash
# Set your API key
export EULER_API_KEY=your_key_here

# Run the test script
node test-connection.js
```

## Additional Resources

- **Eulerstream Documentation:** https://www.eulerstream.com/docs
- **Eulerstream OpenAPI Spec:** https://www.eulerstream.com/docs/openapi
- **Eulerstream WebSocket SDK:** https://github.com/EulerStream/Euler-WebSocket-SDK
- **Eulerstream Discord:** Available via the Eulerstream website

## Support

If you continue to experience issues:

1. Check the application logs for detailed error messages
2. Verify your API key is valid at https://www.eulerstream.com
3. Review this troubleshooting guide
4. Contact Eulerstream support for API-specific issues
5. Open an issue on this project's GitHub repository for application-specific issues

## Migration from Old API Keys

If you were using an old API key (starting with "euler_" prefix), you may need to:

1. Generate a new API key from the Eulerstream dashboard
2. Update your configuration with the new key
3. Restart the application

The new API key format is a 64-character hexadecimal string without a prefix.
