# TTS Performance Optimization - Changelog

## Version 2.1.0 - TTS Performance Optimization

### 🚀 Major Changes

#### 1. TikTok Engine Removed
- **Removed completely** from the codebase
- No longer required or supported
- All references cleaned from:
  - `main.js` initialization
  - UI dropdowns and selectors
  - Fallback chains
  - Documentation

**Reason:** TikTok engine is no longer used by the project and was causing maintenance overhead.

#### 2. Performance Modes Added

Three new performance modes optimize TTS generation for different hardware capabilities:

**Fast Mode** (Low-Resource PCs / "Toaster PCs")
```javascript
{
  performanceMode: 'fast',
  timeout: 5000,      // 5 seconds
  maxRetries: 1       // 2 total attempts
}
```
- **Best for:** Low-end PCs, laptops, streaming on limited hardware
- **Performance:** Up to 70% faster than previous default
- **Trade-off:** May fail on slow networks or during API rate limiting

**Balanced Mode** (Default)
```javascript
{
  performanceMode: 'balanced',
  timeout: 10000,     // 10 seconds
  maxRetries: 2       // 3 total attempts
}
```
- **Best for:** Most users and average hardware
- **Performance:** 33% faster than previous default (was 15s)
- **Trade-off:** Good balance of speed and reliability

**Quality Mode** (High-Resource)
```javascript
{
  performanceMode: 'quality',
  timeout: 20000,     // 20 seconds
  maxRetries: 3       // 4 total attempts
}
```
- **Best for:** High-end PCs, poor network, when reliability is critical
- **Performance:** Longer wait times, maximum reliability
- **Trade-off:** Slower but most reliable

#### 3. OpenAI TTS Integration

OpenAI Text-to-Speech is now fully integrated:

- **Added to UI:** All engine selection dropdowns
- **API Key Management:** Secure input with show/hide toggle
- **Voice Options:** 
  - GPT-4o Mini TTS voices (Alloy, Echo, Fable, Onyx, Nova, Shimmer)
  - TTS-1 voices (standard quality)
  - TTS-1-HD voices (highest quality)
- **Documentation Links:** Direct links to OpenAI Platform and TTS docs
- **Performance Optimized:** Supports all three performance modes

#### 4. Engine Optimizations

All four TTS engines now support performance modes:

**Google Cloud TTS**
- Timeout: 10s (balanced), 5s (fast), 20s (quality)
- Retries: 2 (balanced), 1 (fast), 3 (quality)
- Consistent config pattern

**Speechify TTS**
- Timeout: 10s (balanced), 5s (fast), 20s (quality)
- Retries: 2 (balanced), 1 (fast), 3 (quality)
- Consistent config pattern

**ElevenLabs TTS**
- Timeout: 10s (balanced), 5s (fast), 20s (quality)
- Retries: 2 (balanced), 1 (fast), 3 (quality)
- Consistent config pattern

**OpenAI TTS** (NEW)
- Timeout: 10s (balanced), 5s (fast), 20s (quality)
- Retries: 2 (balanced), 1 (fast), 3 (quality)
- Consistent config pattern

### 📊 Performance Improvements

#### Before vs After Comparison

| Scenario | Before (15s timeout, 2 retries) | After (Balanced Mode) | After (Fast Mode) | Improvement |
|----------|--------------------------------|----------------------|-------------------|-------------|
| Single engine success | 0-15s | 0-10s | 0-5s | 33-67% faster |
| Single engine max wait | 45s | 30s | 10s | 33-78% faster |
| Fallback chain (4 engines) | 180s | 120s | 40s | 33-78% faster |

#### Real-World Impact

**Toaster PC Scenario (Fast Mode):**
- Previous: Up to 180 seconds total wait with fallbacks
- Now: Up to 40 seconds total wait with fallbacks
- **Result: 77% faster** ⚡

**Average PC Scenario (Balanced Mode):**
- Previous: Up to 180 seconds total wait with fallbacks
- Now: Up to 120 seconds total wait with fallbacks
- **Result: 33% faster** 📈

