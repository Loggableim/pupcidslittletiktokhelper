# Theme System Guide

## Overview

Pup Cid's Little TikTok Helper includes a comprehensive theme system supporting three modes:
- **Night Mode** (Default) - Dark theme optimized for low-light streaming
- **Day Mode** - Light theme with improved contrast for daytime use
- **High-Contrast Mode** - Accessibility-optimized theme for vision-impaired users

## Theme Variables

All theme variables are defined in `/public/css/themes.css` and automatically applied across the application.

### Core Color Variables

#### Branding Colors
```css
--brand-primary: #12a116;          /* Corporate green */
--brand-primary-hover: #0f8712;    /* Darker green for hover states */
--brand-primary-light: rgba(18, 161, 22, 0.2); /* Transparent green */
```

#### Background Colors
```css
--color-bg-primary: #0f172a;       /* Main background */
--color-bg-secondary: #1e293b;     /* Secondary background (cards, panels) */
--color-bg-tertiary: #334155;      /* Tertiary background (hover states) */
--color-bg-card: #1e293b;          /* Card background */
--color-bg-hover: #334155;         /* Hover state background */
```

#### Accent Colors
```css
--color-accent-primary: #3b82f6;   /* Blue accent */
--color-accent-secondary: #8b5cf6; /* Purple accent */
--color-accent-success: #10b981;   /* Green success */
--color-accent-warning: #f59e0b;   /* Orange warning */
--color-accent-danger: #ef4444;    /* Red danger/error */
```

#### Text Colors
```css
--color-text-primary: #f8fafc;     /* Primary text */
--color-text-secondary: #cbd5e1;   /* Secondary text */
--color-text-muted: #94a3b8;       /* Muted/disabled text */
```

#### Input & Form Colors
```css
--color-input-bg: #1e293b;         /* Input background */
--color-input-border: #334155;     /* Input border */
--color-input-focus: #3b82f6;      /* Focus border color */
--color-input-text: #f8fafc;       /* Input text color */
--color-input-placeholder: #64748b; /* Placeholder text */
```

#### Button Colors
```css
--color-btn-secondary-bg: #334155;      /* Secondary button bg */
--color-btn-secondary-hover: #475569;   /* Secondary button hover */
--color-btn-secondary-text: #f8fafc;    /* Secondary button text */
```

#### Chart Colors
```css
--color-chart-primary: #3b82f6;    /* Chart primary color */
--color-chart-secondary: #8b5cf6;  /* Chart secondary color */
--color-chart-success: #10b981;    /* Chart success color */
--color-chart-warning: #f59e0b;    /* Chart warning color */
--color-chart-danger: #ef4444;     /* Chart danger color */
--color-chart-grid: #334155;       /* Chart grid lines */
--color-chart-axis: #64748b;       /* Chart axis labels */
```

#### Border & Divider Colors
```css
--color-border: #334155;           /* Standard border */
--color-divider: #1e293b;          /* Divider/separator */
```

#### Shadows & Glows
```css
--shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
--shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
--glow-primary: 0 0 20px rgba(59, 130, 246, 0.3);
--glow-success: 0 0 20px rgba(16, 185, 129, 0.3);
--glow-brand: 0 0 20px rgba(18, 161, 22, 0.3);
```

#### Badge Colors
```css
--color-badge-bg: #334155;         /* Badge background */
--color-badge-text: #cbd5e1;       /* Badge text */
```

#### Modal & Overlay
```css
--color-modal-backdrop: rgba(15, 23, 42, 0.8); /* Modal backdrop */
--color-modal-bg: #1e293b;         /* Modal background */
```

#### Gradients
```css
--gradient-primary: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
--gradient-brand: linear-gradient(135deg, #12a116 0%, #0f8712 100%);
```

#### Interactive States
```css
--color-disabled-bg: #1e293b;      /* Disabled element background */
--color-disabled-text: #475569;    /* Disabled element text */
--color-active-bg: rgba(59, 130, 246, 0.2); /* Active state background */
--color-active-border: #3b82f6;    /* Active state border */
```

## Utility Classes

The theme system includes utility classes for common styling patterns:

### Background Utilities
```css
.theme-bg-primary     /* Primary background */
.theme-bg-secondary   /* Secondary background */
.theme-bg-tertiary    /* Tertiary background */
.theme-bg-card        /* Card background */
.theme-bg-hover       /* Hover background (on :hover) */
```

### Text Utilities
```css
.theme-text-primary   /* Primary text color */
.theme-text-secondary /* Secondary text color */
.theme-text-muted     /* Muted text color */
```

### Border Utilities
```css
.theme-border         /* Border color only */
.theme-border-solid   /* 1px solid border */
.theme-divider        /* Divider color */
```

