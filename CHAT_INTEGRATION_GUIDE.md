# Chat / Shoutbox Integration Guide

## Overview
This guide explains how to integrate a chat/shoutbox service into the TikTok Helper dashboard.

## Integration Points

Two chat/shoutbox sections have been added to the dashboard:

### 1. Dashboard Section
Located between "FAQ & Help Center" and "System Resources" sections.
- **Location in code**: Line ~717 in `public/dashboard.html`
- **Container**: `<div class="chat-container">`
- **Placeholder**: `<div class="chat-placeholder">`

### 2. Floating Widget (Lower Right Corner)
A floating button that opens a chat popup window.
- **Location in code**: After line ~1843 in `public/dashboard.html`
- **Container**: `<div class="chat-popup-body">`
- **Placeholder**: `<div class="chat-popup-placeholder">`

## How to Add Your Shoutbox Embed Code

### Option 1: Using an iframe
Replace the placeholder `<div class="chat-placeholder">` with your iframe embed:

```html
<!-- In the dashboard section (line ~721) -->
<div class="chat-container">
    <iframe src="YOUR_SHOUTBOX_URL" class="chat-embed" frameborder="0"></iframe>
</div>

<!-- In the floating widget (line ~1860) -->
<div class="chat-popup-body">
    <iframe src="YOUR_SHOUTBOX_URL" class="chat-embed" frameborder="0" style="width: 100%; height: 100%;"></iframe>
</div>
```

### Option 2: Using a script/widget
If your shoutbox service provides a script-based embed:

```html
<!-- In the dashboard section -->
<div class="chat-container" id="dashboard-shoutbox">
    <!-- Your shoutbox script here -->
    <script src="YOUR_SHOUTBOX_SCRIPT_URL"></script>
</div>

<!-- In the floating widget -->
<div class="chat-popup-body" id="floating-shoutbox">
    <!-- Your shoutbox script here -->
    <script src="YOUR_SHOUTBOX_SCRIPT_URL"></script>
</div>
```

## Theme Support

The chat sections automatically adapt to the current theme:
- **Light Mode**: Standard colors with light background
- **Dark Mode**: Dark background with adjusted colors
- **High Contrast Mode**: Enhanced borders and contrast

The CSS uses the following theme variables:
- `--color-surface`: Background color
- `--color-border`: Border color
- `--color-text-primary`: Primary text color
- `--color-text-secondary`: Secondary text color
- `--color-text-tertiary`: Tertiary/muted text color

## Customization

### Adjust Chat Height
For the dashboard section, modify the `min-height` and `max-height` in the CSS (line ~242):

```css
.chat-container {
    min-height: 400px;  /* Adjust as needed */
    max-height: 600px;  /* Adjust as needed */
}
```

### Adjust Floating Widget Size
For the floating widget, modify the dimensions (line ~320):

```css
.chat-popup {
    width: 380px;       /* Adjust as needed */
    height: 520px;      /* Adjust as needed */
}
```

### Change Button Position
To move the floating button, modify the position (line ~300):

```css
.floating-chat-widget {
    bottom: 24px;  /* Distance from bottom */
    right: 24px;   /* Distance from right */
}
```

## Popular Shoutbox Services

Some popular shoutbox services you can integrate:
- **CBox** (https://www.cbox.ws/)
- **ShoutBox.us** (https://www.shoutbox.us/)
- **Chatango** (https://chatango.com/)
- **Discord Widget** (https://discord.com/developers/docs/resources/channel#embed-object)
- **Custom implementation** (using WebSocket or polling)

## Removing the Chat Features

If you want to remove either feature:

### Remove Dashboard Section
Delete lines ~717-729 in `public/dashboard.html`

### Remove Floating Widget
1. Delete the HTML (lines ~1845-1869)
2. Delete the CSS styles (lines ~275-440)
3. Delete the JavaScript (lines ~1897-1965)

## Testing

After adding your shoutbox embed:
1. Open the dashboard in your browser
2. Check that the chat appears in the dashboard section
3. Click the floating chat button in the lower right corner
4. Verify that the popup opens and displays your chat
5. Test in different themes (light, dark, high contrast)
6. Test on mobile devices for responsive behavior

## Troubleshooting

### Chat not appearing
- Check browser console for errors
- Verify the embed URL is correct
- Check if the shoutbox service allows iframe embedding
- Try adding `sandbox` attribute to iframe if needed

### Theme not applying correctly
- Ensure your shoutbox service supports custom styling
- Some services may need additional CSS overrides
- Check if the service provides theme options

### Performance issues
- Consider lazy-loading the chat widget
- Use the floating widget for better UX on slower connections
- Some services offer optimized embed codes

## Support

For issues specific to:
- **TikTok Helper**: Create an issue in the repository
- **Shoutbox Service**: Contact the service provider
- **Custom Integration**: Consult the service's API documentation