### 🔧 Configuration Changes

#### Default Values Updated

```javascript
{
  defaultEngine: 'google',              // Changed from 'tiktok'
  defaultVoice: 'de-DE-Wavenet-B',     // Changed from 'en_us_ghostface'
  performanceMode: 'balanced'           // NEW - default mode
}
```

#### New Configuration Options

- `performanceMode`: `'fast'` | `'balanced'` | `'quality'`

#### Dynamic Reconfiguration

Changing performance mode now automatically reinitializes all engines with new settings - no restart required!

### 🎨 UI Changes

#### Admin Panel Updates

1. **Engine Selector Dropdowns**
   - TikTok removed
   - OpenAI added
   - Updated in 3 locations:
     - Default Engine selector
     - Manual TTS Engine selector
     - Voice Assignment modal

2. **API Key Management**
   - Added OpenAI API key section
   - Password toggle (show/hide) for OpenAI key
   - Help text with links to:
     - OpenAI Platform API keys
     - Text-to-Speech documentation

3. **Google Cloud Help Text**
   - Updated to mention "Enable the Cloud Text-to-Speech API"
   - More actionable guidance

### 📝 Documentation

#### New Files

- **PERFORMANCE_MODES.md**: Comprehensive guide to performance modes
  - Overview and comparison
  - Configuration instructions
  - Use case recommendations
  - Troubleshooting guide
  - Migration from TikTok engine

- **CHANGELOG_TTS_OPTIMIZATION.md** (this file): Detailed changelog

### 🔒 Security

- ✅ CodeQL security scan: No vulnerabilities found
- ✅ API keys properly masked in UI
- ✅ Password-type inputs with show/hide toggles
- ✅ Secure configuration handling

### 🐛 Bug Fixes

1. **Inconsistent Config Pattern**: All engines now use consistent `{ performanceMode: ... }` pattern
2. **Duplicate Error Messages**: Extracted to `TTSPlugin.NO_ENGINES_ERROR` constant
3. **Missing OpenAI in UI**: Now fully integrated across all UI components

### 💔 Breaking Changes

#### Required Actions for Users

1. **TikTok Engine Removed**
   - Must configure at least one premium engine
   - Available options: Google, Speechify, ElevenLabs, OpenAI

2. **Default Engine Changed**
   - Old: TikTok (`tiktok`)
   - New: Google (`google`)
   - Action: Update if you need a different default

3. **Default Voice Changed**
   - Old: `en_us_ghostface` (TikTok English voice)
   - New: `de-DE-Wavenet-B` (Google German male voice)
   - Action: Change in settings if English is preferred

### 📚 Migration Guide

#### For Existing Users

**Step 1: Configure a Premium Engine**

Choose at least one and add your API key:

- **Google Cloud TTS**: Get key from [Google Cloud Console](https://console.cloud.google.com)
- **Speechify**: Get key from [speechify.com/api](https://speechify.com/api)
- **ElevenLabs**: Get key from [elevenlabs.io](https://elevenlabs.io)
- **OpenAI**: Get key from [platform.openai.com/api-keys](https://platform.openai.com/api-keys)

**Step 2: Select Performance Mode**

In TTS Admin Panel → Configuration:
- Low-end PC: Select `fast`
- Average PC: Keep `balanced` (default)
- High-end PC or poor network: Select `quality`

**Step 3: Test TTS**

Use Manual TTS section to test your configuration.

### 🎯 Future Enhancements

Potential future improvements:

- Automatic performance mode based on system resources
- Per-engine performance mode override
- Caching layer for frequently used phrases
- Parallel synthesis attempts for even faster failover

### 🙏 Credits

- Issue reporter: Identified performance issues on low-resource PCs
- OpenAI Platform: Documentation and API for TTS integration

---

**Release Date**: November 25, 2025
**Version**: 2.1.0
**Branch**: `copilot/optimize-tts-performance`
