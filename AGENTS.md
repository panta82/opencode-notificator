# AGENTS.md

This file contains instructions for AI agents working on this project.

## Project Structure

- `index.js` - Main plugin implementation (OpenCode V2, `Plugin.define`)
- `notificator.jsonc` - Plugin configuration file
- `test-notificator.mjs` - Smoke test driving synthetic V2 events
- `package.json` - Node.js package configuration
- `README.md` - User documentation

## Development Guidelines

- This is a simple OpenCode V2 plugin that uses the `@opencode/plugin` package
- The default export is defined with `Plugin.define({ id, setup })`
- It uses `node:child_process` `spawn` for platform-specific notifications/sounds
  (macOS `osascript` + `afplay`, Linux `notify-send` + `paplay`)
- macOS sounds use built-in system sounds, so no sound assets are bundled

## Testing

To test the plugin:
1. Ensure OpenCode is installed
2. Copy `index.js`, `notificator.jsonc`, and `package.json` to your OpenCode plugins directory
3. Trigger a generation or permission request in OpenCode
4. Verify desktop notifications and sounds appear

## Code Style

- Use ES modules (export syntax)
- Keep the plugin simple and focused
- Support all three major platforms: macOS, Linux, and Windows

