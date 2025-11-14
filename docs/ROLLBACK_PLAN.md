# Speechify Integration - Rollback Strategy & Procedure

**Document Version:** 1.0
**Last Updated:** 2025-11-14
**Owner:** DevOps + On-Call Engineer
**Max RTO:** 30 minutes

---

## Executive Summary

This document outlines the procedure to quickly disable Speechify integration and revert to a stable state using Google Cloud TTS and TikTok as fallbacks.

**Key Points:**
- Rollback can be executed in <5 minutes
- Zero data loss
- No user data affected
- Service remains available during rollback
- Minimal user impact

---

## Rollback Triggers

### Automatic Rollback Triggers

These conditions automatically trigger rollback:

| Condition | Duration | Action |
|-----------|----------|--------|
| Error rate >15% | 2 minutes | DISABLE_SPEECHIFY |
| Latency P95 >6000ms | 2 minutes | DISABLE_SPEECHIFY |
| Cost >$50/hour | 1 minute | DISABLE_SPEECHIFY |
| 401/403 errors | 5 errors | DISABLE_SPEECHIFY |
| Memory >800MB | 5 minutes | RESTART + DISABLE |
| Service unavailable | 1 minute | DISABLE_ALL |

### Manual Rollback Triggers

These conditions require human decision:

1. **Critical Bug Found**
   - Unsafe behavior detected
   - Data corruption risk
   - Security vulnerability

2. **Unacceptable User Impact**
   - Multiple user complaints
   - Wrong voices consistently
   - Quality degradation

3. **Business Decision**
   - Cost overrun
   - Market conditions
   - Strategic decision

4. **Third-Party Issues**
   - Speechify service outage >1 hour
   - Rate limiting not resolved
   - API degradation ongoing

---

## Rollback Levels

### Level 1: Disable Speechify (Soft Rollback)

**When to use:** Speechify-specific issues
**Impact:** Minimal (fallback to Google/TikTok)
**Time:** 2 minutes
**Data loss:** None

**Procedure:**
```javascript
// Update configuration
config.speechifyEnabled = false;

// Persist to database
database.set('config', config);

// Clear Speechify session
speechifyEngine.reset();

// Notify users
broadcast('tts:engineDisabled', { engine: 'speechify' });

// Log action
logger.info('Speechify disabled - rolling back to fallback engines');
```

### Level 2: Restart Service (Medium Rollback)

**When to use:** Memory leak, queue corruption
**Impact:** 5-10 second outage
**Time:** 5 minutes
**Data loss:** None (queue may lose pending items)

**Procedure:**
```bash
# Graceful shutdown
npm stop tts-service

# Wait for completion
sleep 2

# Restart service
npm start tts-service

# Verify startup
curl http://localhost:3000/api/tts/status

# Disable Speechify if needed
curl -X POST http://localhost:3000/api/tts/config \
  -d '{"speechifyEnabled": false}'
```

### Level 3: Full Rollback (Major Rollback)

**When to use:** All engines affected, critical system issue
**Impact:** 30-60 second outage
**Time:** 15 minutes
**Data loss:** Queued items lost

**Procedure:**
```bash
# Stop all TTS services
npm stop

# Restore previous version from git
git checkout v2.0.0

# Reinstall dependencies
npm install

# Start services
npm start

# Verify all systems
npm test

# Notify team
slack-notify '#tts-integration' 'Full rollback completed'
```

---

## Step-by-Step Rollback Procedure

### Pre-Rollback (Preparation)

**All Scenarios:**
1. [ ] Confirm issue severity
2. [ ] Get approval from Tech Lead
3. [ ] Notify team in Slack
4. [ ] Prepare communication for users
5. [ ] Clear a terminal window for commands

### Rollback Execution

**Step 1: Alert Team (1 minute)**

```
Slack #tts-integration:
@channel INCIDENT: Rolling back Speechify due to [REASON]
- Status: IN PROGRESS
- ETA: 5 minutes
- Impact: Minimal (using Google/TikTok)
```

**Step 2: Check Current Status (1 minute)**

```bash
# Get current metrics
curl http://localhost:3000/api/tts/status | jq .

# Check error rate
curl http://localhost:3000/api/tts/metrics | jq '.errorRate'

# Check queue
curl http://localhost:3000/api/tts/queue | jq '.queue'
```

**Step 3: Disable Speechify (2 minutes)**

```bash
# Option A: Via API (recommended for Soft Rollback)
curl -X POST http://localhost:3000/api/tts/config \
  -H 'Content-Type: application/json' \
  -d '{
    "speechifyEnabled": false,
    "speechifyAsDefault": false
  }'

# Option B: Via Environment Variable (if API unavailable)
export SPEECHIFY_ENABLED=false
systemctl restart tts-service

# Option C: Via Direct Code Change (if everything else fails)
vim plugins/tts/main.js
# Change: speechifyEnabled: true → speechifyEnabled: false
# Save and restart
```