### Input Utilities
```css
.theme-input          /* Complete input styling */
```

### Button Utilities
```css
.theme-btn-secondary  /* Secondary button styling */
```

### Badge Utilities
```css
.theme-badge          /* Badge styling */
```

### Modal Utilities
```css
.theme-modal-backdrop /* Modal backdrop */
.theme-modal          /* Modal content */
```

### Gradient Utilities
```css
.theme-gradient-primary /* Primary gradient */
.theme-gradient-brand   /* Brand gradient */
```

### State Utilities
```css
.theme-disabled       /* Disabled state */
.theme-active         /* Active state */
```

### Shadow Utilities
```css
.theme-shadow-sm      /* Small shadow */
.theme-shadow-md      /* Medium shadow */
.theme-shadow-lg      /* Large shadow */
```

### Glow Effects
```css
.theme-glow-primary   /* Primary glow */
.theme-glow-success   /* Success glow */
.theme-glow-brand     /* Brand glow */
```

## How to Make a Plugin Theme-Aware

### Step 1: Include themes.css

Add this line to the `<head>` section of your plugin's HTML file:

```html
<link rel="stylesheet" href="/css/themes.css">
```

### Step 2: Replace Hardcoded Colors

**Before (Hardcoded):**
```css
body {
    background: #0f172a;
    color: #f8fafc;
}

.card {
    background: #1e293b;
    border: 1px solid #334155;
}

.btn-primary {
    background: #3b82f6;
    color: white;
}
```

**After (Theme-Aware):**
```css
body {
    background: var(--color-bg-primary);
    color: var(--color-text-primary);
}

.card {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
}

.btn-primary {
    background: var(--color-accent-primary);
    color: white;
}
```

### Step 3: Use Utility Classes (Optional)

Instead of custom CSS, you can use utility classes:

```html
<div class="theme-bg-card theme-border-solid">
    <h2 class="theme-text-primary">Card Title</h2>
    <p class="theme-text-secondary">Card description</p>
    <button class="theme-btn-secondary">Action</button>
</div>
```

### Step 4: Handle Chart Colors

For Chart.js or similar libraries, use theme variables:

```javascript
const chartColors = {
    primary: getComputedStyle(document.documentElement)
        .getPropertyValue('--color-chart-primary').trim(),
    success: getComputedStyle(document.documentElement)
        .getPropertyValue('--color-chart-success').trim(),
    grid: getComputedStyle(document.documentElement)
        .getPropertyValue('--color-chart-grid').trim(),
};

// Use in chart configuration
const config = {
    type: 'line',
    data: {
        datasets: [{
            borderColor: chartColors.primary,
            backgroundColor: chartColors.primary + '20', // Add transparency
        }]
    },
    options: {
        scales: {
            y: {
                grid: {
                    color: chartColors.grid
                }
            }
        }
    }
};
```

### Step 5: Add Smooth Transitions

Include transitions for smooth theme switching:

```css
body,
.card,
.btn,
input,
select {
    transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease;
}
```

## Testing Your Plugin

Test your plugin in all three theme modes:

1. **Night Mode (Default)**: Verify colors are appropriate for dark backgrounds
2. **Day Mode**: Check text contrast and readability on light backgrounds
3. **High-Contrast Mode**: Ensure all text is easily readable with maximum contrast

### How to Switch Themes for Testing

Click the theme toggle button in the top-right corner of the dashboard and select:
- 🌙 Night Mode
- ☀️ Day Mode
- 👁️ High Contrast

## Common Patterns

### Card with Header
```html
<div class="theme-bg-card theme-border-solid" style="border-radius: 12px; padding: 20px;">
    <div class="theme-text-primary" style="font-size: 1.5rem; font-weight: 700; margin-bottom: 16px;">
        Card Title
    </div>
    <div class="theme-text-secondary">
        Card content goes here
    </div>
</div>
```

### Status Badges
```html
<span class="theme-badge" style="background: var(--color-accent-success); color: white;">
    Active
</span>
<span class="theme-badge" style="background: var(--color-accent-danger); color: white;">
    Error
</span>
<span class="theme-badge" style="background: var(--color-accent-warning); color: white;">
    Warning
</span>
```

### Input Form
```html
<form>
    <label class="theme-text-secondary" style="display: block; margin-bottom: 8px;">
        Username
    </label>
    <input type="text" class="theme-input" placeholder="Enter username" style="width: 100%; padding: 10px; border-radius: 8px;">
</form>
```

### Modal
```html
<div class="theme-modal-backdrop" style="position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;">
    <div class="theme-modal" style="max-width: 500px; width: 90%; padding: 24px; border-radius: 16px;">
        <h2 class="theme-text-primary">Modal Title</h2>
        <p class="theme-text-secondary">Modal content</p>
        <button class="theme-btn-secondary">Close</button>
    </div>
</div>
```

