# Speechify TTS Integration - Runbook für On-Call Support

**Version:** 1.0
**Last Updated:** 2025-11-14
**Owner:** DevOps Team
**On-Call Contacts:** See PagerDuty Schedule

---

## Quick Reference

| Emergency | Command | Expected Time |
|-----------|---------|---------------|
| **Disable Speechify** | `curl -X POST https://api.example.com/admin/feature-flags -d '{"speechify_enabled": false}'` | 30 seconds |
| **Rollback to Previous Version** | `git revert <commit> && npm run deploy` | 15 minutes |
| **Check API Status** | `curl https://api.sws.speechify.com/health` | 5 seconds |
| **View Logs** | `tail -f /var/log/tts/speechify.log` | - |
| **Grafana Dashboard** | https://grafana.example.com/d/tts-speechify-overview | - |

---

## Table of Contents

1. [Alert Response Procedures](#alert-response-procedures)
2. [Common Issues & Solutions](#common-issues--solutions)
3. [Debugging Guide](#debugging-guide)
4. [Rollback Procedures](#rollback-procedures)
5. [Contact Information](#contact-information)

---

## Alert Response Procedures

### 🚨 CRITICAL: Speechify API Down

**Alert:** `SpeechifyAPIDown`
**Impact:** High - All Speechify TTS requests failing
**SLA:** Response within 5 minutes

#### Immediate Actions (0-5 minutes)

1. **Acknowledge alert in PagerDuty**
   ```bash
   # Acknowledge via CLI
   pd-ack --incident-id=<incident-id>
   ```

2. **Check Grafana Dashboard**
   - Open: https://grafana.example.com/d/tts-speechify-overview
   - Verify: `speechify_api_availability == 0`

3. **Verify fallback is working**
   ```bash
   # Check if fallback to Google/TikTok is active
   curl https://api.example.com/api/tts/status | jq '.engines'
   # Expected: google or tiktok should be handling requests
   ```

4. **Check Speechify Status Page**
   - Open: https://status.speechify.com
   - Look for outages or maintenance

#### Investigation (5-15 minutes)

1. **Test Speechify API directly**
   ```bash
   curl -X POST https://api.sws.speechify.com/v1/audio/speech \
     -H "Authorization: Bearer $SPEECHIFY_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "input": "Test",
       "voice_id": "george",
       "audio_format": "mp3"
     }'
   ```

2. **Check recent error logs**
   ```bash
   tail -n 100 /var/log/tts/speechify-errors.log | grep -i "speechify"
   ```

3. **Check network connectivity**
   ```bash
   ping api.sws.speechify.com
   traceroute api.sws.speechify.com
   ```

#### Resolution (15-30 minutes)

**If Speechify is down (confirmed outage):**
- ✅ Fallback should be automatic (no action needed)
- ✅ Post in Slack #incidents: "Speechify API down, fallback to Google/TikTok active"
- ✅ Monitor Speechify status page for updates
- ✅ Wait for Speechify to recover

**If network issue:**
- Check firewall rules
- Verify DNS resolution
- Contact network team

**If API key issue:**
- See "CRITICAL: API Key Invalid" below

#### Post-Incident (after resolution)

1. **Verify Speechify is back**
   ```bash
   curl https://api.example.com/api/tts/status | jq '.engines.speechify'
   # Expected: true
   ```

2. **Check success rate**
   - Grafana: Success rate should return to > 99%

3. **Document incident in PagerDuty**
   - Root cause
   - Duration
   - Impact (estimated failed requests)

4. **Schedule post-mortem** (if outage > 1 hour)

---

### 🚨 CRITICAL: API Key Invalid (401 Errors)

**Alert:** `SpeechifyAPIKeyInvalid`
**Impact:** Critical - Potential security breach
**SLA:** Response within 2 minutes

#### Immediate Actions (0-2 minutes)

1. **Acknowledge alert**

2. **Disable Speechify immediately**
   ```bash
   curl -X POST https://api.example.com/admin/feature-flags \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -d '{"speechify_enabled": false}'
   ```

3. **Verify error in logs**
   ```bash
   tail -n 50 /var/log/tts/speechify-errors.log | grep "401"
   ```

#### Investigation (2-10 minutes)

1. **Check if API key was rotated**
   - Contact team: "Did anyone rotate the Speechify API key?"
   - Check recent commits in config repo

2. **Check Speechify dashboard**
   - Login: https://dashboard.speechify.com
   - Verify API key status

3. **Check for suspicious activity**
   - Review recent API usage
   - Look for unusual spikes in requests

#### Resolution (10-20 minutes)

**If key was intentionally rotated:**
```bash
# Update API key
curl -X POST https://api.example.com/api/tts/config \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"speechifyApiKey": "NEW_API_KEY"}'

# Re-enable Speechify
curl -X POST https://api.example.com/admin/feature-flags \
  -d '{"speechify_enabled": true}'
```

**If key was compromised:**
1. **Revoke old key in Speechify dashboard**
2. **Generate new key**
3. **Update in production** (via secure channel)
4. **Audit recent usage** for unauthorized access
5. **File security incident report**

---

### ⚠️ HIGH: Daily Budget Exceeded

**Alert:** `SpeechifyDailyBudgetExceeded`
**Impact:** Medium - Speechify auto-disabled
**SLA:** Response within 15 minutes

#### Immediate Actions

1. **Verify auto-disable happened**
   ```bash
   curl https://api.example.com/api/tts/status | jq '.engines.speechify'
   # Expected: false
   ```

2. **Check current cost**
   ```bash
   curl https://api.example.com/api/tts/cost/today
   ```

3. **Review cost breakdown**
   - Grafana: https://grafana.example.com/d/tts-speechify-cost

#### Investigation

1. **Identify usage spike**
   ```bash
   # Check hourly usage
   curl https://api.example.com/api/tts/cost/hourly | jq
   ```

2. **Check for abuse**
   - Review top users
   - Look for unusual patterns (spam, bot attacks)

3. **Verify pricing**
   - Confirm $0.015/1k chars is still correct
   - Check for Speechify pricing changes

#### Resolution

**If legitimate usage spike:**
- ✅ Notify stakeholders: "High TTS usage today, budget exceeded"
- ✅ Leave Speechify disabled (fallback to TikTok)
- ✅ Budget resets at midnight UTC

**If abuse detected:**
- Block abusive users
- Implement stricter rate limits
- Consider increasing budget

**If pricing error:**
- Fix cost calculation
- Adjust budget accordingly

---

### ⚠️ HIGH: Latency P95 > 5s

**Alert:** `SpeechifyLatencyHigh`
**Impact:** Medium - Poor user experience
**SLA:** Response within 30 minutes

#### Immediate Actions

1. **Check Grafana latency graph**
   - Identify when latency spike started
   - Compare with historical baseline

2. **Check Speechify status**
   - https://status.speechify.com
   - Look for performance degradation notices

#### Investigation

1. **Test direct API latency**
   ```bash
   time curl -X POST https://api.sws.speechify.com/v1/audio/speech \
     -H "Authorization: Bearer $SPEECHIFY_API_KEY" \
     -d '{"input": "Test", "voice_id": "george"}'
   ```

2. **Check our server performance**
   ```bash
   top
   htop
   # Look for CPU/memory issues
   ```

3. **Review recent deployments**
   - Did we deploy code that increased latency?

#### Resolution

**If Speechify API is slow:**
- ✅ Enable fallback to Google (faster)
- ✅ Notify Speechify support
- ✅ Monitor for improvement

**If our server is slow:**
- Scale up server resources
- Optimize code (if recent deployment)

**If network issue:**
- Check network latency
- Contact network team

---

### ⚠️ MEDIUM: Fallback Rate > 20%

**Alert:** `SpeechifyFallbackRateHigh`
**Impact:** Low-Medium - Quality degradation
**SLA:** Response within 1 hour

#### Investigation

1. **Check fallback reasons**
   ```bash
   curl https://api.example.com/api/tts/debug/logs?category=fallback | jq
   ```

2. **Identify error types**
   - API errors (500, 503)
   - Timeouts
   - Rate limits

#### Resolution

- If API errors: Monitor, contact Speechify support if persistent
- If timeouts: Increase timeout threshold
- If rate limits: Implement better rate limiting on our side

---

## Common Issues & Solutions

### Issue: "Voice not available for Speechify"

**Symptoms:**
- Error: `Voice 'en_us_ghostface' is not available for engine 'speechify'`

**Cause:**
- User requested TikTok voice with Speechify engine

**Solution:**
1. **Auto-fallback is implemented** - should automatically select compatible voice
2. **Verify auto-fallback:**
   ```javascript
   // Check in code: /plugins/tts/main.js line 686-698
   if (selectedEngine === 'speechify' && !speechifyVoices[selectedVoice]) {
       selectedVoice = SpeechifyEngine.getDefaultVoiceForLanguage(langCode);
   }
   ```
3. **If auto-fallback not working:**
   - File bug report
   - Manual fix: Update user's assigned voice

---

### Issue: "Speechify costs higher than expected"

**Symptoms:**
- Daily cost > $50
- Cost per character > $0.015

**Investigation:**
1. **Check character count**
   ```bash
   curl https://api.example.com/api/tts/cost/breakdown | jq
   ```

2. **Verify pricing**
   - Speechify dashboard: Check current pricing tier

3. **Look for usage spikes**
   - Grafana: Characters processed per hour

**Solutions:**
- Implement caching for common phrases
- Reduce max text length (currently 300 chars)
- Switch default engine to TikTok (free)

---

### Issue: "Audio quality degraded"

**Symptoms:**
- User reports: "Voice sounds robotic"
- Quality worse than before

**Investigation:**
1. **Compare with baseline**
   - Test same text with all 3 engines
   - Listen for differences

2. **Check voice ID**
   - Verify correct voice is being used
   - Check if voice was changed accidentally

**Solutions:**
- If Speechify issue: Contact Speechify support
- If user preference: Allow voice customization
- If our bug: Check voice selection logic

---

## Debugging Guide

### Enable Debug Logging

```bash
# Enable debug mode
curl -X POST https://api.example.com/api/tts/debug/toggle \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Check debug logs
curl https://api.example.com/api/tts/debug/logs?limit=100 | jq
```

### Trace a TTS Request

```bash
# Send test request with tracing
curl -X POST https://api.example.com/api/tts/speak \
  -H "Content-Type: application/json" \
  -H "X-Trace-ID: test-123" \
  -d '{
    "text": "Debug test",
    "username": "DebugUser",
    "engine": "speechify",
    "voiceId": "george"
  }'

# Check logs for trace ID
grep "test-123" /var/log/tts/*.log
```

### Check Engine Status

```bash
# Detailed engine status
curl https://api.example.com/api/tts/status | jq

# Expected output:
{
  "engines": {
    "tiktok": true,
    "google": true,
    "speechify": true
  },
  "config": {
    "defaultEngine": "speechify",
    "defaultVoice": "george"
  },
  "queue": {
    "size": 0,
    "processing": false
  }
}
```

### Test Each Engine Independently

```bash
# Test TikTok
curl -X POST https://api.example.com/api/tts/speak \
  -d '{"text": "TikTok test", "username": "Test", "engine": "tiktok"}'

# Test Google
curl -X POST https://api.example.com/api/tts/speak \
  -d '{"text": "Google test", "username": "Test", "engine": "google"}'

# Test Speechify
curl -X POST https://api.example.com/api/tts/speak \
  -d '{"text": "Speechify test", "username": "Test", "engine": "speechify"}'
```

---

## Rollback Procedures

See main document: [SPEECHIFY_TESTING_ROLLOUT_STRATEGY.md](./SPEECHIFY_TESTING_ROLLOUT_STRATEGY.md#rollback-strategie)

**Quick Rollback:**
```bash
# Level 1: Feature flag disable (30 seconds)
curl -X POST https://api.example.com/admin/feature-flags \
  -d '{"speechify_enabled": false}'

# Level 2: Code rollback (15 minutes)
git revert <commit-hash>
npm run deploy:production
```

---

## Contact Information

### On-Call Rotation
- **Primary:** See PagerDuty schedule
- **Secondary:** See PagerDuty schedule

### Team Contacts
- **Tech Lead:** tech-lead@example.com
- **Product Owner:** po@example.com
- **DevOps:** devops@example.com

### External Contacts
- **Speechify Support:** support@speechify.com
- **Emergency Hotline:** 1-800-SPEECHIFY (if available)

### Slack Channels
- **#incidents** - Critical alerts
- **#tts-alerts** - High-priority alerts
- **#tts-monitoring** - General monitoring
- **#dev-tts** - Development team

### Documentation
- **Wiki:** https://wiki.example.com/tts/speechify
- **API Docs:** https://docs.speechify.com
- **Grafana:** https://grafana.example.com
- **PagerDuty:** https://example.pagerduty.com

---

## Post-Incident Checklist

After resolving any incident:

- [ ] Update PagerDuty incident with resolution
- [ ] Document root cause
- [ ] Post summary in #incidents channel
- [ ] Update this runbook if new issues discovered
- [ ] Schedule post-mortem (if severe incident)
- [ ] Review monitoring/alerts (add new alerts if needed)
- [ ] Notify stakeholders (Product, Management)

---

## Change Log

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2025-11-14 | 1.0 | Initial version | DevOps Team |

---

**Remember:**
- ✅ Acknowledge alerts promptly
- ✅ Follow procedures systematically
- ✅ Document everything
- ✅ Communicate with team
- ✅ Don't panic! 🧘