**Step 4: Verify Fallback (1 minute)**

```bash
# Test synthesis without Speechify
curl -X POST http://localhost:3000/api/tts/speak \
  -H 'Content-Type: application/json' \
  -d '{
    "text": "Testing fallback",
    "username": "test_user",
    "engine": "speechify"  # Request Speechify, should fallback
  }' | jq .

# Expected response:
{
  "success": true,
  "engine": "google",  # Should show fallback engine
  "voice": "en-US-Wavenet-C",
  "queued": true
}
```

**Step 5: Confirm Metrics Improving (2 minutes)**

```bash
# Check error rate declining
watch -n 1 'curl -s http://localhost:3000/api/tts/metrics | jq ".errorRate"'

# Check latency stable
curl http://localhost:3000/api/tts/metrics | jq '.latency'

# Check queue processing
curl http://localhost:3000/api/tts/queue | jq '.queue.length'
```

**Step 6: Update Status (1 minute)**

```
Slack #tts-integration:
✓ Speechify disabled
✓ Fallback to Google/TikTok active
✓ Error rate: 2.1% (improving)
✓ Queue: 5 items (processing normally)
Status: STABILIZED
```

### Post-Rollback (30 minutes)

**Step 1: Thorough Verification (10 minutes)**

```bash
# Run health checks
npm run healthcheck

# Run smoke tests
npm run test:smoke

# Check logs for errors
tail -100 logs/tts.log | grep ERROR

# Check all engines status
curl http://localhost:3000/api/tts/status | jq '.status.engines'
```

**Step 2: Root Cause Analysis (10 minutes)**

- [ ] Review error logs
- [ ] Identify what failed
- [ ] Determine if code, config, or infrastructure issue
- [ ] Document findings

**Step 3: Documentation (10 minutes)**

```markdown
## Incident: Speechify Rollback [Date/Time]

**Trigger:** [Error rate >15% / Cost spike / Other]
**Duration:** X minutes
**Root Cause:** [Brief description]
**Resolution:** [What was disabled/fixed]
**Time to Resolution:** X minutes

**Metrics:**
- Before: Error rate 25%, Latency 5000ms
- After: Error rate 2%, Latency 1800ms

**Prevention:**
- [Action item 1]
- [Action item 2]

**Owner:** [Engineer name]
**Date:** [Date]
```

---

## Rollback Decision Tree

```
CRITICAL ISSUE DETECTED
        |
        v
Is it Speechify-specific? (Check error logs)
        |
    YES |  NO
        |   |
        v   v
    LEVEL 1   Is queue corrupted?
  (Disable      |
 Speechify)  YES | NO
        |       |  |
        |       v  v
        |   LEVEL 2  LEVEL 3
        |  (Restart) (Full Rollback)
        |       |       |
        v       v       v
    Verify Metrics Improving
        |
    GOOD?
        |
    YES | NO
        |  |
        |  v
        |  Escalate to Tech Lead
        |
        v
   COMPLETE ROLLBACK
```

---

## Rollback Testing Procedure

**Test rollback weekly in staging:**

```bash
# 1. Verify current state
curl http://staging:3000/api/tts/status

# 2. Send test request to Speechify
curl -X POST http://staging:3000/api/tts/speak \
  -d '{"text":"Test","username":"test","engine":"speechify"}'

# 3. Disable Speechify
curl -X POST http://staging:3000/api/tts/config \
  -d '{"speechifyEnabled":false}'

# 4. Send test request again
curl -X POST http://staging:3000/api/tts/speak \
  -d '{"text":"Test","username":"test","engine":"speechify"}'

# Expected: Should fallback to Google successfully

# 5. Re-enable Speechify
curl -X POST http://staging:3000/api/tts/config \
  -d '{"speechifyEnabled":true}'

# 6. Verify restored
curl http://staging:3000/api/tts/status

echo "Rollback test completed successfully"
```

---

## Rollback Readiness Checklist

**Before deploying Speechify to production:**

- [ ] Rollback procedure documented
- [ ] Rollback tested in staging
- [ ] Team trained on rollback
- [ ] Automatic rollback triggers configured
- [ ] Fallback engines ready and tested
- [ ] Communication templates prepared
- [ ] On-call engineer trained
- [ ] Escalation contacts confirmed

**Weekly verification:**

- [ ] Rollback procedure still documented and accessible
- [ ] Rollback tested in staging
- [ ] Automatic triggers verified working
- [ ] Team aware of procedure
- [ ] Communication templates updated

---

## Communication Template

### Initial Alert

