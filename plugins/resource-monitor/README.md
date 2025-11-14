# Resource Monitor Plugin

Real-time system resource monitoring plugin for pupcidslittletiktokhelper.

## Features

### Metrics Collection
- **CPU Usage**: Total and per-core CPU utilization
- **CPU Temperature**: Core temperatures (if available)
- **RAM Usage**: Total, used, free, and percentage
- **Process Memory**: Node.js process-specific memory usage
- **GPU Metrics**: GPU utilization and temperature (if available)
- **System Uptime**: System and process uptime tracking
- **Historical Data**: 60-second rolling buffer of metrics

### Real-time Updates
- WebSocket broadcasting every 1-2 seconds (configurable)
- Automatic client subscription management
- Efficient polling only when clients are connected

### Threshold Monitoring
- Configurable warning and critical thresholds
- Automatic warnings for CPU, Memory, and Temperature
- Real-time alerts via Socket.IO events

### Cross-Platform Support
- Windows, macOS, and Linux support
- Graceful degradation when GPU not available
- Handles missing temperature sensors

## API Endpoints

### HTTP Routes

#### `GET /api/resource-monitor/metrics`
Get current system metrics.

**Response:**
```json
{
  "success": true,
  "metrics": {
    "timestamp": 1699999999999,
    "cpu": {
      "usage": 45.2,
      "idle": 54.8,
      "user": 30.1,
      "system": 15.1,
      "cores": [...],
      "temperature": {
        "main": 65,
        "cores": [...]
      }
    },
    "memory": {
      "total": 17179869184,
      "used": 8589934592,
      "free": 8589934592,
      "usedPercent": 50.0,
      "totalGB": 16.0,
      "usedGB": 8.0,
      "freeGB": 8.0
    },
    "process": {
      "cpu": 2.5,
      "memoryMB": 150.5,
      "pid": 12345
    },
    "uptime": {
      "system": 86400,
      "process": 3600,
      "systemHours": 24,
      "processHours": 1
    },
    "gpu": [...],
    "static": {...}
  }
}
```

#### `GET /api/resource-monitor/history`
Get historical metrics (last 60 seconds).

#### `GET /api/resource-monitor/status`
Get plugin status and configuration.

#### `POST /api/resource-monitor/settings`
Update plugin settings.

**Request Body:**
```json
{
  "updateInterval": 2000,
  "thresholds": {
    "cpu": {
      "warning": 80,
      "critical": 95
    },
    "memory": {
      "warning": 80,
      "critical": 95
    },
    "temperature": {
      "warning": 75,
      "critical": 85
    }
  }
}
```

#### `POST /api/resource-monitor/clear-history`
Clear historical data buffer.

#### `GET /resource-monitor/ui`
Serve the plugin UI (requires ui.html to be created).

## Socket.IO Events

### Client → Server

- `resource-monitor:subscribe` - Subscribe to real-time metrics updates
- `resource-monitor:get-metrics` - Request current metrics (one-time)
- `resource-monitor:get-history` - Request historical data

### Server → Client

- `resource-monitor:metrics` - Real-time metrics broadcast
- `resource-monitor:history` - Historical data response
- `resource-monitor:warnings` - Threshold warnings
- `resource-monitor:error` - Error notifications

## Configuration

Settings are stored in the database table `resource_monitor_settings`:

| Key | Default | Description |
|-----|---------|-------------|
| update_interval | 2000 | Metrics update interval (ms) |
| cpu_warning_threshold | 80 | CPU warning threshold (%) |
| cpu_critical_threshold | 95 | CPU critical threshold (%) |
| memory_warning_threshold | 80 | Memory warning threshold (%) |
| memory_critical_threshold | 95 | Memory critical threshold (%) |
| temp_warning_threshold | 75 | Temperature warning (°C) |
| temp_critical_threshold | 85 | Temperature critical (°C) |

## File Structure

```
plugins/resource-monitor/
├── plugin.json              # Plugin metadata
├── main.js                  # Main plugin class
├── utils/
│   └── metrics-collector.js # Metrics collection logic
└── README.md                # This file
```

## Dependencies

- `systeminformation` (v5.27.11) - System metrics collection
- `events` - EventEmitter for plugin pattern
- `path`, `fs` - File system operations

## Usage Example

### Subscribe to metrics via Socket.IO
```javascript
const socket = io();

// Subscribe to real-time updates
socket.emit('resource-monitor:subscribe');

// Receive metrics
socket.on('resource-monitor:metrics', (metrics) => {
  console.log('CPU Usage:', metrics.cpu.usage);
  console.log('Memory Usage:', metrics.memory.usedPercent);
});

// Receive warnings
socket.on('resource-monitor:warnings', (data) => {
  data.warnings.forEach(warning => {
    console.warn(warning.message);
  });
});
```

### Fetch metrics via HTTP
```javascript
fetch('/api/resource-monitor/metrics')
  .then(res => res.json())
  .then(data => {
    console.log('Current CPU:', data.metrics.cpu.usage);
  });
```

## Performance Optimization

- Metrics collection is paused when no clients are subscribed
- Static system info is cached and updated every 5 minutes
- GPU checks are only performed once at initialization
- Minimal overhead: ~1-2% CPU usage during active monitoring

## Error Handling

- Gracefully handles missing GPU
- Falls back when temperature sensors unavailable
- Continues operation even if individual metrics fail
- Comprehensive logging for troubleshooting

## Future Enhancements

- Network I/O metrics (bandwidth, connections)
- Disk I/O metrics (read/write speeds)
- Battery status (for laptops)
- Per-process resource tracking
- Customizable history buffer size
- Export metrics to CSV/JSON
- Integration with alerting systems

## License

Part of pupcidslittletiktokhelper project.
