# Speechify Integration - Manual Test Plan

**Document Version:** 1.0
**Last Updated:** 2025-11-14
**Environment:** Staging (Production Replica)
**Duration:** 1 week
**Participants:** QA Team (2-3 people)

---

## Test Execution Overview

### Test Environment Setup

**Before Testing:**
1. Deploy Speechify integration to staging
2. Verify API key is configured
3. Verify databases are populated with test data
4. Clear queue and caches
5. Enable verbose logging
6. Prepare monitoring dashboards

**Equipment Needed:**
- 2-3 test machines (Windows/Mac/Linux)
- Multiple browsers (Chrome, Firefox, Safari, Edge)
- Admin access to staging environment
- Audio playback devices for quality verification

### Test Execution Schedule

```
Day 1: Smoke tests + Voice selection
Day 2: Engine fallback chain
Day 3: Permission system + Queue management
Day 4: Error scenarios + Edge cases
Day 5: Multi-language support + Performance
```

---

## Test Cases

### CATEGORY 1: SMOKE TESTS

**Test 1.1: Speechify Engine Available**
- **Precondition:** Staging deployed with Speechify
- **Steps:**
  1. Open admin dashboard
  2. Navigate to TTS Settings
  3. Check Engine Status
- **Expected:** Speechify shows as "Available"
- **Pass Criteria:** Status = "Available"
- **Tester:** QA1
- **Date:** ___/___
- **Result:** [ ] PASS [ ] FAIL [ ] N/A

**Test 1.2: Manual TTS with Speechify**
- **Precondition:** Speechify available, user logged in
- **Steps:**
  1. Navigate to TTS Manual Trigger
  2. Enter text: "Hello, this is a test"
  3. Select Engine: Speechify
  4. Select Voice: George
  5. Click "Speak"
- **Expected:** Audio is generated and queued
- **Pass Criteria:** Queue shows 1 item, audio plays
- **Tester:** QA1
- **Date:** ___/___
- **Result:** [ ] PASS [ ] FAIL [ ] N/A

**Test 1.3: TTS Configuration Page**
- **Precondition:** Admin user logged in
- **Steps:**
  1. Navigate to /admin/tts
  2. Verify all settings visible
  3. Check default engine dropdown
  4. Check Speechify option exists
- **Expected:** Settings page loads, Speechify visible
- **Pass Criteria:** All UI elements visible and functional
- **Tester:** QA1
- **Date:** ___/___
- **Result:** [ ] PASS [ ] FAIL [ ] N/A

---

### CATEGORY 2: VOICE SELECTION

**Test 2.1: Select George Voice (English Male)**
- **Precondition:** Speechify available
- **Steps:**
  1. Open TTS Manual Trigger
  2. Enter: "The quick brown fox"
  3. Engine: Speechify
  4. Voice: George
  5. Click Speak
- **Expected:** Audio synthesized with George voice
- **Audio Quality:** Natural, clear, professional
- **Tester:** QA2
- **Date:** ___/___
- **Result:** [ ] PASS [ ] FAIL [ ] N/A
- **Notes:** ________________________

**Test 2.2: Select Mads Voice (German Male)**
- **Precondition:** Speechify available
- **Steps:**
  1. Open TTS Manual Trigger
  2. Enter German text: "Guten Morgen, wie geht es Ihnen?"
  3. Engine: Speechify
  4. Voice: Mads
  5. Click Speak
- **Expected:** German text synthesized with Mads voice
- **Audio Quality:** Proper German pronunciation
- **Tester:** QA2
- **Date:** ___/___
- **Result:** [ ] PASS [ ] FAIL [ ] N/A
- **Notes:** ________________________

**Test 2.3: Select Diego Voice (Spanish Male)**
- **Precondition:** Speechify available
- **Steps:**
  1. Open TTS Manual Trigger
  2. Enter Spanish: "Hola, ¿cómo estás?"
  3. Engine: Speechify
  4. Voice: Diego
  5. Click Speak
- **Expected:** Spanish text with proper pronunciation
- **Audio Quality:** Natural Spanish accent
- **Tester:** QA2
- **Date:** ___/___
- **Result:** [ ] PASS [ ] FAIL [ ] N/A
- **Notes:** ________________________

