/**
 * Speechify TTS - Load Testing Script
 *
 * Tool: k6 (https://k6.io)
 * Usage:
 *   - Sustained Load: k6 run --vus 10 --duration 60s load-test-speechify.js
 *   - Spike Load:     k6 run --vus 50 --duration 10s load-test-speechify.js
 *   - Stress Test:    k6 run --stage 30s:10 --stage 30s:50 --stage 30s:100 load-test-speechify.js
 *
 * Environment Variables:
 *   - API_BASE_URL: Base URL of the API (default: http://localhost:3000)
 *   - ADMIN_TOKEN: Admin authentication token
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// =============================================================================
// CONFIGURATION
// =============================================================================

const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3000';
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || 'test-token-12345';

// Test data
const TEST_TEXTS = [
    'Hello, this is a test message',
    'How are you doing today?',
    'The quick brown fox jumps over the lazy dog',
    'Testing Speechify TTS integration',
    'This is a longer message to test different text lengths and see how the system performs',
    'Guten Tag, wie geht es Ihnen?',
    'Bonjour, comment allez-vous?',
    'Hola, ¿cómo estás?',
    '你好世界',
    'こんにちは'
];

const VOICES = {
    speechify: ['george', 'mads', 'diego', 'henry', 'snowy'],
    google: ['en-US-Wavenet-A', 'de-DE-Wavenet-B', 'es-ES-Wavenet-A'],
    tiktok: ['en_us_ghostface', 'de_001', 'es_002']
};

// =============================================================================
// CUSTOM METRICS
// =============================================================================

const errorRate = new Rate('error_rate');
const successRate = new Rate('success_rate');
const fallbackRate = new Rate('fallback_rate');

const ttsLatency = new Trend('tts_latency', true);
const synthesisLatency = new Trend('synthesis_latency', true);
const queueWaitTime = new Trend('queue_wait_time', true);

const speechifyRequests = new Counter('speechify_requests');
const googleRequests = new Counter('google_requests');
const tiktokRequests = new Counter('tiktok_requests');

const totalCost = new Counter('total_cost_usd');
const totalCharacters = new Counter('total_characters');

// =============================================================================
// TEST CONFIGURATION
// =============================================================================

export const options = {
    // Test stages (can be overridden by CLI)
    stages: [
        { duration: '30s', target: 10 },  // Ramp up to 10 users
        { duration: '60s', target: 10 },  // Stay at 10 users
        { duration: '30s', target: 0 },   // Ramp down to 0 users
    ],

    // Thresholds (test fails if these are not met)
    thresholds: {
        'error_rate': ['rate<0.05'],         // Error rate < 5%
        'success_rate': ['rate>0.95'],       // Success rate > 95%
        'fallback_rate': ['rate<0.10'],      // Fallback rate < 10%
        'tts_latency': ['p(95)<3000'],       // P95 latency < 3s
        'http_req_duration': ['p(95)<5000'], // HTTP P95 < 5s
        'http_req_failed': ['rate<0.05'],    // HTTP error rate < 5%
    },

    // Summary export
    summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

// =============================================================================
// SETUP FUNCTION (runs once before tests)
// =============================================================================

export function setup() {
    console.log('='.repeat(80));
    console.log('SPEECHIFY TTS - LOAD TEST');
    console.log('='.repeat(80));
    console.log(`Base URL: ${BASE_URL}`);
    console.log(`VUs: ${options.stages[1].target}`);
    console.log(`Duration: ${options.stages[1].duration}`);
    console.log('');

    // Check API status
    const statusRes = http.get(`${BASE_URL}/api/tts/status`);
    if (statusRes.status !== 200) {
        throw new Error(`API not available: ${statusRes.status}`);
    }

    const status = JSON.parse(statusRes.body);
    console.log('Engine Status:');
    console.log(`  - TikTok: ${status.status.engines.tiktok}`);
    console.log(`  - Google: ${status.status.engines.google}`);
    console.log(`  - Speechify: ${status.status.engines.speechify}`);
    console.log('');

    return {
        status: status.status,
        startTime: Date.now()
    };
}

// =============================================================================
// MAIN TEST FUNCTION (runs for each VU iteration)
// =============================================================================

export default function(data) {
    // Random test data
    const text = TEST_TEXTS[Math.floor(Math.random() * TEST_TEXTS.length)];
    const engine = selectRandomEngine(data.status.engines);
    const voice = selectRandomVoice(engine);
    const username = `LoadTest_User${__VU}`;

    // Track start time
    const requestStart = Date.now();

    // Make TTS request
    const payload = JSON.stringify({
        text: text,
        username: username,
        engine: engine,
        voiceId: voice,
        source: 'load_test'
    });

    const params = {
        headers: {
            'Content-Type': 'application/json',
        },
        timeout: '30s',
    };

    const response = http.post(`${BASE_URL}/api/tts/speak`, payload, params);

    // Calculate latency
    const latency = Date.now() - requestStart;
    ttsLatency.add(latency);

    // Validate response
    const success = check(response, {
        'status is 200': (r) => r.status === 200,
        'has success field': (r) => JSON.parse(r.body).success !== undefined,
        'response time OK': (r) => r.timings.duration < 5000,
    });

    if (success) {
        const body = JSON.parse(response.body);

        if (body.success) {
            successRate.add(1);
            errorRate.add(0);

            // Track which engine was used
            if (body.engine === 'speechify') {
                speechifyRequests.add(1);
            } else if (body.engine === 'google') {
                googleRequests.add(1);
                if (engine === 'speechify') {
                    fallbackRate.add(1); // Fallback occurred
                }
            } else if (body.engine === 'tiktok') {
                tiktokRequests.add(1);
                if (engine !== 'tiktok') {
                    fallbackRate.add(1); // Fallback occurred
                }
            }

            // Track queue metrics
            if (body.estimatedWaitMs) {
                queueWaitTime.add(body.estimatedWaitMs);
            }

            // Track cost (estimate)
            if (body.engine === 'speechify') {
                const chars = text.length;
                const cost = (chars / 1000) * 0.015; // $0.015 per 1k chars
                totalCost.add(cost);
                totalCharacters.add(chars);
            }

        } else {
            // Request returned error
            successRate.add(0);
            errorRate.add(1);
            console.error(`TTS Error: ${body.error} - ${body.reason || ''}`);
        }
    } else {
        // HTTP request failed
        successRate.add(0);
        errorRate.add(1);
        console.error(`HTTP Error: ${response.status} - ${response.body.substring(0, 100)}`);
    }

    // Random sleep between requests (1-3 seconds)
    sleep(Math.random() * 2 + 1);
}

// =============================================================================
// TEARDOWN FUNCTION (runs once after all tests)
// =============================================================================

export function teardown(data) {
    const duration = (Date.now() - data.startTime) / 1000;

    console.log('');
    console.log('='.repeat(80));
    console.log('LOAD TEST SUMMARY');
    console.log('='.repeat(80));
    console.log(`Duration: ${duration.toFixed(2)}s`);
    console.log('');
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function selectRandomEngine(engines) {
    const available = [];
    if (engines.tiktok) available.push('tiktok');
    if (engines.google) available.push('google');
    if (engines.speechify) available.push('speechify');

    if (available.length === 0) {
        throw new Error('No engines available');
    }

    // Weight selection (50% Speechify, 30% Google, 20% TikTok)
    const rand = Math.random();
    if (rand < 0.5 && available.includes('speechify')) {
        return 'speechify';
    } else if (rand < 0.8 && available.includes('google')) {
        return 'google';
    } else {
        return available[Math.floor(Math.random() * available.length)];
    }
}

function selectRandomVoice(engine) {
    const voices = VOICES[engine] || VOICES.tiktok;
    return voices[Math.floor(Math.random() * voices.length)];
}

// =============================================================================
// CUSTOM SCENARIOS (Optional)
// =============================================================================

export const scenarios = {
    // Sustained load test
    sustained_load: {
        executor: 'constant-vus',
        vus: 10,
        duration: '60s',
        gracefulStop: '30s',
        tags: { scenario: 'sustained' },
        exec: 'default',
    },

    // Spike test
    spike_load: {
        executor: 'ramping-vus',
        startVUs: 0,
        stages: [
            { duration: '5s', target: 50 },   // Spike to 50 users
            { duration: '30s', target: 50 },  // Stay at 50
            { duration: '5s', target: 0 },    // Ramp down
        ],
        gracefulRampDown: '10s',
        tags: { scenario: 'spike' },
        exec: 'default',
    },

    // Stress test (gradually increase load)
    stress_test: {
        executor: 'ramping-vus',
        startVUs: 0,
        stages: [
            { duration: '30s', target: 10 },
            { duration: '30s', target: 25 },
            { duration: '30s', target: 50 },
            { duration: '30s', target: 75 },
            { duration: '30s', target: 100 },
            { duration: '60s', target: 100 },  // Sustain max load
            { duration: '30s', target: 0 },    // Ramp down
        ],
        gracefulRampDown: '30s',
        tags: { scenario: 'stress' },
        exec: 'default',
    },
};

// =============================================================================
// HANDLE SUMMARY (Custom output formatting)
// =============================================================================

export function handleSummary(data) {
    const summary = {
        'Test Duration': `${data.state.testRunDurationMs / 1000}s`,
        'Total Requests': data.metrics.http_reqs.values.count,
        'Success Rate': `${(data.metrics.success_rate.values.rate * 100).toFixed(2)}%`,
        'Error Rate': `${(data.metrics.error_rate.values.rate * 100).toFixed(2)}%`,
        'Fallback Rate': `${(data.metrics.fallback_rate?.values.rate * 100 || 0).toFixed(2)}%`,
        'Latency P95': `${data.metrics.tts_latency.values['p(95)'].toFixed(2)}ms`,
        'Latency P99': `${data.metrics.tts_latency.values['p(99)'].toFixed(2)}ms`,
        'Latency Max': `${data.metrics.tts_latency.values.max.toFixed(2)}ms`,
        'Speechify Requests': data.metrics.speechify_requests?.values.count || 0,
        'Google Requests': data.metrics.google_requests?.values.count || 0,
        'TikTok Requests': data.metrics.tiktok_requests?.values.count || 0,
        'Total Cost (USD)': `$${(data.metrics.total_cost_usd?.values.count || 0).toFixed(4)}`,
        'Total Characters': data.metrics.total_characters?.values.count || 0,
    };

    console.log('');
    console.log('='.repeat(80));
    console.log('CUSTOM SUMMARY');
    console.log('='.repeat(80));
    Object.keys(summary).forEach(key => {
        console.log(`${key.padEnd(25)}: ${summary[key]}`);
    });
    console.log('='.repeat(80));
    console.log('');

    // Return default summary + custom JSON file
    return {
        'stdout': textSummary(data, { indent: ' ', enableColors: true }),
        'summary.json': JSON.stringify(data),
        'summary-custom.txt': Object.keys(summary).map(k => `${k}: ${summary[k]}`).join('\n'),
    };
}

// =============================================================================
// HELPER: Text summary (simplified)
// =============================================================================

function textSummary(data, options = {}) {
    const indent = options.indent || '  ';
    const enableColors = options.enableColors || false;

    let output = '\n';
    output += '='.repeat(80) + '\n';
    output += 'k6 SUMMARY\n';
    output += '='.repeat(80) + '\n\n';

    // Metrics
    Object.keys(data.metrics).forEach(metricName => {
        const metric = data.metrics[metricName];
        output += `${indent}${metricName}:\n`;

        if (metric.values.count !== undefined) {
            output += `${indent}${indent}count: ${metric.values.count}\n`;
        }
        if (metric.values.rate !== undefined) {
            output += `${indent}${indent}rate: ${(metric.values.rate * 100).toFixed(2)}%\n`;
        }
        if (metric.values.avg !== undefined) {
            output += `${indent}${indent}avg: ${metric.values.avg.toFixed(2)}\n`;
        }
        if (metric.values['p(95)'] !== undefined) {
            output += `${indent}${indent}p95: ${metric.values['p(95)'].toFixed(2)}\n`;
        }
    });

    output += '\n' + '='.repeat(80) + '\n';
    return output;
}
