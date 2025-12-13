# 📖 Interactive Story Plugin

Choose-your-own-adventure storytelling plugin where TikTok LIVE viewers influence the narrative through voting with chat commands, keywords, and gifts.

## Features

- **Interactive Storytelling**: Create branching narratives with multiple paths and endings
- **Viewer Voting**: Viewers vote on story choices using chat commands or keywords
- **Gift Integration**: Gifts count as weighted votes based on diamond value
- **Real-time Display**: Beautiful OBS overlay shows current story text and voting options
- **Story Management**: Create, edit, and manage multiple stories
- **Database Storage**: Stories persist across sessions

## How It Works

1. Create a story with multiple nodes (scenes)
2. Each node contains text and optional choices for viewers
3. Start the story from the admin panel
4. Viewers vote using:
   - Chat commands: `!1`, `!2`, `!3`, etc.
   - Keywords: pre-defined words that map to choices
   - Gifts: weighted votes based on diamond count (1 vote per 10 diamonds)
5. After the voting period, the choice with most votes is selected
6. Story progresses to the next node
7. Story ends when reaching a node with no choices

## Story Structure

### Node Properties

- **id**: Unique identifier for the node
- **isStart**: Mark as starting node (boolean)
- **text**: Story text to display
- **choices**: Array of choice objects (empty for endings)
- **voteDuration**: Voting time in seconds (default: 30)

### Choice Properties

- **text**: Choice description shown to viewers
- **keywords**: Array of keywords that trigger this vote
- **nextNode**: ID of the next node if this choice wins

## Example Story

```json
{
  "name": "The Haunted House",
  "description": "A spooky adventure",
  "nodes": [
    {
      "id": "start",
      "isStart": true,
      "text": "You stand before a haunted house. Do you enter?",
      "choices": [
        {
          "text": "Enter the house",
          "keywords": ["enter", "yes", "1"],
          "nextNode": "inside"
        },
        {
          "text": "Walk away",
          "keywords": ["leave", "no", "2"],
          "nextNode": "ending_safe"
        }
      ],
      "voteDuration": 30
    },
    {
      "id": "inside",
      "text": "Inside is dark and spooky. You see stairs up and down.",
      "choices": [
        {
          "text": "Go upstairs",
          "keywords": ["up", "stairs", "1"],
          "nextNode": "ending_treasure"
        },
        {
          "text": "Go to basement",
          "keywords": ["down", "basement", "2"],
          "nextNode": "ending_ghost"
        }
      ],
      "voteDuration": 30
    },
    {
      "id": "ending_safe",
      "text": "You walk away safely. THE END",
      "choices": []
    },
    {
      "id": "ending_treasure",
      "text": "You find treasure in the attic! THE END",
      "choices": []
    },
    {
      "id": "ending_ghost",
      "text": "A friendly ghost gives you a gift! THE END",
      "choices": []
    }
  ]
}
```

## Voting System

### Chat Commands
- `!1` or `/1` or `1` - Vote for choice 1
- `!2` or `/2` or `2` - Vote for choice 2
- etc.

### Keywords
Messages containing choice keywords count as votes:
- "I want to enter" → votes for choice with "enter" keyword
- "Let's go up the stairs!" → votes for choice with "up" keyword

### Gift Voting
Gifts automatically vote if the gift name contains a choice keyword:
- Gift worth 100 diamonds = 10 votes
- Automatically applies to matching keyword choice

## Configuration

### General Settings
- Enable/disable the plugin
- Story management (create, edit, delete)
- Start/stop currently running story

### Overlay Settings
- Real-time story text display
- Choice voting interface with live vote counts
- Countdown timer for voting period
- Visual effects for winning choice

## API Endpoints

### GET `/api/interactive-story/stories`
Get all stored stories

### GET `/api/interactive-story/stories/:id`
Get specific story by ID

### POST `/api/interactive-story/stories`
Create or update a story

### DELETE `/api/interactive-story/stories/:id`
Delete a story

### POST `/api/interactive-story/start/:id`
Start a story

### POST `/api/interactive-story/stop`
Stop current story

### GET `/api/interactive-story/state`
Get current story state (active story, current node, votes)

### POST `/api/interactive-story/choose/:choice`
Manually select a choice (admin override)

## Socket Events

### Plugin → Client
- `interactive-story:started` - Story has started
- `interactive-story:stopped` - Story has stopped
- `interactive-story:voting-started` - Voting period began
- `interactive-story:node-changed` - Story moved to new node
- `interactive-story:votes-updated` - Vote counts updated
- `interactive-story:choice-made` - Choice was selected
- `interactive-story:ended` - Story reached an ending

### Client → Plugin
- `interactive-story:vote` - Submit a vote (data: `{ choice: number }`)

## OBS Setup

1. Add Browser Source
2. Set URL to overlay URL from admin panel
3. Resolution: 1920x1080
4. Custom CSS: Not required
5. FPS: 30

## Database

Stories are stored in SQLite table `interactive_stories`:
- `id` - Story ID
- `name` - Story name
- `description` - Story description
- `nodes` - JSON-encoded story nodes
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp

## Tips for Creating Stories

1. **Keep nodes concise**: Viewers have short attention spans
2. **Use clear keywords**: Make voting intuitive
3. **2-3 choices per node**: Don't overwhelm viewers
4. **30-60 second voting**: Enough time to vote, not too long
5. **Multiple endings**: Reward different choices
6. **Test your story**: Make sure all paths work

## Advanced Usage

### Creating Complex Stories

For advanced story editing, you can:
1. Export story JSON from admin panel
2. Edit in external JSON editor
3. Import back via API

### Custom Voting Logic

Modify `handleChat()` and `handleGift()` in `main.js` to implement custom voting rules.

### Integration with Other Plugins

Use Socket.IO events to trigger story progression based on other plugins:

```javascript
socket.emit('interactive-story:vote', { choice: 0 });
```

## Version

1.0.0 - Initial release

## Author

PupCid

## License

CC-BY-NC-4.0