**Test 2.4: Language Detection (German Text)**
- **Precondition:** Auto-language detection enabled
- **Steps:**
  1. Open TTS Manual Trigger
  2. Enter German: "Haben Sie einen schönen Tag"
  3. Engine: Speechify
  4. Voice: (leave empty for auto-detect)
  5. Click Speak
- **Expected:** German voice automatically selected
- **Verify:** Voice used = Mads
- **Tester:** QA2
- **Date:** ___/___
- **Result:** [ ] PASS [ ] FAIL [ ] N/A
- **Notes:** ________________________

**Test 2.5: Language Detection (Spanish Text)**
- **Precondition:** Auto-language detection enabled
- **Steps:**
  1. Open TTS Manual Trigger
  2. Enter Spanish: "Espero que estés bien"
  3. Engine: Speechify
  4. Voice: (leave empty)
  5. Click Speak
- **Expected:** Spanish voice automatically selected
- **Verify:** Voice used = Diego
- **Tester:** QA2
- **Date:** ___/___
- **Result:** [ ] PASS [ ] FAIL [ ] N/A
- **Notes:** ________________________

---

### CATEGORY 3: ENGINE FALLBACK CHAIN

**Test 3.1: Fallback from Speechify to Google**
- **Precondition:** Speechify API key disabled/invalid
- **Steps:**
  1. Disable Speechify API key temporarily
  2. Open TTS Manual Trigger
  3. Enter: "Testing fallback"
  4. Select Engine: Speechify
  5. Click Speak
- **Expected:** System falls back to Google automatically
- **Verify:** Logs show "Fallback to Google"
- **Tester:** QA3
- **Date:** ___/___
- **Result:** [ ] PASS [ ] FAIL [ ] N/A
- **Notes:** ________________________

**Test 3.2: Fallback from Google to TikTok**
- **Precondition:** Google API key disabled
- **Steps:**
  1. Disable Google API key temporarily
  2. Open TTS Manual Trigger
  3. Enter: "Testing fallback"
  4. Select Engine: Google
  5. Click Speak
- **Expected:** System falls back to TikTok
- **Verify:** Logs show "Fallback to TikTok"
- **Tester:** QA3
- **Date:** ___/___
- **Result:** [ ] PASS [ ] FAIL [ ] N/A
- **Notes:** ________________________

**Test 3.3: Full Fallback Chain (All → TikTok)**
- **Precondition:** Speechify & Google disabled
- **Steps:**
  1. Disable Speechify API key
  2. Disable Google API key
  3. Open TTS Manual Trigger
  4. Enter: "Full fallback test"
  5. Select Engine: Speechify
  6. Click Speak
- **Expected:** Falls through to TikTok (always available)
- **Verify:** Audio plays via TikTok
- **Tester:** QA3
- **Date:** ___/___
- **Result:** [ ] PASS [ ] FAIL [ ] N/A
- **Notes:** ________________________

**Test 3.4: Voice Adaptation on Fallback**
- **Precondition:** User has Speechify voice assigned
- **Steps:**
  1. Set user voice: "mads" (Speechify German)
  2. Disable Speechify API key
  3. Trigger TTS for this user
  4. Observe voice selection
- **Expected:** Voice adapted to available engine
- **Verify:** Voice is compatible with fallback engine
- **Tester:** QA3
- **Date:** ___/___
- **Result:** [ ] PASS [ ] FAIL [ ] N/A
- **Notes:** ________________________

---

### CATEGORY 4: PERMISSION SYSTEM

**Test 4.1: Allowed User Can Trigger Speechify**
- **Precondition:** User is in allowlist
- **Steps:**
  1. Log in as allowed user
  2. Open TTS Manual Trigger
  3. Enter text
  4. Select Speechify
  5. Click Speak
- **Expected:** TTS synthesized and queued
- **Verify:** Queue shows item, success message displayed
- **Tester:** QA1
- **Date:** ___/___
- **Result:** [ ] PASS [ ] FAIL [ ] N/A
- **Notes:** ________________________

