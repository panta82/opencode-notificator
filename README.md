# opencode-notificator

Desktop notifications and sound alerts for **OpenCode V2**.

Notifies you when the agent is waiting on you or when a turn ends:

| Event | Trigger (V2 event) | Meaning |
| --- | --- | --- |
| `done` | `session.idle` / `session.status` (idle) | a turn finished |
| `question` | `form.created` | the agent asked you a question |
| `permission` | `permission.asked` | a permission is required |
| `error` | `session.execution.failed` | a turn failed |
| `subagent` | idle of a child session | a subagent finished (off by default) |
| `answered` | `form.replied` / `permission.replied` | you answered (off by default) |

Works even when the terminal is focused, shows rich text (project • session • duration),
and runs on the OpenCode server so it also covers headless `opencode run` and subagents.

## Install

```sh
# from npm (after publishing)
opencode plugin add @yasin.herken/opencode-notificator

# or from GitHub
opencode plugin add github:yasin-herken/opencode-notificator

# or locally: drop the folder into one of
#   ~/.config/opencode/plugins/opencode-notificator/   (global)
#   .opencode/plugins/opencode-notificator/            (project)
```

Then restart if needed:

```sh
opencode service restart
```

That's it — notifications fire automatically. Everything below is optional tuning.

## Configure

Config is merged in this order (later wins):

```
built-in defaults  <  ./notificator.jsonc  <  "options" in opencode.json
```

> **When installed from npm/GitHub, use `options`.** The bundled
> `notificator.jsonc` lives inside the package folder, so editing it is
> impractical. The jsonc file is only convenient for local/manual installs
> (where the plugin folder is yours to edit).

Add to your `opencode.json` / `opencode.jsonc`:

```jsonc
{
  "plugins": [
    {
      "package": "@yasin.herken/opencode-notificator",
      "options": {
        // turn on plugin sounds (off by default)
        "sound": { "enabled": true, "volume": 0.6 },
        // skip "done" pings for turns shorter than 10s
        "minDuration": 10,
        // notify when subagents finish too
        "notifyOn": { "subagent": true },
        // shorter body: drop the project name
        "showProjectName": false
      }
    }
  ]
}
```

### All options

| Option | Default | Description |
| --- | --- | --- |
| `enabled` | `true` | Master switch for the whole plugin |
| `notifications.enabled` | `true` | Desktop banners (macOS `osascript`, Linux `notify-send`) |
| `notifications.title` | `"OpenCode"` | Notification title prefix |
| `sound.enabled` | `false` | Plugin-owned sounds (off to avoid double sounds with the built-in `attention.sound`) |
| `sound.volume` | `0.6` | `0`–`1` |
| `sound.files` | macOS system sounds | Per-event custom file (absolute path or file name) for `done` / `question` / `permission` / `error` / `subagent` |
| `notifyOn.done` | `true` | A turn finished |
| `notifyOn.question` | `true` | The agent asked a question |
| `notifyOn.permission` | `true` | A permission is required |
| `notifyOn.error` | `true` | A turn failed |
| `notifyOn.subagent` | `false` | A subagent finished (noisy, off by default) |
| `notifyOn.answered` | `false` | You answered a question/permission (you are already present, so off by design) |
| `notifyChildSessions` | `false` | Notify for child sessions on question/permission/error |
| `minDuration` | `0` | Ignore `done` for turns shorter than this many seconds |
| `showProjectName` | `true` | Include project name in the body |
| `showSessionTitle` | `true` | Include session title in the body |
| `showDuration` | `true` | Include turn duration in the body |
| `command.enabled` / `command.path` / `command.args` | `false` / `""` / `[]` | Run an external command per event; args support `{event}` `{title}` `{message}` `{project}` |
| `messages.*` | see jsonc | Custom text per event: `done` `question` `permission` `error` `subagent` `answered` |
| `debug` | `false` | Log every received event type to `notificator-debug.log` (next to `index.js`) |

### Recipes

Custom sound per event:

```jsonc
"options": {
  "sound": {
    "enabled": true,
    "volume": 0.8,
    "files": { "done": "/Users/you/Sounds/done.aiff", "error": "/Users/you/Sounds/oops.aiff" }
  }
}
```

Only errors and questions, no banners for routine turn ends:

```jsonc
"options": {
  "notifyOn": { "done": false, "question": true, "permission": true, "error": true }
}
```

Fire a custom hook (e.g. ntfy / Home Assistant / osascript) instead of, or next to,
the built-in output:

```jsonc
"options": {
  "notifications": { "enabled": false },
  "command": {
    "enabled": true,
    "path": "/usr/local/bin/ntfy",
    "args": ["pub", "opencode", "{message}"]
  }
}
```

Troubleshooting — log every raw event type the plugin receives:

```jsonc
"options": { "debug": true }
```

## Built-in vs this plugin

OpenCode V2 already has built-in alerts in `cli.json`:

```json
{ "attention": { "notifications": true, "sound": true } }
```

Differences: the built-in lives in the **TUI client** and suppresses notification
banners while the terminal is focused (`when: "blurred"`), with fixed messages.
This plugin lives in the **server**, is focus-independent, and builds the message
(project, session title, duration). A common setup is built-in `sound` + this
plugin's `notifications` to avoid duplicate banners.

## Development

```sh
node test-notificator.mjs   # drives synthetic events; you should see banners/sounds
```

## Requirements

- macOS (`osascript`, `afplay`) or Linux (`notify-send`, `paplay`)
- Node 20+

## License

MIT
