#!/usr/bin/env node

/**
 * Test script for Resource Monitor Plugin
 * Validates plugin structure and loadability
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Resource Monitor Plugin...\n');

// Test 1: Check plugin directory structure
console.log('1️⃣  Checking plugin directory structure...');
const pluginDir = path.join(__dirname, 'plugins', 'resource-monitor');
const requiredFiles = [
    'plugin.json',
    'main.js',
    'ui.html',
    'utils/metrics-collector.js'
];

let allFilesExist = true;
for (const file of requiredFiles) {
    const filePath = path.join(pluginDir, file);
    if (fs.existsSync(filePath)) {
        console.log(`   ✅ ${file} exists`);
    } else {
        console.log(`   ❌ ${file} missing!`);
        allFilesExist = false;
    }
}

if (!allFilesExist) {
    console.error('\n❌ Plugin structure incomplete!');
    process.exit(1);
}

// Test 2: Validate plugin.json
console.log('\n2️⃣  Validating plugin.json...');
try {
    const manifestPath = path.join(pluginDir, 'plugin.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    const requiredFields = ['id', 'name', 'version', 'entry', 'permissions'];
    for (const field of requiredFields) {
        if (manifest[field]) {
            console.log(`   ✅ ${field}: ${JSON.stringify(manifest[field])}`);
        } else {
            console.log(`   ❌ Missing required field: ${field}`);
            process.exit(1);
        }
    }

    if (manifest.id !== 'resource-monitor') {
        console.error(`   ❌ Plugin ID should be "resource-monitor", got "${manifest.id}"`);
        process.exit(1);
    }

} catch (error) {
    console.error(`   ❌ Error parsing plugin.json: ${error.message}`);
    process.exit(1);
}

// Test 3: Load main.js
console.log('\n3️⃣  Testing main.js loadability...');
try {
    const mainPath = path.join(pluginDir, 'main.js');
    const PluginClass = require(mainPath);

    if (typeof PluginClass !== 'function') {
        console.error('   ❌ main.js does not export a class/function!');
        process.exit(1);
    }

    console.log('   ✅ main.js loads successfully');
    console.log(`   ✅ Plugin class exported: ${PluginClass.name || 'ResourceMonitorPlugin'}`);
} catch (error) {
    console.error(`   ❌ Error loading main.js: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
}

// Test 4: Load metrics collector
console.log('\n4️⃣  Testing metrics-collector.js...');
try {
    const collectorPath = path.join(pluginDir, 'utils', 'metrics-collector.js');
    const MetricsCollector = require(collectorPath);

    if (typeof MetricsCollector !== 'function') {
        console.error('   ❌ metrics-collector.js does not export a class!');
        process.exit(1);
    }

    console.log('   ✅ metrics-collector.js loads successfully');
    console.log(`   ✅ MetricsCollector class exported`);
} catch (error) {
    console.error(`   ❌ Error loading metrics-collector.js: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
}

// Test 5: Check systeminformation dependency
console.log('\n5️⃣  Checking systeminformation dependency...');
try {
    const si = require('systeminformation');
    console.log('   ✅ systeminformation package available');
    console.log(`   ℹ️  Version: ${require('systeminformation/package.json').version}`);
} catch (error) {
    console.error('   ❌ systeminformation package not installed!');
    console.error('   Run: npm install systeminformation');
    process.exit(1);
}

// Test 6: Check dashboard integration
console.log('\n6️⃣  Checking dashboard integration...');
try {
    const dashboardPath = path.join(__dirname, 'public', 'dashboard.html');
    const dashboardContent = fs.readFileSync(dashboardPath, 'utf8');

    // Check for tab button
    if (dashboardContent.includes('data-tab="resourceMonitor"')) {
        console.log('   ✅ Resource monitor tab button found in dashboard');
    } else {
        console.log('   ⚠️  Resource monitor tab button not found in dashboard');
    }

    // Check for tab content
    if (dashboardContent.includes('id="tab-resourceMonitor"')) {
        console.log('   ✅ Resource monitor tab content found in dashboard');
    } else {
        console.log('   ⚠️  Resource monitor tab content not found in dashboard');
    }

    // Check for settings section
    if (dashboardContent.includes('Resource Monitor Settings')) {
        console.log('   ✅ Resource monitor settings panel found');
    } else {
        console.log('   ⚠️  Resource monitor settings panel not found');
    }
} catch (error) {
    console.error(`   ❌ Error reading dashboard.html: ${error.message}`);
}

// Test 7: Quick metrics collection test
console.log('\n7️⃣  Testing metrics collection (quick)...');
try {
    const si = require('systeminformation');

    (async () => {
        try {
            const cpu = await si.currentLoad();
            console.log(`   ✅ CPU metrics: ${cpu.currentLoad.toFixed(2)}% load`);

            const mem = await si.mem();
            console.log(`   ✅ Memory metrics: ${(mem.used / 1024 / 1024 / 1024).toFixed(2)} GB used`);

            const graphics = await si.graphics();
            if (graphics.controllers && graphics.controllers.length > 0) {
                console.log(`   ✅ GPU detected: ${graphics.controllers[0].model}`);
            } else {
                console.log(`   ℹ️  No GPU detected (this is OK)`);
            }

            console.log('\n✅ All tests passed! Resource Monitor Plugin is ready to use.\n');
            console.log('📝 Next steps:');
            console.log('   1. Restart the server: npm start');
            console.log('   2. Open dashboard at http://localhost:3000');
            console.log('   3. Click the "🖥️ Resources" tab');
            console.log('   4. Configure settings in the Settings tab\n');

        } catch (metricsError) {
            console.error(`   ❌ Metrics collection failed: ${metricsError.message}`);
            process.exit(1);
        }
    })();

} catch (error) {
    console.error(`   ❌ Error initializing metrics test: ${error.message}`);
    process.exit(1);
}