**Test 4.2: Denied User Cannot Trigger TTS**
- **Precondition:** User is in denylist
- **Steps:**
  1. Log in as denied user
  2. Attempt to trigger TTS
  3. Observe response
- **Expected:** Request rejected with permission error
- **Verify:** Error message shown, queue empty
- **Tester:** QA1
- **Date:** ___/___
- **Result:** [ ] PASS [ ] FAIL [ ] N/A
- **Notes:** ________________________

**Test 4.3: Team Level Check for Speechify**
- **Precondition:** Min team level set to 2
- **Steps:**
  1. Log in as level 1 user
  2. Try to trigger Speechify
  3. Observe response
- **Expected:** Request denied due to team level
- **Verify:** Error message about team level
- **Tester:** QA1
- **Date:** ___/___
- **Result:** [ ] PASS [ ] FAIL [ ] N/A
- **Notes:** ________________________

---

### CATEGORY 5: QUEUE MANAGEMENT

**Test 5.1: Queue Displays Correctly**
- **Precondition:** Items in queue
- **Steps:**
  1. Add 3 TTS items to queue
  2. Open Queue Status panel
  3. Verify display
- **Expected:** All 3 items visible with correct order
- **Verify:** Position, text, engine, status all visible
- **Tester:** QA2
- **Date:** ___/___
- **Result:** [ ] PASS [ ] FAIL [ ] N/A
- **Notes:** ________________________

**Test 5.2: Queue Item Removal**
- **Precondition:** 3 items in queue
- **Steps:**
  1. Open Queue Status
  2. Click "Remove" on item 2
  3. Verify queue updated
- **Expected:** Item 2 removed, items renumbered
- **Verify:** Queue shows 2 items, positions updated
- **Tester:** QA2
- **Date:** ___/___
- **Result:** [ ] PASS [ ] FAIL [ ] N/A
- **Notes:** ________________________

**Test 5.3: Queue Skip Current Item**
- **Precondition:** Item playing
- **Steps:**
  1. Open Queue Status
  2. Click "Skip Current"
  3. Observe playback
- **Expected:** Current item skipped, next item plays
- **Verify:** Playback moves to next item
- **Tester:** QA2
- **Date:** ___/___
- **Result:** [ ] PASS [ ] FAIL [ ] N/A
- **Notes:** ________________________

**Test 5.4: Queue Overflow Handling**
- **Precondition:** Max queue size = 5
- **Steps:**
  1. Add 6 items to queue
  2. Observe 6th item handling
  3. Check queue status
- **Expected:** Queue respects max size limit
- **Verify:** Only 5 items in queue, behavior clear
- **Tester:** QA2
- **Date:** ___/___
- **Result:** [ ] PASS [ ] FAIL [ ] N/A
- **Notes:** ________________________

---

### CATEGORY 6: ERROR HANDLING

**Test 6.1: Invalid API Key Error**
- **Precondition:** Speechify with invalid API key
- **Steps:**
  1. Trigger TTS with invalid key
  2. Observe error handling
- **Expected:** Clear error message, fallback attempted
- **Verify:** Error logged, fallback to Google
- **Tester:** QA3
- **Date:** ___/___
- **Result:** [ ] PASS [ ] FAIL [ ] N/A
- **Notes:** ________________________

**Test 6.2: Network Timeout Handling**
- **Precondition:** Speechify API slow/unresponsive
- **Steps:**
  1. Simulate slow API response
  2. Trigger TTS
  3. Observe timeout handling
- **Expected:** Retry logic activates, fallback if needed
- **Verify:** Retry logs visible, eventually completes
- **Tester:** QA3
- **Date:** ___/___
- **Result:** [ ] PASS [ ] FAIL [ ] N/A
- **Notes:** ________________________

**Test 6.3: Empty Text Handling**
- **Precondition:** User tries to synthesize empty text
- **Steps:**
  1. Open TTS Manual Trigger
  2. Leave text field empty
  3. Click Speak
- **Expected:** Error message shown
- **Verify:** Clear validation error
- **Tester:** QA3
- **Date:** ___/___
- **Result:** [ ] PASS [ ] FAIL [ ] N/A
- **Notes:** ________________________

