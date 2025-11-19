# Remaining Issues to Fix

This document tracks all outstanding issues reported by the user that require fixes in the resource monitor plugin and other components.

## 🔴 Critical Issues

### 1. Resource Monitor - Multiple Problems

#### Issue 1.1: GPU Detection Wrong
**Problem**: GPU showing "Meta Virtual Monitor" instead of actual NVIDIA 3060

**Location**: `/plugins/resource-monitor/` backend

**Expected**: Should detect and display NVIDIA GeForce RTX 3060

**Actual**: Shows "Meta Virtual Monitor"

**Likely Cause**: 
- GPU detection logic is using wrong adapter
- Might be detecting virtual display instead of physical GPU
- Need to filter out virtual/meta devices

**Fix Required**:
```javascript
// Need to filter GPU list to exclude virtual monitors
// Prioritize discrete GPUs (NVIDIA, AMD, Intel Arc)
// Fallback to integrated GPU if no discrete found
```

---

#### Issue 1.2: Compact Mode Not Working
**Problem**: "compact mode ändert sogut wie garnichts. muss viel kompakter werden"

**Location**: `/plugins/resource-monitor/ui` or `/public/resource-monitor/`

**Expected**: Compact mode should significantly reduce space usage

**Actual**: Minimal difference between normal and compact modes

**Fix Required**:
- Reduce padding and margins in compact mode
- Smaller font sizes
- Hide less important metrics
- Use multi-column layout
- Reduce chart heights

**CSS Changes Needed**:
```css
.compact-mode .metric-card {
  padding: 8px;  /* Currently too large */
  font-size: 0.85rem;
}
.compact-mode .chart {
  height: 100px;  /* Reduce from current height */
}
```

---

#### Issue 1.3: "This Process" Not Showing
**Problem**: "im ressources monitor wird 'this process' nicht angezeigt"

**Location**: `/plugins/resource-monitor/` backend

**Expected**: Should show current Node.js process (TikTok Helper) in process list

**Actual**: Current process is missing from display

**Likely Cause**:
- Process filtering excludes own PID
- Process name matching issue
- Permission problem reading own process stats

**Fix Required**:
```javascript
// Ensure current process (process.pid) is included
// Highlight it as "This Process" or "TikTok Helper"
// Show memory, CPU usage specific to this process
```

---

#### Issue 1.4: CPU Temperature Not Showing
**Problem**: "temperatur der cpu auch nicht"

**Location**: `/plugins/resource-monitor/` backend (sensor reading)

**Expected**: Display CPU temperature in degrees Celsius

**Actual**: Temperature not displayed

**Likely Cause**:
- Platform-specific sensor APIs not working
- Permissions issue (requires admin/root on some platforms)
- Sensor library not configured correctly

**Platform-Specific Solutions**:
- **Windows**: Use WMI or OpenHardwareMonitor
- **Linux**: Read from `/sys/class/thermal/` or `lm-sensors`
- **Mac**: Use SMC (System Management Controller)

**Fix Required**:
```javascript
// Windows: Win32_TemperatureProbe or OpenHardwareMonitor
// Linux: cat /sys/class/thermal/thermal_zone0/temp
// Mac: powermetrics or SMC
// Add fallback if sensors unavailable
```

---

#### Issue 1.5: CPU Usage Warning Shows Total, Not Process-Specific
**Problem**: "die cpu usage warning sollte nicht auf die gesamte cpu auslastung anzeigen, sondern nur auf die auslastung des tiktokhelper tools"

**Location**: `/plugins/resource-monitor/` backend (warning logic)

**Expected**: Warning triggers based on TikTok Helper's CPU usage

**Actual**: Warning triggers based on total system CPU usage

**Fix Required**:
```javascript
// Change warning threshold logic:
// OLD: if (totalCPU > 80%) → show warning
// NEW: if (thisProcessCPU > 50%) → show warning

// Get process-specific CPU usage
const processCPU = process.cpuUsage();
const processPercent = (processCPU.user + processCPU.system) / totalCPU;

// Trigger warning if THIS process uses too much
if (processPercent > warningThreshold) {
  showWarning(`TikTok Helper using ${processPercent}% CPU`);
}
```

---

## 🟡 Medium Priority Issues

### 2. Gift Milestones GUI Optimization

**Problem**: "gui bereich von gift milestones so optimieren dass mehrspaltige navigation statt einfacher um unnötiges scrollen nach unten zu vermeiden, ausserdem allgemein etwas kompakter gestalten"

**Location**: `/plugins/gift-milestone/` or gift milestone view in dashboard

**Requirements**:
1. Multi-column navigation (currently single column)
2. More compact layout
3. Reduce unnecessary scrolling
4. Better space utilization

**Expected Layout**:
```
[Milestone 1] [Milestone 2] [Milestone 3]
[Milestone 4] [Milestone 5] [Milestone 6]
```

**Current Layout**:
```
[Milestone 1]
[Milestone 2]
[Milestone 3]
[Milestone 4]
[Milestone 5]
[Milestone 6]
```

**CSS Changes Needed**:
```css
.milestone-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1rem;
}

.milestone-card {
  padding: 0.75rem;  /* More compact */
}
```

---

## ✅ Already Fixed

1. ✅ Side navigation menu structure
2. ✅ MyInstants API with caching
3. ✅ Cache cleanup on launch
4. ✅ Plugin layout bugs (quiz plugin showing everywhere)
5. ✅ Audio debugging system
6. ✅ JavaScript null pointer errors
7. ✅ MyInstants search not working
8. ✅ Missing views (weather, plugins, wiki, settings, etc.)
9. ✅ Audio Test section moved to bottom

---

## 📋 Implementation Priority

### High Priority (Fix First)
1. **Resource Monitor - "This Process" display** - Users need to see app resource usage
2. **Resource Monitor - CPU usage warning logic** - Currently misleading
3. **Resource Monitor - GPU detection** - Wrong hardware shown

### Medium Priority
4. **Resource Monitor - CPU temperature** - Nice to have but may require platform-specific code
5. **Resource Monitor - Compact mode** - UX improvement
6. **Gift Milestones - Multi-column layout** - UX improvement

---

## 🔧 Files to Modify

### Resource Monitor Plugin
- `/plugins/resource-monitor/main.js` - Backend logic
- `/plugins/resource-monitor/ui/index.html` - Frontend UI
- `/plugins/resource-monitor/ui/script.js` - Frontend logic
- `/plugins/resource-monitor/ui/styles.css` - Styling

### Gift Milestone Plugin
- `/plugins/gift-milestone/ui/index.html` - Layout
- `/plugins/gift-milestone/ui/styles.css` - Grid layout

---

## 📝 Notes

- Resource monitor issues are likely in the plugin code, not dashboard.html
- GPU detection might need platform-specific detection logic
- CPU temperature reading requires different approaches per OS
- Process-specific CPU usage should use Node.js `process.cpuUsage()` API
- Compact mode needs significant CSS changes to be truly compact

---

**Last Updated**: 2025-11-19
**Status**: Documented, ready for implementation
