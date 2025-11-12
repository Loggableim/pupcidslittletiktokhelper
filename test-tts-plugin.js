// Quick test to see if TTS plugin can be loaded
const path = require('path');

console.log('Testing TTS Plugin Load...\n');

// Test 1: Check files exist
const fs = require('fs');
const pluginDir = path.join(__dirname, 'plugins/tts');

console.log('1. Checking plugin directory...');
if (!fs.existsSync(pluginDir)) {
    console.error('❌ Plugin directory not found:', pluginDir);
    process.exit(1);
}
console.log('✓ Plugin directory exists');

// Test 2: Check manifest
const manifestPath = path.join(pluginDir, 'plugin.json');
console.log('\n2. Checking manifest...');
try {
    const manifest = require(manifestPath);
    console.log('✓ Manifest valid');
    console.log('  - ID:', manifest.id);
    console.log('  - Name:', manifest.name);
    console.log('  - Version:', manifest.version);
    console.log('  - Entry:', manifest.entry);
    console.log('  - Enabled:', manifest.enabled);
} catch (error) {
    console.error('❌ Manifest error:', error.message);
    process.exit(1);
}

// Test 3: Check entry file
const entryPath = path.join(pluginDir, 'main.js');
console.log('\n3. Checking entry file...');
if (!fs.existsSync(entryPath)) {
    console.error('❌ Entry file not found:', entryPath);
    process.exit(1);
}
console.log('✓ Entry file exists');

// Test 4: Try to load main.js
console.log('\n4. Loading main.js...');
try {
    const PluginClass = require(entryPath);
    console.log('✓ Main.js loaded');
    console.log('  - Type:', typeof PluginClass);
    console.log('  - Constructor:', PluginClass.name);
} catch (error) {
    console.error('❌ Failed to load main.js:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
}

console.log('\n✅ All tests passed! Plugin should be loadable.');
console.log('\nIf plugin still doesn\'t load, check server logs for errors.');
