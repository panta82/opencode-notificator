// ============================================================================
// opencode-notificator (OpenCode V2 plugin)
// ----------------------------------------------------------------------------
// Desktop notification + sound alerts for OpenCode V2.
//
//   - done        : a prompt/turn finished   (session.idle / session.status)
//   - question    : the agent asked a question (form.created)
//   - permission  : a permission is required (permission.asked)
//   - error       : a turn failed            (session.execution.failed)
//   - subagent    : a child/subagent session finished (optional)
//
// V2 port of https://github.com/panta82/opencode-notificator, using the V2
// plugin API: Plugin.define + ctx.event.subscribe() + ctx.session.get().
//
// Config: ./notificator.jsonc (optional), overridable via plugin "options"
// in opencode.json:  { "package": "~/.config/opencode/plugins/opencode-notificator",
//                      "options": { "sound": { "enabled": true } } }
// ============================================================================

import { Plugin } from "@opencode/plugin"
import { spawn } from "node:child_process"
import { readFileSync, appendFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join, basename } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))

// ----------------------------------------------------------------------------
// Default configuration
// ----------------------------------------------------------------------------
const DEFAULTS = {
  enabled: true,
  notifications: { enabled: true, title: "OpenCode" },
  sound: { enabled: false, volume: 0.6, files: {} },
  // "answered" is OFF by design: when you answer a question/permission you are
  // already present, so a notification there is noise. Turn it on to debug.
  notifyOn: { done: true, question: true, permission: true, error: true, subagent: false, answered: false },
  // Log every received event type to notificator-debug.log (for troubleshooting).
  debug: false,
  notifyChildSessions: false,
  minDuration: 0,
  showProjectName: true,
  showSessionTitle: true,
  showDuration: true,
  command: { enabled: false, path: "", args: [] },
  messages: {
    done: "Task completed",
    question: "A question was asked",
    permission: "Permission needed",
    error: "An error occurred",
    subagent: "Subtask completed",
    answered: "Answered",
  },
}

// macOS built-in alert sounds per event (no assets needed).
const MAC_SYSTEM_SOUNDS = {
  done: "/System/Library/Sounds/Glass.aiff",
  question: "/System/Library/Sounds/Ping.aiff",
  permission: "/System/Library/Sounds/Basso.aiff",
  error: "/System/Library/Sounds/Funk.aiff",
  subagent: "/System/Library/Sounds/Pop.aiff",
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
function loadJsonc(path) {
  try {
    const raw = readFileSync(path, "utf-8")
    const stripped = raw
      .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
      .replace(/(^|[^:])\/\/.*$/gm, "$1") // line comments (keep urls like https://)
    return JSON.parse(stripped)
  } catch (err) {
    if (err && err.code !== "ENOENT") {
      console.error(`[opencode-notificator] config error: ${err.message}`)
    }
    return {}
  }
}

function merge(base, override) {
  const out = { ...base }
  for (const [key, value] of Object.entries(override ?? {})) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = merge(base[key] ?? {}, value)
    } else if (value !== undefined) {
      out[key] = value
    }
  }
  return out
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return ""
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rest = s % 60
  if (m < 60) return rest ? `${m}m ${rest}s` : `${m}m`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

function fireAndForget(cmd, args) {
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true })
    child.on("error", () => {})
    child.unref()
  } catch {
    // never let a notification break the host
  }
}

