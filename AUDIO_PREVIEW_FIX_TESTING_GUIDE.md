# Audio Preview Fix - Manual Testing Guide

## Prerequisites

1. **Start the application:**
   ```bash
   cd /home/runner/work/pupcidslittletiktokhelper/pupcidslittletiktokhelper
   npm start
   ```

2. **Open soundboard in browser:**
   ```
   http://localhost:3000/soundboard.html
   ```

3. **Open browser console:**
   - Chrome/Edge: Press F12 or Ctrl+Shift+J (Cmd+Option+J on Mac)
   - Firefox: Press F12 or Ctrl+Shift+K (Cmd+Option+K on Mac)

## Test Cases

### Test 1: Initial Page Load ✅

**Expected Behavior:**
- No error messages in console
- Only informational messages about audio unlock

**Steps:**
1. Open soundboard page
2. Check console immediately

**Expected Console Output:**
```
[AudioUnlock] Initializing audio unlock system...
[AudioUnlock] Attempting passive unlock (may show browser warnings - this is expected)...
[AudioUnlock] Passive unlock not allowed (expected), waiting for user interaction
✅ [Soundboard] Socket.IO connected
```

**❌ FAIL if you see:**
- Duplicate AudioContext messages
- Multiple unlock systems initializing
- Red error messages

### Test 2: AudioUnlockManager Integration ✅

**Expected Behavior:**
- Single AudioUnlockManager instance exists
- Soundboard uses the global manager

**Steps:**
1. Open console
2. Type: `window.audioUnlockManager`
3. Press Enter

**Expected Output:**
```javascript
AudioUnlockManager {
  unlocked: false,
  audioContext: null,
  listeners: Array(0),
  ...
}
```

**Steps:**
4. Type: `window.audioUnlockManager.isUnlocked()`
5. Press Enter

**Expected Output (before first interaction):**
```
false
```

**❌ FAIL if:**
- `window.audioUnlockManager` is undefined
- Multiple AudioContext instances exist

### Test 3: Preview Button - MyInstants Search ✅

**Expected Behavior:**
- First preview click unlocks audio
- Preview sounds play immediately after unlock

**Steps:**
1. Click "Picker" button on any gift row
2. Switch to "Search" tab
3. Enter search query: "wow"
4. Click search button
5. Wait for results to load
6. Click preview button (▶) on first result

**Expected Console Output (first preview click):**
```
🎮 [Soundboard] Play attempt: Sound Name Preview
[Soundboard] Requesting audio unlock via AudioUnlockManager...
[AudioUnlock] Unlock attempt 1/3
[AudioUnlock] AudioContext created, state: suspended
[AudioUnlock] AudioContext resumed, state: running
[AudioUnlock] Silent buffer played
[AudioUnlock] HTML5 Audio unlocked
✅ [AudioUnlock] Audio unlocked successfully!
✅ [Soundboard] Received audio-unlocked event
📡 [Soundboard] Loading started: [URL]
📋 [Soundboard] Metadata loaded - Duration: X.XXs
▶️ [Soundboard] Playing: Sound Name Preview
```

**Expected User Feedback:**
- Toast notification: "✅ Audio freigeschaltet"
- Toast notification: "▶️ Sound Name Preview"
- Audio plays through speakers

**Expected Console Output (subsequent preview clicks):**
```
🎮 [Soundboard] Play attempt: Sound Name Preview
📡 [Soundboard] Loading started: [URL]
▶️ [Soundboard] Playing: Sound Name Preview
```

**❌ FAIL if:**
- No audio plays
- Error messages appear
- Multiple unlock attempts
- Duplicate AudioContext creation

### Test 4: Gift Sound Preview ✅

**Expected Behavior:**
- Gift preview buttons work correctly
- Audio unlocks automatically on first use

**Steps:**
1. Find a gift row with assigned sound
2. Click the preview button (▶) on the gift row
3. Listen for audio playback

**Expected Console Output:**
```
🎮 [Soundboard] Play attempt: [Gift Name] Preview
📡 [Soundboard] Loading started: [URL]
▶️ [Soundboard] Playing: [Gift Name] Preview
```

**❌ FAIL if:**
- NotAllowedError appears
- No audio plays
- Duplicate unlock attempts

### Test 5: Audio State Verification ✅

**Expected Behavior:**
- Global state is synchronized
- Audio context state is correct

**Steps (after audio has been unlocked):**
1. Open console
2. Type: `window.audioUnlockManager.isUnlocked()`
3. Press Enter
4. Type: `window.audioUnlocked`
5. Press Enter
6. Type: `window.audioUnlockManager.getAudioContext().state`
7. Press Enter

**Expected Output:**
```javascript
true  // isUnlocked()
true  // audioUnlocked
"running"  // AudioContext state
```

**❌ FAIL if:**
- Any value is false or "suspended"
- audioUnlockManager doesn't exist