## Accessibility Considerations

### High-Contrast Mode Features
- **Increased Border Width**: All borders are 2px instead of 1px
- **Enhanced Focus Rings**: 3px solid outline with 2px offset
- **Vibrant Colors**: More saturated colors for better visibility
- **Maximum Contrast**: Pure black backgrounds with bright text

### Focus States
Always define clear focus states for keyboard navigation:

```css
button:focus,
input:focus {
    outline: 3px solid var(--color-accent-primary);
    outline-offset: 2px;
}
```

### Color Contrast Ratios
- Night Mode: Targets WCAG AA (4.5:1 for normal text)
- Day Mode: Targets WCAG AA (4.5:1 for normal text)
- High-Contrast Mode: Targets WCAG AAA (7:1 for normal text)

## Theme Manager JavaScript API

The theme manager is available globally as `themeManager`:

### Get Current Theme
```javascript
const currentTheme = themeManager.getCurrentTheme();
console.log(currentTheme); // 'night', 'day', or 'contrast'
```

### Set Theme Programmatically
```javascript
themeManager.setTheme('day');    // Switch to Day Mode
themeManager.setTheme('night');  // Switch to Night Mode
themeManager.setTheme('contrast'); // Switch to High-Contrast Mode
```

### Listen for Theme Changes
```javascript
// Override the applyTheme method to add custom logic
const originalApply = themeManager.applyTheme.bind(themeManager);
themeManager.applyTheme = function(theme) {
    originalApply(theme);
    // Your custom logic here
    console.log('Theme changed to:', theme);
    updateMyCustomComponents(theme);
};
```

## Extending the Theme System

### Adding New Theme Variables

To add new theme variables, edit `/public/css/themes.css`:

1. Add to the `:root` selector (Night Mode default)
2. Add to `[data-theme="day"]` (Day Mode override)
3. Add to `[data-theme="contrast"]` (High-Contrast override)

Example:
```css
/* In :root */
--color-custom-highlight: #ff6b6b;

/* In [data-theme="day"] */
--color-custom-highlight: #e63946;

/* In [data-theme="contrast"] */
--color-custom-highlight: #ff8080;
```

### Creating New Utility Classes

Add utility classes to the bottom of `/public/css/themes.css`:

```css
.theme-custom-card {
    background: var(--color-bg-card);
    border: 2px solid var(--color-border);
    border-radius: 12px;
    padding: 20px;
    box-shadow: var(--shadow-md);
}
```

## Migration Checklist

When converting an existing plugin to the theme system:

- [ ] Include `/css/themes.css` in the HTML `<head>`
- [ ] Replace all `background: #...` with `background: var(--color-...)`
- [ ] Replace all `color: #...` with `color: var(--color-...)`
- [ ] Replace all `border: ... #...` with `border: ... var(--color-...)`
- [ ] Update gradients to use `var(--gradient-...)`
- [ ] Add smooth transitions for theme switching
- [ ] Test in all three theme modes
- [ ] Verify focus states for accessibility
- [ ] Check chart colors if using Chart.js
- [ ] Update inline styles to use theme variables
- [ ] Remove any local `:root` color definitions

## Best Practices

1. **Always use theme variables** instead of hardcoded colors
2. **Test in all three modes** before considering the work complete
3. **Add transitions** for smooth theme switching
4. **Use semantic color names** (e.g., `--color-accent-success` not `--color-green`)
5. **Maintain consistency** across all plugins
6. **Document custom variables** if you add any
7. **Consider accessibility** when choosing colors
8. **Avoid `!important`** unless absolutely necessary
9. **Use utility classes** when appropriate to reduce CSS bloat
10. **Keep it minimal** - only override what's necessary

## Support

For questions or issues with the theme system:
1. Check this documentation first
2. Review existing theme-aware plugins as examples
3. Consult the theme manager code in `/public/js/theme-manager.js`
4. Test your changes in all three theme modes

## Examples of Theme-Aware Plugins

Reference these plugins for implementation examples:
- **Goals** (`/plugins/goals/ui.html`) - Complete theme integration
- **ClarityHUD** (`/plugins/clarityhud/ui/main.html`) - Complex UI with theme support
- **Weather Control** (`/plugins/weather-control/ui.html`) - Migrated from local vars
- **Quiz Show** (`/plugins/quiz_show/`) - CSS file with theme imports
- **Resource Monitor** (`/plugins/resource-monitor/ui.html`) - Charts with theme colors

---

**Last Updated**: 2025-11-20
**Version**: 1.0
**Theme System Version**: 2.0