```
INCIDENT ALERT - Speechify TTS

Severity: [CRITICAL / HIGH / MEDIUM]
Status: ACTIVE
Time: [HH:MM UTC]

Summary:
[1-2 sentences about what happened]

Impact:
- TTS service: [Partially affected / Fully affected]
- Users affected: [~X users / X%]
- Action taken: [Disabling Speechify, falling back to Google/TikTok]

ETA to Resolution: X minutes

Slack Channel: #tts-integration
Updates: Every 5 minutes
```

### Status Update

```
INCIDENT UPDATE - Speechify TTS

Status: [IN PROGRESS / STABILIZED / RESOLVED]
Time: [Duration so far]

Metrics:
- Error rate: X% (was Y%)
- Latency: Xms (was Yms)
- Affected users: X% (was Y%)

Current action: [What we're doing]
Next step: [What's next]

Updates continue every 5 minutes
```

### Resolution

```
INCIDENT RESOLVED - Speechify TTS

Resolved at: [HH:MM UTC]
Duration: X minutes
Root cause: [Brief description]

What happened:
[2-3 sentences]

Action taken:
- Disabled Speechify engine
- Fallback to Google/TikTok working
- Service fully recovered

Next steps:
- Root cause analysis
- Fix development
- Testing and redeployment

Thank you for your patience.
Post-mortem scheduled for [Day/Time]
```

---

## Post-Rollback Actions

### Immediate (Within 1 hour)

1. [ ] Verify system stable
2. [ ] Communicate status to team
3. [ ] Document what happened
4. [ ] Identify root cause

### Short-term (Within 24 hours)

1. [ ] Root cause analysis complete
2. [ ] Fix developed
3. [ ] Fix tested in staging
4. [ ] Determine if safe to redeploy

### Medium-term (Within 1 week)

1. [ ] Post-mortem conducted
2. [ ] Action items assigned
3. [ ] Prevention measures implemented
4. [ ] Team debriefed
5. [ ] Documentation updated

---

## Rollback Success Criteria

Rollback is successful when:

- [ ] Error rate drops below 5%
- [ ] Latency returns to <3000ms P95
- [ ] Queue processing normally
- [ ] No new errors appearing
- [ ] User feedback stabilizes
- [ ] Cost returns to baseline
- [ ] All fallback engines healthy

---

## Emergency Contacts

| Role | Name | Phone | Email | Slack |
|------|------|-------|-------|-------|
| Tech Lead | | | | |
| DevOps Lead | | | | |
| On-Call | | | | |
| Product Manager | | | | |
| VP Engineering | | | | |

---

## Escalation Path

```
Issue Detected
    ↓
On-Call Engineer (5 min decision)
    ↓
Tech Lead (escalate if unclear)
    ↓
VP Engineering (escalate if critical)
    ↓
CEO (escalate if massive impact)
```

---

## Rollback Prevention

To prevent needing rollback:

1. **Testing**
   - Comprehensive test coverage
   - Load testing before deployment
   - Canary deployments

2. **Monitoring**
   - Real-time metrics
   - Automated alerts
   - Proactive investigation

3. **Code Quality**
   - Code reviews
   - Security audits
   - Performance testing

4. **Runbooks**
   - Clear procedures
   - Regular training
   - Documented escalation

5. **Incident Response**
   - Quick detection
   - Fast mitigation
   - Root cause analysis

---

## Appendix: Rollback Scenarios

### Scenario A: Speechify API Auth Error

**Signs:**
- 401/403 errors from Speechify
- Error rate spike (10%+)

**Response:**
1. Check API key validity
2. If expired: Generate new key
3. Update configuration
4. Disable Speechify (Level 1)
5. Test fallback
6. Fix API key issue
7. Re-enable with new key

### Scenario B: Cost Spike

**Signs:**
- Hourly cost >$50
- Daily cost >$200

**Response:**
1. Investigate cause immediately
2. Check for abuse/bots
3. Disable Speechify (Level 1)
4. Force fallback to TikTok
5. Contact Speechify support
6. File abuse report if needed
7. Request refund
8. Fix underlying issue
9. Re-enable after fixing

### Scenario C: Memory Leak

**Signs:**
- Memory grows continuously
- Process crashes

**Response:**
1. Disable Speechify (Level 1)
2. Restart service (Level 2)
3. Monitor memory usage
4. If still growing: Full rollback (Level 3)
5. Debug code
6. Fix memory leak
7. Re-test extensively
8. Re-deploy

### Scenario D: Queue Overflow

**Signs:**
- Queue depth >500 items
- Items not processing
- Latency spike

**Response:**
1. Clear queue (data loss but necessary)
2. Restart queue processor
3. Disable Speechify to reduce load
4. Let queue clear
5. Investigate cause
6. Fix if code issue
7. Re-enable Speechify after queue cleared

---

**Rollback Plan Complete**
**Ready for Production**
**Last Tested:** [Date]
**Tested By:** [Name]