### Test 6: Sequential Sound Playback ✅

**Expected Behavior:**
- Multiple preview clicks work correctly
- No unlock errors on subsequent plays

**Steps:**
1. Click preview on sound 1
2. Wait for it to finish
3. Click preview on sound 2
4. Click preview on sound 3

**Expected Console Output:**
```
▶️ [Soundboard] Playing: Sound 1
⏹️ [Soundboard] Ended: Sound 1
▶️ [Soundboard] Playing: Sound 2
⏹️ [Soundboard] Ended: Sound 2
▶️ [Soundboard] Playing: Sound 3
⏹️ [Soundboard] Ended: Sound 3
```

**❌ FAIL if:**
- Any sound fails to play
- NotAllowedError appears
- Audio cuts out unexpectedly

### Test 7: Overlap Mode ✅

**Expected Behavior:**
- Multiple sounds can play simultaneously
- No conflicts or errors

**Steps:**
1. Make sure play mode is "overlap"
2. Quickly click preview on 3 different sounds
3. All three should play simultaneously

**Expected Console Output:**
```
▶️ [Soundboard] Playing: Sound 1
▶️ [Soundboard] Playing: Sound 2
▶️ [Soundboard] Playing: Sound 3
```

**❌ FAIL if:**
- Only one sound plays
- Sounds interrupt each other
- Errors appear

### Test 8: Error Recovery ✅

**Expected Behavior:**
- Graceful handling of invalid URLs
- Clear error messages

**Steps:**
1. Manually assign invalid URL to a gift
2. Try to preview that gift

**Expected Console Output:**
```
❌ [Soundboard] Audio load error: [details]
❌ Audio-Ladefehler (Code X): [message]
```

**Expected User Feedback:**
- Toast notification with error message
- No page crash

**❌ FAIL if:**
- Page crashes
- No error message shown
- Silent failure

## Browser Compatibility Tests

### Chrome/Edge ✅
- [ ] All tests pass
- [ ] No console errors
- [ ] Audio plays correctly

### Firefox ✅
- [ ] All tests pass
- [ ] No console errors
- [ ] Audio plays correctly

### Safari ✅
- [ ] All tests pass
- [ ] No console errors
- [ ] Audio plays correctly

## Performance Checks

### Memory Usage ✅
**Expected:**
- Single AudioContext instance
- Audio elements cleaned up after playback

**Steps:**
1. Open Chrome DevTools → Memory tab
2. Take heap snapshot
3. Search for "AudioContext"
4. Count instances

**Expected Result:** 1 AudioContext instance

**❌ FAIL if:** Multiple AudioContext instances exist

### Network Requests ✅
**Expected:**
- Sound files loaded only when needed
- No duplicate requests

**Steps:**
1. Open DevTools → Network tab
2. Click preview on same sound twice
3. Check requests

**Expected Result:** Sound file loaded once, cached for second play

## Regression Tests

### Existing Functionality ✅
- [ ] Gift assignment still works
- [ ] Sound playback from TikTok events works
- [ ] Settings save/load works
- [ ] MyInstants API search works
- [ ] Trending sounds load correctly
- [ ] Random sounds load correctly

## Success Criteria

✅ All test cases pass
✅ No console errors
✅ Audio plays reliably
✅ Single AudioContext instance
✅ Clear console messaging
✅ Good user feedback
✅ Backward compatible

## Troubleshooting

### Problem: Audio doesn't play
**Solution:**
1. Check browser console for errors
2. Verify AudioContext state: `window.audioUnlockManager.getAudioContext().state`
3. If "suspended", click anywhere to trigger unlock
4. Check browser autoplay settings

### Problem: Console shows warnings
**Check:**
- Are they labeled "expected"?
- Do they come from passive unlock attempt?
- If yes, this is normal behavior

### Problem: Multiple AudioContext instances
**This is a bug!**
- Check if both audio-unlock.js and soundboard.js are creating contexts
- Verify integration is complete
- Review code changes

### Problem: Preview button does nothing
**Check:**
1. Browser console for errors
2. Network tab - is sound file loading?
3. AudioContext state
4. Event listeners attached correctly

## Reporting Issues

When reporting issues, include:
1. **Browser & Version:** Chrome 120, Firefox 121, etc.
2. **Console Output:** Copy entire console log
3. **Steps to Reproduce:** Detailed steps
4. **Expected vs Actual:** What should happen vs what happened
5. **Screenshots:** If applicable

## Sign-Off Checklist

After completing all tests:

- [ ] All test cases passed
- [ ] No regression issues found
- [ ] Performance is acceptable
- [ ] Multiple browsers tested
- [ ] Documentation is accurate
- [ ] Ready for production

---

**Tester Name:** _______________
**Date:** _______________
**Browser:** _______________
**Result:** ☐ PASS  ☐ FAIL  ☐ NEEDS REVIEW

**Notes:**
