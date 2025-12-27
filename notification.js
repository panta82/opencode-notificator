import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function stripJsonComments(str) {
  return str
    .replace(/\/\/.*$/gm, '')       // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
}

function loadConfig() {
  try {
    const configPath = join(__dirname, 'notification.jsonc')
    const content = readFileSync(configPath, 'utf-8')
    const stripped = stripJsonComments(content)
    return JSON.parse(stripped)
  } catch (err) {
    console.error('Failed to load notification.jsonc config:', err.message)
    return {}
  }
}

export const NotificationPlugin = async ({ project, client, $, directory, worktree }) => {
  const config = loadConfig()
  const enabled = config.enabled !== false
  const soundConfig = config.playSound || {}
  const soundEnabled = soundConfig.enabled !== false
  const soundFile = soundConfig.file || 'ding1.mp3'

  const playNotificationSound = async () => {
    if (!enabled || !soundEnabled) return
    
    const soundPath = join(__dirname, 'sounds', soundFile)
    const platform = process.platform
    
    try {
      if (platform === "darwin") {
        await $`afplay ${soundPath}`.quiet()
      } else if (platform === "linux") {
        // ffplay handles MP3 properly and is commonly available via ffmpeg
        await $`ffplay -nodisp -autoexit -loglevel quiet ${soundPath}`.quiet()
      }
    } catch (err) {
      // Silently fail - audio is not critical
    }
  }

  const sendNotification = async (title, message) => {
    if (!enabled) return
    
    const platform = process.platform

    try {
      if (platform === "darwin") {
        await $`osascript -e 'display notification ${message} with title ${title}'`
      } else if (platform === "linux") {
        await $`notify-send ${title} ${message}`
      }
    } catch (err) {
      console.error('Failed to send notification:', err.message)
    }
  }

  return {
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        await sendNotification("OpenCode", "Generation completed")
        await playNotificationSound()
      }
    },
    "permission.ask": async (input, output) => {
      const message = `Permission request: ${input.type}`
      await sendNotification("OpenCode", message)
      await playNotificationSound()
    },
  }
}
