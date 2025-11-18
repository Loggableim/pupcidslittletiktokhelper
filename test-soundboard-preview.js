/**
 * Test to simulate the preview functionality
 */

// Simulate API response structure
const mockSearchResults = [
    {
        id: 1,
        title: "Test Sound",
        mp3: "https://example.com/sound1.mp3",
        sound: "https://example.com/sound1-alt.mp3",
        description: "A test sound",
        tags: ["test", "meme"]
    },
    {
        id: 2,
        title: "Another Sound",
        // No mp3 field, only sound field
        sound: "https://example.com/sound2.mp3",
        description: "Another test",
        tags: ["funny"]
    },
    {
        id: 3,
        title: "Bad Sound",
        // Neither mp3 nor sound field
        description: "Missing URL",
        tags: []
    }
];

// Simulate the mapping from main.js line 297-304
function mapInstantToResult(instant) {
    return {
        id: instant.id || null,
        name: instant.title || instant.name || 'Unknown',
        url: instant.mp3 || instant.sound,
        description: instant.description || '',
        tags: instant.tags || [],
        color: instant.color || null
    };
}

// Test the mapping
console.log('Testing API response mapping:\n');
mockSearchResults.forEach((instant, i) => {
    const result = mapInstantToResult(instant);
    console.log(`Result ${i + 1}:`, result);
    console.log(`  - Has URL: ${!!result.url}`);
    console.log(`  - URL value: "${result.url || 'undefined'}"`);
    console.log('');
});

// Simulate how it would appear in the HTML
console.log('Simulating HTML rendering:\n');
mockSearchResults.forEach((instant) => {
    const result = mapInstantToResult(instant);
    const mp3 = String(result.url || '').replace(/'/g, "&#39;");
    const title = String(result.name || 'Unbenannt').replace(/'/g, "&#39;");
    
    console.log(`Preview button for "${title}":`);
    console.log(`  data-url="${mp3}"`);
    console.log(`  URL is empty: ${mp3 === ''}`);
    console.log('');
});
