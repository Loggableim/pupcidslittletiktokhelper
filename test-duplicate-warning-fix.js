/**
 * Test script to verify fallback key warning deduplication fix
 * This test verifies that the warning functions check for existing overlays
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Duplicate Warning Fix\n');

// Test 1: Verify showFallbackKeyWarning has duplicate check
console.log('Test 1: Verify showFallbackKeyWarning has duplicate check');
const dashboardJs = fs.readFileSync(path.join(__dirname, 'public/js/dashboard.js'), 'utf8');

const hasFallbackCheck = dashboardJs.includes("if (document.getElementById('fallback-key-overlay'))");
const hasSkipLog = dashboardJs.includes('Fallback key warning already displayed, skipping duplicate');

console.log('   Duplicate check exists:', hasFallbackCheck ? '✅' : '❌');
console.log('   Skip log exists:', hasSkipLog ? '✅' : '❌');

if (!hasFallbackCheck || !hasSkipLog) {
    console.log('   ❌ Test 1 failed\n');
    process.exit(1);
}
console.log('   ✅ Test 1 passed\n');

// Test 2: Verify showEulerBackupKeyWarning has duplicate check
console.log('Test 2: Verify showEulerBackupKeyWarning has duplicate check');

const hasEulerCheck = dashboardJs.includes("if (document.getElementById('euler-backup-key-overlay'))");
const hasEulerSkipLog = dashboardJs.includes('Euler backup key warning already displayed, skipping duplicate');

console.log('   Duplicate check exists:', hasEulerCheck ? '✅' : '❌');
console.log('   Skip log exists:', hasEulerSkipLog ? '✅' : '❌');

if (!hasEulerCheck || !hasEulerSkipLog) {
    console.log('   ❌ Test 2 failed\n');
    process.exit(1);
}
console.log('   ✅ Test 2 passed\n');

// Test 3: Verify _extractStatsFromRoomInfo method exists in tiktok.js
console.log('Test 3: Verify _extractStatsFromRoomInfo method exists in tiktok.js');
const tiktokJs = fs.readFileSync(path.join(__dirname, 'modules/tiktok.js'), 'utf8');

const hasStatsExtraction = tiktokJs.includes('_extractStatsFromRoomInfo(roomInfo)');
const hasStatsMethod = tiktokJs.includes('_extractStatsFromRoomInfo(message.data)');
const hasViewerExtraction = tiktokJs.includes("Extracted viewer count from roomInfo");
const hasLikeExtraction = tiktokJs.includes("Extracted like count from roomInfo");
const hasFollowerExtraction = tiktokJs.includes("Extracted follower count from roomInfo");

console.log('   Stats extraction method exists:', hasStatsExtraction ? '✅' : '❌');
console.log('   Stats method called on roomInfo:', hasStatsMethod ? '✅' : '❌');
console.log('   Viewer extraction logging:', hasViewerExtraction ? '✅' : '❌');
console.log('   Like extraction logging:', hasLikeExtraction ? '✅' : '❌');
console.log('   Follower extraction logging:', hasFollowerExtraction ? '✅' : '❌');

if (!hasStatsExtraction || !hasStatsMethod || !hasViewerExtraction || !hasLikeExtraction || !hasFollowerExtraction) {
    console.log('   ❌ Test 3 failed\n');
    process.exit(1);
}
console.log('   ✅ Test 3 passed\n');

// Test 4: Verify roomInfo handler calls stats extraction
console.log('Test 4: Verify roomInfo handler calls stats extraction');

const roomInfoHandlerPattern = /if \(message\.type === 'roomInfo'\) \{[\s\S]*?_extractStatsFromRoomInfo\(message\.data\)/;
const hasRoomInfoHandler = roomInfoHandlerPattern.test(tiktokJs);

console.log('   roomInfo handler calls stats extraction:', hasRoomInfoHandler ? '✅' : '❌');

if (!hasRoomInfoHandler) {
    console.log('   ❌ Test 4 failed\n');
    process.exit(1);
}
console.log('   ✅ Test 4 passed\n');

console.log('🎉 All tests passed!\n');
console.log('Summary:');
console.log('- Fallback warning deduplication: ✅');
console.log('- Euler backup warning deduplication: ✅');
console.log('- Stats extraction from roomInfo: ✅');
console.log('- Stats extraction integrated into roomInfo handler: ✅');
