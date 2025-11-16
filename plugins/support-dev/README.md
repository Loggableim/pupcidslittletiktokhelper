# Support the Development Plugin

This plugin enables users to contribute computing power during idle time to support the development of PupCidsLittleTikTokHelper. All contributions help keep this tool free and enable continued development.

## Features

### 🎯 User-Friendly Interface
- **Simple Mode**: Easy one-click enable/disable with donation-focused messaging
- **Advanced Mode**: Detailed settings for power users
- **First-Run Popup**: Friendly introduction with default "ON" recommendation
- **Donation Page**: Direct donation options via PayPal and cryptocurrencies

### 🔒 Safety Mechanisms
- **Idle Detection**: Only runs when computer is truly idle
  - System-level idle time monitoring (OS-specific APIs)
  - CPU load monitoring (starts only if < 20%)
  - GPU load monitoring (starts only if < 20%)
  - Keyboard/mouse activity detection
  
- **Temperature Protection**
  - Automatic monitoring of GPU/CPU temperatures
  - Automatic shutdown if temperature exceeds 80°C
  - Prevents hardware damage

- **Load Limiting**
  - Default max 10% CPU usage
  - Default max 10% GPU usage
  - Configurable limits in Advanced Mode
  - Automatic process throttling

- **Immediate Response**
  - Stops immediately when user becomes active
  - No impact on regular computer usage
  - Clean process shutdown

### ⚙️ Technical Implementation

#### GPU Contribution (Kaspa)
- **Algorithm**: kHeavyHash
- **Binary**: lolMiner or BzMiner (must be provided separately)
- **Pool**: pool.woolypooly.com:3112
- **Wallet**: `kaspa:qpra2nvnhty2ec5u5zyenmgjvst9nyacztke42z0j598hekwt5rdqq46jr4sp3`

#### CPU Contribution (Monero)
- **Algorithm**: RandomX
- **Binary**: xmrig (must be provided separately)
- **Pool**: pool.supportxmr.com:3333
- **Wallet**: `41ibGEw2aC7HySfkWT2Tky4yGReW4tQzMZvguCLfghSvADaXwLNmdpqa9xKxent5VB4oKfCde55gX44noxdT6iELR1fr2cf`

### 📦 Donation Addresses

All donation addresses are hardcoded and non-editable:

- **PayPal**: rainer@dominik.in
- **Monero (XMR)**: 41ibGEw2aC7HySfkWT2Tky4yGReW4tQzMZvguCLfghSvADaXwLNmdpqa9xKxent5VB4oKfCde55gX44noxdT6iELR1fr2cf
- **Litecoin (LTC)**: LUYpdab8jmoeA4gB8Y39crs4JkL6EMofcY
- **Ethereum (ETH)**: 0x0a13257f5d25f6a42b1f99e25b7fdb6093e63592
- **Kaspa (KAS)**: kaspa:qpra2nvnhty2ec5u5zyenmgjvst9nyacztke42z0j598hekwt5rdqq46jr4sp3

## Installation

The plugin is included by default and will automatically download mining binaries on first use:

1. **Automatic Binary Download**: When you enable the feature, the plugin will automatically download the required mining binaries:
   - **CPU**: xmrig (from official GitHub releases)
   - **GPU**: lolMiner (from official GitHub releases)

2. **Hardcoded Wallets**: All wallet addresses are permanently hardcoded in the source code and **cannot be changed**:
   - Kaspa wallet (GPU): `kaspa:qpra2nvnhty2ec5u5zyenmgjvst9nyacztke42z0j598hekwt5rdqq46jr4sp3`
   - Monero wallet (CPU): `41ibGEw2aC7HySfkWT2Tky4yGReW4tQzMZvguCLfghSvADaXwLNmdpqa9xKxent5VB4oKfCde55gX44noxdT6iELR1fr2cf`

3. **Security**: Binaries are downloaded from official sources and stored in `plugins/support-dev/bin/`

### Manual Binary Installation (Optional)

If you prefer to manually install the binaries or automatic download fails:

