# OpenCode Notificator Plugin

A plugin for OpenCode that integrates desktop notifications and sound alerts into your workflow.

## Features

- Desktop notifications when code generation completes
- Desktop notifications when OpenCode requests permissions
- Sound notifications with automatic per-project sound assignment
- Custom sounds support (drop your own audio files in `notificator-sounds/`)
- Cross-platform support (macOS, Linux)

## Installation

1. Clone or download this repository

2. Install dependencies:
    ```bash
    npm install
    ```

3. Build the plugin:
    ```bash
    npm run build
    ```

4. Deploy to OpenCode plugins directory:
    ```bash
    npm run deploy
    ```

   This automatically:
   - Builds the plugin
   - Installs to the correct plugins directory for your platform
   - Overwrites any existing version

   Alternatively, use specific commands:
   ```bash
   npm run deploy:build    # Build only
   npm run deploy:install  # Install only (requires dist/ to exist)
   ```

## Usage

Once installed, the plugin will automatically send desktop notifications for:
- **Generation completed**: When an OpenCode session goes idle (generation finished)
- **Permission requests**: When OpenCode asks for permission to perform actions

## Platform-Specific Requirements

### macOS
- No additional dependencies required
- Uses built-in `osascript` for notifications

### Linux
- Requires `notify-send` (part of libnotify)
- Install on Ubuntu/Debian: `sudo apt-get install libnotify-bin`
- Install on Fedora: `sudo dnf install libnotify`

## Configuration

The plugin works out of the box with sensible defaults:
- Desktop and sound notifications are enabled
- Each project automatically gets its own unique sound (based on project path)

Config file location: `~/.config/opencode/plugin/notificator.jsonc`

### Default configuration

```jsonc
{
  "enabled": true,
  "showDesktopNotification": {
    "enabled": true
  },
  "playSound": {
    "enabled": true,
    "fileSeed": 0  // Auto-assigns a sound per project
  }
}
```

By default, the plugin uses `fileSeed` to automatically assign a consistent sound to each project. It hashes `projectPath + seed` to pick from available sounds in the `notificator-sounds/` directory. Change the seed value if you want a different sound assignment.

### Use a specific sound file

To use the same sound for all projects:

```jsonc
{
  "enabled": true,
  "showDesktopNotification": {
    "enabled": true
  },
  "playSound": {
    "enabled": true,
    "file": "ding1.mp3"
  }
}
```

Available sounds: `ding1.mp3` through `ding6.mp3`

### Custom sounds

Add your own audio files to the `notificator-sounds/` directory at `~/.config/opencode/plugin/notificator-sounds/`. Supported formats: `.mp3`, `.wav`, `.ogg`, `.m4a`, `.aac`, `.flac`. They'll automatically be included in the rotation when using `fileSeed`.

### Disable sound notifications

```jsonc
{
  "enabled": true,
  "showDesktopNotification": {
    "enabled": true
  },
  "playSound": {
    "enabled": false
  }
}
```

### Disable desktop notifications (keep sounds only)

```jsonc
{
  "enabled": true,
  "showDesktopNotification": {
    "enabled": false
  },
  "playSound": {
    "enabled": true
  }
}
```

### Disable the entire plugin

```jsonc
{
  "enabled": false
}
```

### Platform-Specific Audio Requirements

#### macOS
- No additional dependencies required
- Uses built-in `afplay` for audio playback

#### Linux
- Requires `ffplay` (part of ffmpeg)
- Install on Ubuntu/Debian: `sudo apt-get install ffmpeg`
- Install on Fedora: `sudo dnf install ffmpeg`

## License

MIT