**Test 6.4: Very Long Text Handling**
- **Precondition:** Text exceeds max length
- **Steps:**
  1. Paste text with 500 characters
  2. Click Speak
  3. Observe truncation
- **Expected:** Text truncated to max length
- **Verify:** Truncation indicator shown, synthesis works
- **Tester:** QA3
- **Date:** ___/___
- **Result:** [ ] PASS [ ] FAIL [ ] N/A
- **Notes:** ________________________

---

### CATEGORY 7: CHAT INTEGRATION

**Test 7.1: Chat Message TTS with Speechify**
- **Precondition:** Chat TTS enabled, Speechify available
- **Steps:**
  1. Send chat message: "Hello everyone!"
  2. Observe TTS queue
  3. Verify audio plays
- **Expected:** Message synthesized via Speechify
- **Verify:** Queue shows item, audio plays
- **Tester:** QA1
- **Date:** ___/___
- **Result:** [ ] PASS [ ] FAIL [ ] N/A
- **Notes:** ________________________

**Test 7.2: Chat with Automatic Voice Selection**
- **Precondition:** Chat TTS enabled, auto-detection on
- **Steps:**
  1. Send German chat message: "Guten Tag!"
  2. Observe voice selection
- **Expected:** German voice automatically selected
- **Verify:** Voice matches language
- **Tester:** QA1
- **Date:** ___/___
- **Result:** [ ] PASS [ ] FAIL [ ] N/A
- **Notes:** ________________________

**Test 7.3: Chat with User Voice Assignment**
- **Precondition:** User has assigned Speechify voice
- **Steps:**
  1. Assign user to Mads voice
  2. Send chat message
  3. Observe voice used
- **Expected:** User's assigned voice used
- **Verify:** Mads voice heard in audio
- **Tester:** QA1
- **Date:** ___/___
- **Result:** [ ] PASS [ ] FAIL [ ] N/A
- **Notes:** ________________________

---

### CATEGORY 8: AUDIO QUALITY

**Test 8.1: Audio Quality - George Voice**
- **Precondition:** Audio playback device ready
- **Steps:**
  1. Synthesize: "The quick brown fox jumps"
  2. Voice: George
  3. Listen to playback
- **Expected:** Natural, clear, professional audio
- **Quality Assessment:**
  - Clarity: [ ] Excellent [ ] Good [ ] Fair [ ] Poor
  - Naturalness: [ ] Excellent [ ] Good [ ] Fair [ ] Poor
  - Speed: [ ] Good [ ] Slow [ ] Too Fast
- **Tester:** QA2
- **Date:** ___/___
- **Result:** [ ] PASS [ ] FAIL [ ] N/A
- **Notes:** ________________________

**Test 8.2: Audio Quality - Mads Voice (German)**
- **Precondition:** Audio playback device ready
- **Steps:**
  1. Synthesize: "Guten Morgen, wie geht es dir heute?"
  2. Voice: Mads
  3. Listen and assess
- **Expected:** Proper German pronunciation, natural
- **Quality Assessment:**
  - Pronunciation: [ ] Correct [ ] Minor Issues [ ] Major Issues
  - Naturalness: [ ] Excellent [ ] Good [ ] Fair [ ] Poor
  - Speed: [ ] Good [ ] Too Slow [ ] Too Fast
- **Tester:** QA2
- **Date:** ___/___
- **Result:** [ ] PASS [ ] FAIL [ ] N/A
- **Notes:** ________________________

**Test 8.3: Audio Quality - Diego Voice (Spanish)**
- **Precondition:** Audio playback device ready
- **Steps:**
  1. Synthesize: "Hola amigos, ¿cómo están ustedes?"
  2. Voice: Diego
  3. Listen and assess
- **Expected:** Proper Spanish pronunciation
- **Quality Assessment:**
  - Pronunciation: [ ] Correct [ ] Minor Issues [ ] Major Issues
  - Accent: [ ] Authentic [ ] Acceptable [ ] Off
  - Naturalness: [ ] Excellent [ ] Good [ ] Fair [ ] Poor
- **Tester:** QA2
- **Date:** ___/___
- **Result:** [ ] PASS [ ] FAIL [ ] N/A
- **Notes:** ________________________

---

### CATEGORY 9: PERFORMANCE

