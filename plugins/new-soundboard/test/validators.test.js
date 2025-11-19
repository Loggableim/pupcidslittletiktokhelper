/**
 * Unit Tests for Validators
 */

const assert = require('assert');
const path = require('path');
const {
  isSafeLocalPath,
  isAllowedHost,
  sanitizeFilename,
  isValidSourceType,
  isValidAudioMimeType,
  isValidAudioExtension,
  isValidVolume,
  isValidDuration,
  isValidPriority,
  isValidClientType,
  sanitizeUserId,
  isValidApiKey,
  hasRequiredFields,
  sanitizeMetadata
} = require('../src/utils/validators');

// Simple test runner
function runTests() {
  let passed = 0;
  let failed = 0;
  
  function describe(name, fn) {
    console.log(`\n${name}:`);
    fn();
  }
  
  function it(name, fn) {
    try {
      fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (error) {
      console.log(`  ✗ ${name}`);
      console.log(`    ${error.message}`);
      failed++;
    }
  }

describe('Validators', () => {
  describe('isSafeLocalPath', () => {
    it('should allow paths within base directory', () => {
      const baseDir = '/home/sounds';
      assert.strictEqual(isSafeLocalPath('test.mp3', baseDir), true);
      assert.strictEqual(isSafeLocalPath('subfolder/test.mp3', baseDir), true);
    });
    
    it('should reject path traversal attempts', () => {
      const baseDir = '/home/sounds';
      assert.strictEqual(isSafeLocalPath('../etc/passwd', baseDir), false);
      assert.strictEqual(isSafeLocalPath('../../test.mp3', baseDir), false);
    });
    
    it('should reject absolute paths outside base', () => {
      const baseDir = '/home/sounds';
      assert.strictEqual(isSafeLocalPath('/etc/passwd', baseDir), false);
    });
  });
  
  describe('isAllowedHost', () => {
    it('should allow exact host matches', () => {
      const hosts = ['www.example.com', 'api.example.com'];
      assert.strictEqual(isAllowedHost('https://www.example.com/path', hosts), true);
    });
    
    it('should allow wildcard matches', () => {
      const hosts = ['*.example.com'];
      assert.strictEqual(isAllowedHost('https://api.example.com/path', hosts), true);
      assert.strictEqual(isAllowedHost('https://cdn.example.com/path', hosts), true);
    });
    
    it('should reject non-matching hosts', () => {
      const hosts = ['www.example.com'];
      assert.strictEqual(isAllowedHost('https://evil.com/path', hosts), false);
    });
    
    it('should be case-insensitive', () => {
      const hosts = ['WWW.EXAMPLE.COM'];
      assert.strictEqual(isAllowedHost('https://www.example.com/path', hosts), true);
    });
  });
  
  describe('sanitizeFilename', () => {
    it('should remove path components', () => {
      assert.strictEqual(sanitizeFilename('../../../etc/passwd'), 'passwd');
      assert.strictEqual(sanitizeFilename('/etc/passwd'), 'passwd');
    });
    
    it('should replace dangerous characters', () => {
      // basename removes path, then dangerous chars replaced
      const result = sanitizeFilename('test<>:"/\\|?*.mp3');
      // path.basename removes everything before last /, then we replace
      assert.ok(result.endsWith('.mp3'));
      assert.ok(!result.includes('<'));
      assert.ok(!result.includes('>'));
    });
    
    it('should prevent hidden files', () => {
      const result = sanitizeFilename('.hidden');
      assert.strictEqual(result.startsWith('.'), false);
      assert.ok(result.includes('hidden'));
    });
    
    it('should limit length', () => {
      const longName = 'a'.repeat(300) + '.mp3';
      const sanitized = sanitizeFilename(longName);
      assert.ok(sanitized.length <= 255);
    });
  });
  
  describe('isValidSourceType', () => {
    it('should accept valid source types', () => {
      assert.strictEqual(isValidSourceType('local'), true);
      assert.strictEqual(isValidSourceType('myinstants'), true);
      assert.strictEqual(isValidSourceType('url'), true);
    });
    
    it('should reject invalid source types', () => {
      assert.strictEqual(isValidSourceType('invalid'), false);
      assert.strictEqual(isValidSourceType(''), false);
      assert.strictEqual(isValidSourceType(null), false);
    });
  });
  
  describe('isValidAudioMimeType', () => {
    it('should accept valid audio MIME types', () => {
      assert.strictEqual(isValidAudioMimeType('audio/mpeg'), true);
      assert.strictEqual(isValidAudioMimeType('audio/wav'), true);
      assert.strictEqual(isValidAudioMimeType('audio/ogg'), true);
    });
    
    it('should reject invalid MIME types', () => {
      assert.strictEqual(isValidAudioMimeType('video/mp4'), false);
      assert.strictEqual(isValidAudioMimeType('text/plain'), false);
      assert.strictEqual(isValidAudioMimeType(''), false);
    });
  });
  
  describe('isValidAudioExtension', () => {
    it('should accept valid audio extensions', () => {
      assert.strictEqual(isValidAudioExtension('test.mp3'), true);
      assert.strictEqual(isValidAudioExtension('test.wav'), true);
      assert.strictEqual(isValidAudioExtension('test.ogg'), true);
    });
    
    it('should reject invalid extensions', () => {
      assert.strictEqual(isValidAudioExtension('test.txt'), false);
      assert.strictEqual(isValidAudioExtension('test.exe'), false);
      assert.strictEqual(isValidAudioExtension('test'), false);
    });
    
    it('should be case-insensitive', () => {
      assert.strictEqual(isValidAudioExtension('test.MP3'), true);
      assert.strictEqual(isValidAudioExtension('test.WAV'), true);
    });
  });
  
  describe('isValidVolume', () => {
    it('should accept valid volume levels', () => {
      assert.strictEqual(isValidVolume(0), true);
      assert.strictEqual(isValidVolume(50), true);
      assert.strictEqual(isValidVolume(100), true);
    });
    
    it('should reject invalid volume levels', () => {
      assert.strictEqual(isValidVolume(-1), false);
      assert.strictEqual(isValidVolume(101), false);
      assert.strictEqual(isValidVolume('50'), false);
    });
  });
  
  describe('sanitizeUserId', () => {
    it('should allow alphanumeric and basic chars', () => {
      assert.strictEqual(sanitizeUserId('user123'), 'user123');
      assert.strictEqual(sanitizeUserId('user_name-123'), 'user_name-123');
    });
    
    it('should remove dangerous characters', () => {
      assert.strictEqual(sanitizeUserId('user<script>'), 'userscript');
      assert.strictEqual(sanitizeUserId('user@#$%'), 'user');
    });
    
    it('should limit length', () => {
      const longId = 'a'.repeat(200);
      const sanitized = sanitizeUserId(longId);
      assert.ok(sanitized.length <= 100);
    });
  });
  
  describe('isValidApiKey', () => {
    it('should accept valid API keys', () => {
      const validKey = 'a'.repeat(32);
      assert.strictEqual(isValidApiKey(validKey), true);
    });
    
    it('should reject short API keys', () => {
      assert.strictEqual(isValidApiKey('short'), false);
    });
    
    it('should reject keys with invalid characters', () => {
      const invalidKey = 'a'.repeat(32) + '<>';
      assert.strictEqual(isValidApiKey(invalidKey), false);
    });
  });
  
  describe('hasRequiredFields', () => {
    it('should return true when all fields present', () => {
      const obj = { field1: 'value1', field2: 'value2' };
      assert.strictEqual(hasRequiredFields(obj, ['field1', 'field2']), true);
    });
    
    it('should return false when fields missing', () => {
      const obj = { field1: 'value1' };
      assert.strictEqual(hasRequiredFields(obj, ['field1', 'field2']), false);
    });
  });
  
  describe('sanitizeMetadata', () => {
    it('should only keep allowed fields', () => {
      const meta = {
        title: 'Test',
        description: 'Desc',
        dangerous: '<script>alert("xss")</script>',
        allowed: 'allowed'
      };
      
      const sanitized = sanitizeMetadata(meta);
      assert.ok('title' in sanitized);
      assert.ok('description' in sanitized);
      assert.ok(!('dangerous' in sanitized));
    });
    
    it('should limit string lengths', () => {
      const meta = {
        title: 'a'.repeat(2000)
      };
      
      const sanitized = sanitizeMetadata(meta);
      assert.ok(sanitized.title.length <= 1000);
    });
    
    it('should handle arrays', () => {
      const meta = {
        tags: ['tag1', 'tag2', 'tag3']
      };
      
      const sanitized = sanitizeMetadata(meta);
      assert.ok(Array.isArray(sanitized.tags));
      assert.strictEqual(sanitized.tags.length, 3);
    });
  });
});
  
  console.log(`\n\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests if executed directly
if (require.main === module) {
  console.log('Running validator tests...\n');
  runTests();
}
