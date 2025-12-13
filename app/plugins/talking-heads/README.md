# 🎭 Talking Heads Plugin

Animated avatar overlay that reacts to TikTok Live events with expressions, animations, and speech bubbles.

## Features

- **Reactive Expressions**: Avatar changes expression based on TikTok events
- **Speech Bubbles**: Shows messages for gifts, follows, shares, and chat
- **Customizable**: Multiple avatar styles, positions, and sizes
- **Event-Driven**: Automatically responds to TikTok LIVE events
- **OBS Integration**: Browser source overlay for streaming software

## Expressions

The avatar can display the following expressions:

- 😐 **Neutral** - Default state
- 😊 **Happy** - For follows and small gifts
- 🤩 **Excited** - For shares and medium gifts
- 😄 **Talking** - For chat messages
- 😁 **Smile** - For likes
- 😃 **Very Happy** - For large gifts (100+ diamonds)
- 🥳 **Ecstatic** - For huge gifts (1000+ diamonds)

## Event Reactions

- **Gifts**: Changes expression based on diamond value, shows gift name and sender
- **Follows**: Happy expression with follow notification
- **Shares**: Excited expression with share notification
- **Chat**: Talking expression with chat message (optional)
- **Likes**: Smile expression every N likes (configurable threshold)

## Configuration

### General Settings
- Enable/disable the plugin
- Show/hide chat messages
- Show/hide like events
- Set like threshold

### Appearance
- **Avatar Type**: Default, Cartoon, Anime, Realistic
- **Position**: Bottom-left, Bottom-right, Top-left, Top-right
- **Size**: Small (150px), Medium (250px), Large (350px)

### Expressions
Enable or disable individual expressions

## Setup

1. Enable the plugin in the admin panel
2. Configure settings in the plugin UI
3. Copy the overlay URL
4. Add as Browser Source in OBS (recommended: 1920x1080, transparent background)

## OBS Browser Source Settings

- **URL**: Copy from plugin admin UI
- **Width**: 1920
- **Height**: 1080
- **FPS**: 30
- **Custom CSS**: Not required
- **Shutdown source when not visible**: No
- **Refresh browser when scene becomes active**: No

## API

### GET `/api/talking-heads/config`
Get current configuration

### POST `/api/talking-heads/config`
Save configuration

### Socket Events

#### Emit from plugin
- `talking-heads:expression` - Triggers expression change with message
- `talking-heads:config-updated` - Config has been updated
- `talking-heads:disabled` - Plugin disabled

#### Trigger manually
```javascript
socket.emit('talking-heads:trigger', {
  expression: 'happy',
  message: 'Custom message!',
  duration: 3000,
  user: 'Username'
});
```

## Customization

You can customize the avatar appearance by editing `overlay.html`:
- Change emoji sets
- Modify colors and gradients
- Add custom animations
- Implement avatar images instead of emoji

## Version

1.0.0 - Initial release

## Author

PupCid

## License

CC-BY-NC-4.0