// ----------------------------------------------------------------------------
// Plugin
// ----------------------------------------------------------------------------
export default Plugin.define({
  id: "opencode-notificator",

  async setup(ctx) {
    const fileConfig = loadJsonc(join(__dirname, "notificator.jsonc"))
    const config = merge(merge(DEFAULTS, fileConfig), ctx.options ?? {})

    if (config.enabled === false) {
      return
    }

    const debugLog = (line) => {
      if (config.debug !== true) return
      try {
        appendFileSync(join(__dirname, "notificator-debug.log"), `${new Date().toISOString()} ${line}\n`)
      } catch {
        // ignore
      }
    }

    const projectLabel = () => {
      const dir = ctx.location?.project?.directory ?? ctx.location?.directory ?? ""
      return dir ? basename(dir) : ""
    }

    // Sessions we have seen: sessionID -> { title, parentID, startedAt }
    const sessions = new Map()
    // Last notification time per session, to de-duplicate idle/status pairs.
    const lastNotified = new Map()
    const DEDUPE_MS = 1500

    const playSound = (event) => {
      if (config.sound.enabled !== true) return
      const file = config.sound.files?.[event] || MAC_SYSTEM_SOUNDS[event]
      const volume = typeof config.sound.volume === "number" ? config.sound.volume : 0.6

      if (process.platform === "darwin") {
        if (file) fireAndForget("afplay", ["-v", String(volume), file])
      } else if (process.platform === "linux") {
        if (file) fireAndForget("paplay", [file])
      }
    }

    const notifyDesktop = (title, message) => {
      if (config.notifications.enabled !== true) return

      if (process.platform === "darwin") {
        // argv form avoids all quoting/escaping issues.
        fireAndForget("osascript", [
          "-e",
          "on run argv\n display notification (item 1 of argv) with title (item 2 of argv)\nend run",
          message,
          title,
        ])
      } else if (process.platform === "linux") {
        fireAndForget("notify-send", [title, message])
      }
    }

    const runCommand = (event, title, message) => {
      if (config.command.enabled !== true || !config.command.path) return
      const args = (config.command.args ?? []).map((arg) =>
        String(arg)
          .replaceAll("{event}", event)
          .replaceAll("{title}", title)
          .replaceAll("{message}", message)
          .replaceAll("{project}", projectLabel()),
      )
      fireAndForget(config.command.path, args)
    }

    const emit = (event, title, message) => {
      notifyDesktop(title, message)
      playSound(event)
      runCommand(event, title, message)
    }

    const sessionMeta = async (sessionID) => {
      let meta = sessions.get(sessionID)
      if (meta && meta.title !== undefined && meta.parentID !== undefined) return meta

      try {
        const res = await ctx.session.get({ sessionID })
        const info = res?.data ?? res
        if (info) {
          meta = {
            title: info.title,
            parentID: info.parentID,
            startedAt: meta?.startedAt,
          }
          sessions.set(sessionID, meta)
        }
      } catch {
        // ignore - fall back to cached/partial data
      }
      return meta ?? {}
    }

    const buildBody = (base, meta, durationMs) => {
      const parts = []
      if (config.showProjectName) {
        const project = projectLabel()
        if (project) parts.push(project)
      }
      if (config.showSessionTitle && meta?.title) parts.push(meta.title)
      if (config.showDuration && durationMs > 0) parts.push(formatDuration(durationMs))
      return parts.length ? `${base} — ${parts.join(" • ")}` : base
    }

    const shouldNotify = (sessionID) => {
      const now = Date.now()
      const last = lastNotified.get(sessionID) ?? 0
      if (now - last < DEDUPE_MS) return false
      lastNotified.set(sessionID, now)
      return true
    }

    const isChild = (meta) => Boolean(meta?.parentID)

    // -- event handlers -------------------------------------------------------

    const onDone = async (sessionID, title) => {
      if (config.notifyOn.done !== true) return
      if (!shouldNotify(sessionID)) return

      const meta = await sessionMeta(sessionID)
      if (isChild(meta)) {
        if (config.notifyOn.subagent === true) {
          emit("subagent", `${title} • ${config.messages.subagent}`, buildBody(config.messages.subagent, meta, 0))
        }
        return
      }

      const durationMs = meta?.startedAt ? Date.now() - meta.startedAt : 0
      if (config.minDuration > 0 && durationMs > 0 && durationMs < config.minDuration * 1000) return

      emit("done", title, buildBody(config.messages.done, meta, durationMs))
    }

    const onQuestion = async (sessionID, formTitle) => {
      if (config.notifyOn.question !== true) return
      const meta = await sessionMeta(sessionID)
      if (isChild(meta) && config.notifyChildSessions !== true) return
      const base = formTitle ? `${config.messages.question}: ${formTitle}` : config.messages.question
      emit("question", "OpenCode • Question", buildBody(base, meta, 0))
    }

    const onPermission = async (sessionID, action, resources, message) => {
      if (config.notifyOn.permission !== true) return
      const meta = await sessionMeta(sessionID)
      if (isChild(meta) && config.notifyChildSessions !== true) return
      const detail = message || [action, resources].filter(Boolean).join(": ")
      const base = detail ? `${config.messages.permission}: ${detail}` : config.messages.permission
      emit("permission", "OpenCode • Permission", buildBody(base, meta, 0))
    }

    const onError = async (sessionID, errorMessage) => {
      if (config.notifyOn.error !== true) return
      const meta = await sessionMeta(sessionID)
      if (isChild(meta) && config.notifyChildSessions !== true) return
      const base = errorMessage ? `${config.messages.error}: ${errorMessage}` : config.messages.error
      emit("error", "OpenCode • Error", buildBody(base, meta, 0))
    }

    // Off by default (see notifyOn.answered). Enable to be pinged when a
    // question/permission is answered.
    const onAnswered = async (sessionID, what) => {
      if (config.notifyOn.answered !== true) return
      const meta = await sessionMeta(sessionID)
      if (isChild(meta) && config.notifyChildSessions !== true) return
      emit("answered", "OpenCode • Answered", buildBody(what || config.messages.answered, meta, 0))
    }

    // -- single event subscriber ---------------------------------------------

    const controller = new AbortController()

    void (async () => {
      try {
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          const type = event?.type
          const data = event?.data ?? {}
          const sessionID = data.sessionID
          debugLog(type)

          switch (type) {
            case "session.created": {
              if (sessionID) {
                sessions.set(sessionID, {
                  title: data.title,
                  parentID: data.parentID,
                  startedAt: undefined,
                })
              }
              break
            }

            case "session.renamed": {
              const meta = sessions.get(sessionID)
              if (meta) meta.title = data.title ?? meta.title
              break
            }

            case "session.execution.started": {
              const meta = sessions.get(sessionID) ?? {}
              meta.startedAt = Date.now()
              if (sessionID) sessions.set(sessionID, meta)
              break
            }

            case "session.status": {
              if (sessionID && data.status?.type === "busy") {
                const meta = sessions.get(sessionID) ?? {}
                if (!meta.startedAt) {
                  meta.startedAt = Date.now()
                  sessions.set(sessionID, meta)
                }
              } else if (sessionID && data.status?.type === "idle") {
                await onDone(sessionID, "OpenCode")
              }
              break
            }

            case "session.idle": {
              await onDone(sessionID, "OpenCode")
              break
            }

            case "session.execution.failed": {
              const message = data.error?.message ?? data.error?.type
              await onError(sessionID, message)
              break
            }

            case "form.created": {
              await onQuestion(data.form?.sessionID ?? sessionID, data.form?.title)
              break
            }

            case "permission.asked": {
              await onPermission(sessionID, data.action, (data.resources ?? []).join(", "), data.message)
              break
            }

            case "form.replied": {
              await onAnswered(data.sessionID ?? sessionID, config.messages.answered)
              break
            }

            case "permission.replied": {
              await onAnswered(sessionID, config.messages.answered)
              break
            }

            default:
              break
          }
        }
      } catch (err) {
        if (err?.name !== "AbortError") {
          console.error(`[opencode-notificator] event stream error: ${err?.message ?? err}`)
        }
      }
    })()

    return () => controller.abort()
  },
})