**Test 9.1: Synthesis Latency (< 2 seconds)**
- **Precondition:** Standard text, George voice
- **Steps:**
  1. Measure time from request to audio returned
  2. Text: "Hello World"
  3. Voice: George
  4. Record time in milliseconds
- **Expected:** Latency < 2000ms
- **Measurement:** _____ ms
- **Pass Criteria:** < 2000ms
- **Tester:** QA3
- **Date:** ___/___
- **Result:** [ ] PASS [ ] FAIL [ ] N/A
- **Notes:** ________________________

**Test 9.2: Multiple Concurrent Requests**
- **Precondition:** 5 users ready
- **Steps:**
  1. All 5 users send TTS request simultaneously
  2. Measure response times
  3. Check queue handling
- **Expected:** All requests queue successfully, no errors
- **Verify:** Queue shows 5 items, all process correctly
- **Tester:** QA3
- **Date:** ___/___
- **Result:** [ ] PASS [ ] FAIL [ ] N/A
- **Notes:** ________________________

**Test 9.3: Long Duration Stress**
- **Precondition:** System stable
- **Steps:**
  1. Continuous TTS requests for 30 minutes
  2. Monitor for memory leaks
  3. Monitor error rate
- **Expected:** No degradation, error rate < 5%
- **Verify:** System stable throughout
- **Tester:** QA3
- **Date:** ___/___
- **Result:** [ ] PASS [ ] FAIL [ ] N/A
- **Notes:** ________________________

---

### CATEGORY 10: SPECIAL CHARACTERS & EDGE CASES

**Test 10.1: Special Characters in Text**
- **Precondition:** Speechify available
- **Steps:**
  1. Text: "Hello! @#$%^&*() [brackets] {braces}"
  2. Synthesize with Speechify
  3. Verify synthesis works
- **Expected:** Special characters handled gracefully
- **Verify:** Audio synthesized without errors
- **Tester:** QA2
- **Date:** ___/___
- **Result:** [ ] PASS [ ] FAIL [ ] N/A
- **Notes:** ________________________

**Test 10.2: Unicode Characters (Emoji)**
- **Precondition:** Speechify available
- **Steps:**
  1. Text: "Hello 😊 World 🌎"
  2. Synthesize
  3. Observe handling
- **Expected:** Emoji handled gracefully
- **Verify:** Audio synthesized, emoji skipped or handled
- **Tester:** QA2
- **Date:** ___/___
- **Result:** [ ] PASS [ ] FAIL [ ] N/A
- **Notes:** ________________________

**Test 10.3: Numbers and Punctuation**
- **Precondition:** Speechify available
- **Steps:**
  1. Text: "Call 555-1234. Today's date: 2025-11-14. Price: $9.99."
  2. Synthesize
  3. Listen to playback
- **Expected:** Numbers read correctly
- **Verify:** "Five Five Five One Two Three Four" heard
- **Tester:** QA2
- **Date:** ___/___
- **Result:** [ ] PASS [ ] FAIL [ ] N/A
- **Notes:** ________________________

---

## Test Summary

### Defects Found

| ID | Title | Severity | Status | Notes |
|----|-------|----------|--------|-------|
| | | [ ] Critical [ ] High [ ] Medium [ ] Low | [ ] Open [ ] Fixed | |

### Test Statistics

**Total Tests:** _____
**Passed:** _____
**Failed:** _____
**Blocked:** _____
**Pass Rate:** _____%

### Critical Issues

**Issues Blocking Production Deployment:**
1. ___________________________________________________________
2. ___________________________________________________________
3. ___________________________________________________________

### Recommendations

1. ___________________________________________________________
2. ___________________________________________________________
3. ___________________________________________________________

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| QA Lead | __________ | ___/___/___ | __________ |
| Tech Lead | __________ | ___/___/___ | __________ |
| Product Manager | __________ | ___/___/___ | __________ |

**Overall Assessment:** [ ] APPROVED FOR PRODUCTION [ ] NEEDS REWORK [ ] BLOCKED

**Notes:**
___________________________________________________________________________
___________________________________________________________________________
___________________________________________________________________________

---

**Test Execution Complete:** ___/___/___