1. Download mining binaries:
   - **GPU**: lolMiner (https://github.com/Lolliedieb/lolMiner-releases) or BzMiner
   - **CPU**: xmrig (https://github.com/xmrig/xmrig)

2. Place binaries in `plugins/support-dev/bin/`:
   - Windows: `lolMiner.exe`, `xmrig.exe`
   - Linux: `lolMiner`, `xmrig`
   - macOS: `xmrig` (GPU mining not recommended on macOS)

3. Ensure binaries are executable (Linux/macOS): `chmod +x plugins/support-dev/bin/*`

**Important**: The wallet addresses are hardcoded in the binary manager and process manager. They cannot be changed through the UI, configuration files, or API calls.

## Configuration

### Default Settings (Conservative)
- Idle start time: 120 seconds (2 minutes)
- Max CPU load: 34%
- Max GPU load: 34%
- Max temperature: 80°C
- Safety check interval: 30 seconds

### Advanced Settings
Users can configure:
- Enable/disable GPU contribution
- Enable/disable CPU contribution
- Adjust max CPU/GPU load (5-50%)
- Adjust idle start time (60-600 seconds)

### Storage
Configuration is stored in the user's profile database:
- Key: `support-dev-config`
- Includes: enabled state, idle thresholds, load limits, safety settings

## API Endpoints

### GET /api/support-dev/status
Returns current status including:
- enabled: boolean
- isActive: boolean
- firstRunCompleted: boolean
- idle state
- process statistics

### GET /api/support-dev/config
Returns current configuration

### POST /api/support-dev/config
Updates configuration (preserves hardcoded wallet addresses)

### POST /api/support-dev/first-run-complete
Marks first-run popup as completed

### POST /api/support-dev/start
Manually start contribution (bypasses idle detection)

### POST /api/support-dev/stop
Manually stop contribution

### GET /api/support-dev/donations
Returns all donation addresses

## Socket.IO Events

### support-dev:status
Emitted when status changes. Clients receive:
- enabled state
- active state
- idle detector state
- process manager state
- statistics

### support-dev:request-status
Client can request immediate status update

## Architecture

### Components

1. **IdleDetector** (`utils/idle-detector.js`)
   - Multi-factor idle detection
   - Platform-specific implementations (Windows, macOS, Linux)
   - Configurable thresholds
   - Real-time monitoring

2. **ProcessManager** (`utils/process-manager.js`)
   - Process lifecycle management
   - Safety monitoring
   - Auto-restart on crash (with limits)
   - Clean shutdown
   - Output parsing for statistics

3. **Main Plugin** (`main.js`)
   - Orchestrates idle detection and process management
   - Handles configuration
   - Provides API endpoints
   - Manages Socket.IO events

### State Management
- Plugin maintains its own state
- Configuration persisted to database
- Real-time updates via Socket.IO
- Safe defaults if configuration missing

## UI Components

### Simple Mode
- Large, friendly buttons
- Clear status indicators
- Why support? informational section
- Collapsible technical details
- Direct link to donation page

### Advanced Mode
- Toggle switches for GPU/CPU
- Sliders for load limits
- Idle time configuration
- Real-time status display
- Statistics (when active)
- Expanded technical information

### Donation Page
- All wallet addresses displayed
- Click-to-copy functionality
- Explanation of why donations matter
- Back button to main view

### First-Run Popup
- Friendly introduction
- Clear explanation of feature
- Recommended default: ON
- Two options: "Yes, I'll Support" and "Not Now"
- Technical details in collapsible section

## User Experience

### Terminology
The plugin uses friendly, non-technical terms in the main interface:
- ✅ "Support the Development" instead of "Mining"
- ✅ "Compute Contribution" instead of "Mining"
- ✅ "Idle Computing" instead of "Background Mining"
- ✅ "GPU/CPU Contribution" instead of "GPU/CPU Mining"

Technical terms (mining, cryptocurrency, hashrate) only appear in:
- Collapsible "Technical Details" sections
- Advanced Mode technical information panel
- Backend logs

### Privacy & Transparency
- First-run popup clearly explains what happens
- Technical details available on request
- All wallet addresses visible and copyable
- Users can disable at any time
- No hidden behavior

## Performance Impact

### When Idle (Intended Use)
- Minimal: 10% CPU/GPU max by default
- No user-facing impact
- Stops immediately when user returns

### When Active (Should Never Happen)
- Idle detection prevents this scenario
- If somehow running: immediate stop on user activity
- Multiple safety nets in place

### Temperature
- Constant monitoring
- Auto-shutdown if > 80°C
- Prevents hardware stress

## Security Considerations

### Wallet Addresses
- Hardcoded in source code
- Cannot be changed via UI
- Cannot be changed via API
- All contributions go to development fund

### Mining Binaries
- NOT included in repository
- User must download separately
- Reduces security risk
- Allows verification of binaries

### Process Management
- Proper cleanup on shutdown
- No orphaned processes
- SIGTERM followed by SIGKILL if needed
- Clean error handling

## Testing

### Manual Testing
1. Enable plugin in UI
2. Verify idle detection after 3 minutes of inactivity
3. Move mouse - verify immediate stop
4. Check logs for temperature monitoring
5. Verify statistics update in UI

### Scenarios to Test
- [ ] First-run popup shows on initial load
- [ ] Enabling/disabling works correctly
- [ ] Idle detection triggers contribution
- [ ] User activity stops contribution immediately
- [ ] Temperature monitoring works
- [ ] Statistics display in Advanced Mode
- [ ] Donation page displays all addresses
- [ ] Click-to-copy works for addresses
- [ ] Configuration persists across restarts

## Troubleshooting

### Plugin Not Starting
- Check logs for errors
- Verify mining binaries are present
- Check file permissions

### Idle Detection Not Working
- Verify OS-specific tools are available:
  - Windows: PowerShell (built-in)
  - macOS: ioreg (built-in)
  - Linux: xprintidle (may need install)

### High Temperature
- Plugin should auto-shutdown at 80°C
- If not, check safety monitoring logs
- Reduce max load limits in Advanced Mode

### No Statistics
- Statistics only available when processes are running
- Check if mining binaries are present and working
- Check process manager logs

## License

This plugin is part of PupCidsLittleTikTokHelper and follows the same license.

## Support

If you appreciate this tool and want to support development:
- Enable the compute contribution feature
- Donate directly via PayPal or crypto (see donation page)
- Share the tool with others
- Report bugs and suggest features

Thank you for your support! ❤️
