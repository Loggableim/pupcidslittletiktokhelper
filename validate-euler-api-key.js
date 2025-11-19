#!/usr/bin/env node
/**
 * Eulerstream API Key Validator
 * 
 * This script helps validate your Eulerstream API key configuration
 * Run: node validate-euler-api-key.js
 */

const fs = require('fs');
const path = require('path');

console.log('='.repeat(60));
console.log('Eulerstream API Key Validator');
console.log('='.repeat(60));
console.log('');

// Check 1: Environment variables
console.log('✓ Checking environment variables...');
const eulerApiKey = process.env.EULER_API_KEY;
const signApiKey = process.env.SIGN_API_KEY;

if (eulerApiKey) {
    console.log('  ✅ EULER_API_KEY found in environment');
    console.log(`     Value: ${eulerApiKey.substring(0, 8)}...${eulerApiKey.substring(eulerApiKey.length - 4)}`);
} else {
    console.log('  ⚠️  EULER_API_KEY not found in environment');
}

if (signApiKey) {
    console.log('  ✅ SIGN_API_KEY found in environment');
    console.log(`     Value: ${signApiKey.substring(0, 8)}...${signApiKey.substring(signApiKey.length - 4)}`);
} else {
    console.log('  ⚠️  SIGN_API_KEY not found in environment');
}

console.log('');

// Check 2: .env file
console.log('✓ Checking .env file...');
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    console.log('  ✅ .env file exists');
    const envContent = fs.readFileSync(envPath, 'utf-8');
    
    if (envContent.includes('EULER_API_KEY=') && !envContent.match(/EULER_API_KEY=\s*$/m)) {
        console.log('  ✅ EULER_API_KEY configured in .env file');
    } else {
        console.log('  ⚠️  EULER_API_KEY not configured or empty in .env file');
    }
    
    if (envContent.includes('SIGN_API_KEY=') && !envContent.match(/SIGN_API_KEY=\s*$/m)) {
        console.log('  ✅ SIGN_API_KEY configured in .env file');
    } else {
        console.log('  ⚠️  SIGN_API_KEY not configured or empty in .env file');
    }
} else {
    console.log('  ⚠️  .env file not found');
}

console.log('');

// Check 3: Database settings
console.log('✓ Checking database settings...');
const defaultDbPath = path.join(__dirname, 'user_configs', 'default', 'database.db');
if (fs.existsSync(defaultDbPath)) {
    console.log('  ✅ Database file exists');
    console.log('  ℹ️  Database API key can only be checked when app is running');
    console.log('     Check Dashboard Settings for "tiktok_euler_api_key"');
} else {
    console.log('  ⚠️  Database file not found (will be created on first run)');
}

console.log('');

// Check 4: Validate API key format
console.log('✓ Validating API key format...');
const apiKey = eulerApiKey || signApiKey;

if (apiKey) {
    console.log(`  Checking key: ${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`);
    
    // Check type
    if (typeof apiKey !== 'string') {
        console.log('  ❌ API key is not a string!');
    } else {
        console.log('  ✅ API key is a string');
    }
    
    // Check length
    if (apiKey.trim().length < 32) {
        console.log(`  ❌ API key is too short (${apiKey.length} chars, minimum 32 required)`);
    } else {
        console.log(`  ✅ API key length is valid (${apiKey.length} chars)`);
    }
    
    // Check for common issues
    if (apiKey.includes(' ')) {
        console.log('  ⚠️  WARNING: API key contains spaces - this may cause issues');
    }
    
    if (apiKey !== apiKey.trim()) {
        console.log('  ⚠️  WARNING: API key has leading/trailing whitespace');
    }
    
    if (apiKey.includes('"') || apiKey.includes("'")) {
        console.log('  ⚠️  WARNING: API key contains quotes - remove them');
    }
    
    // Check format (should be alphanumeric)
    if (!/^[a-zA-Z0-9]+$/.test(apiKey)) {
        console.log('  ⚠️  WARNING: API key contains non-alphanumeric characters');
        console.log('     Expected format: alphanumeric string (a-z, A-Z, 0-9)');
    } else {
        console.log('  ✅ API key format looks valid (alphanumeric)');
    }
} else {
    console.log('  ❌ No API key found to validate');
}

console.log('');
console.log('='.repeat(60));
console.log('Summary');
console.log('='.repeat(60));

if (!apiKey) {
    console.log('❌ NO API KEY CONFIGURED');
    console.log('');
    console.log('Action Required:');
    console.log('1. Get an API key from https://www.eulerstream.com');
    console.log('2. Configure it using one of these methods:');
    console.log('   a) Dashboard Settings: Set "tiktok_euler_api_key"');
    console.log('   b) Environment: export EULER_API_KEY=your_key');
    console.log('   c) .env file: EULER_API_KEY=your_key');
    console.log('');
    console.log('For detailed instructions, see: EULERSTREAM_API_GUIDE.md');
} else if (apiKey.trim().length < 32) {
    console.log('❌ INVALID API KEY (too short)');
    console.log('');
    console.log('Action Required:');
    console.log('1. Verify you copied the complete API key');
    console.log('2. Generate a new API key at https://www.eulerstream.com');
    console.log('3. Update your configuration');
} else if (!/^[a-zA-Z0-9]+$/.test(apiKey) || apiKey.includes(' ')) {
    console.log('⚠️  API KEY HAS FORMAT ISSUES');
    console.log('');
    console.log('Action Required:');
    console.log('1. Remove any quotes, spaces, or special characters');
    console.log('2. Ensure the key is exactly as shown in Eulerstream dashboard');
    console.log('3. Update your configuration with the corrected key');
} else {
    console.log('✅ API KEY CONFIGURATION LOOKS GOOD');
    console.log('');
    console.log('Next Steps:');
    console.log('1. Start the application: npm start');
    console.log('2. Connect to a live TikTok user');
    console.log('3. Check logs for successful connection');
    console.log('');
    console.log('Test connection: node test-euler-debug.js');
}

console.log('='.repeat(60));
console.log('');
