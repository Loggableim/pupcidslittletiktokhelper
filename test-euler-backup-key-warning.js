/**
 * Test script to verify Euler backup key warning functionality
 * This verifies that the correct warning is shown when using the Euler backup key
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Euler Backup Key Warning Implementation\n');

let testsPassed = 0;
let testsFailed = 0;

// Test 1: Verify EULER_BACKUP_KEY constant exists in tiktok.js
console.log('Test 1: Verify EULER_BACKUP_KEY constant exists in tiktok.js');
const tiktokModule = fs.readFileSync(path.join(__dirname, 'modules/tiktok.js'), 'utf8');
const hasEulerBackupKey = tiktokModule.includes('EULER_BACKUP_KEY');
const eulerBackupKeyValue = tiktokModule.match(/EULER_BACKUP_KEY\s*=\s*['"](euler_[^'"]+)['"]/);

if (hasEulerBackupKey && eulerBackupKeyValue) {
    console.log('   ✅ EULER_BACKUP_KEY constant defined');
    console.log(`   Key value: ${eulerBackupKeyValue[1].substring(0, 20)}...`);
    console.log(`   Key length: ${eulerBackupKeyValue[1].length}`);
    testsPassed++;
} else {
    console.log('   ❌ EULER_BACKUP_KEY constant not found');
    testsFailed++;
}
console.log('');

// Test 2: Verify detection logic exists
console.log('Test 2: Verify detection logic for Euler backup key');
const hasDetectionLogic = tiktokModule.includes('apiKey === EULER_BACKUP_KEY');
const hasDelayLogic = tiktokModule.includes('await new Promise(resolve => setTimeout(resolve, 10000))');
const hasWarningEmit = tiktokModule.includes("emit('euler-backup-key-warning'");

if (hasDetectionLogic) {
    console.log('   ✅ Detection logic exists (apiKey === EULER_BACKUP_KEY)');
    testsPassed++;
} else {
    console.log('   ❌ Detection logic not found');
    testsFailed++;
}

if (hasDelayLogic) {
    console.log('   ✅ 10-second delay logic exists');
    testsPassed++;
} else {
    console.log('   ❌ 10-second delay logic not found');
    testsFailed++;
}

if (hasWarningEmit) {
    console.log('   ✅ Warning event emit exists');
    testsPassed++;
} else {
    console.log('   ❌ Warning event emit not found');
    testsFailed++;
}
console.log('');

// Test 3: Verify frontend handler exists in dashboard.js
console.log('Test 3: Verify frontend handler exists in dashboard.js');
const dashboardJs = fs.readFileSync(path.join(__dirname, 'public/js/dashboard.js'), 'utf8');
const hasSocketListener = dashboardJs.includes("socket.on('euler-backup-key-warning'");
const hasShowFunction = dashboardJs.includes('function showEulerBackupKeyWarning');

if (hasSocketListener) {
    console.log('   ✅ Socket listener exists');
    testsPassed++;
} else {
    console.log('   ❌ Socket listener not found');
    testsFailed++;
}

if (hasShowFunction) {
    console.log('   ✅ showEulerBackupKeyWarning function exists');
    testsPassed++;
} else {
    console.log('   ❌ showEulerBackupKeyWarning function not found');
    testsFailed++;
}
console.log('');

// Test 4: Verify the warning is non-dismissible
console.log('Test 4: Verify warning popup is non-dismissible');
const hasNonDismissible = dashboardJs.includes('user-select: none');
const hasClickPrevention = dashboardJs.includes('e.preventDefault()');
const hasWarningText = dashboardJs.includes('Dieses Fenster kann nicht geschlossen werden');

if (hasNonDismissible) {
    console.log('   ✅ Non-dismissible styling (user-select: none)');
    testsPassed++;
} else {
    console.log('   ❌ Non-dismissible styling not found');
    testsFailed++;
}

if (hasClickPrevention) {
    console.log('   ✅ Click prevention logic exists');
    testsPassed++;
} else {
    console.log('   ❌ Click prevention logic not found');
    testsFailed++;
}

if (hasWarningText) {
    console.log('   ✅ Warning text about non-dismissible overlay exists');
    testsPassed++;
} else {
    console.log('   ❌ Warning text not found');
    testsFailed++;
}
console.log('');

// Test 5: Verify countdown timer exists
console.log('Test 5: Verify countdown timer functionality');
const hasCountdownTimer = dashboardJs.includes('euler-countdown-timer');
const hasCountdownInterval = dashboardJs.match(/const countdownInterval = setInterval/g);

if (hasCountdownTimer) {
    console.log('   ✅ Countdown timer element exists');
    testsPassed++;
} else {
    console.log('   ❌ Countdown timer element not found');
    testsFailed++;
}

if (hasCountdownInterval && hasCountdownInterval.length >= 2) {
    console.log('   ✅ Countdown interval logic exists (found in both functions)');
    testsPassed++;
} else {
    console.log('   ❌ Countdown interval logic not found or incomplete');
    testsFailed++;
}
console.log('');

// Summary
console.log('='.repeat(80));
console.log('Test Summary:');
console.log(`  ✅ Tests Passed: ${testsPassed}`);
console.log(`  ❌ Tests Failed: ${testsFailed}`);
console.log('='.repeat(80));

if (testsFailed === 0) {
    console.log('\n🎉 All tests passed! Implementation is complete.');
    console.log('\nFeatures implemented:');
    console.log('  - EULER_BACKUP_KEY constant defined');
    console.log('  - Detection logic for Euler backup key');
    console.log('  - 10-second delay before connection');
    console.log('  - Non-dismissible warning popup');
    console.log('  - Countdown timer showing remaining seconds');
    console.log('  - Warning event emitted to frontend');
    console.log('  - Frontend handler for displaying the warning');
    process.exit(0);
} else {
    console.log('\n❌ Some tests failed. Please review the implementation.');
    process.exit(1);
}
