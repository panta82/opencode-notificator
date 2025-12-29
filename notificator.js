import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync, readdirSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function stripJsonComments(str) {
  return str
    .replace(/\/\/.*$/gm, '')       // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
}

function loadConfig() {
  try {
    const configPath = join(__dirname, 'notificator.jsonc')
    const content = readFileSync(configPath, 'utf-8')
    const stripped = stripJsonComments(content)
    return JSON.parse(stripped)
  } catch (err) {
    console.error('Failed to load notificator.jsonc config:', err.message)
    return {}
  }
}

// Simple string hash function
function hashString(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash)
}

function getSoundFiles() {
  try {
    const soundsDir = join(__dirname, 'notificator-sounds')
    const files = readdirSync(soundsDir)
      .filter(f => /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(f))
      .sort()
    return files.length > 0 ? files : ['ding1.mp3']
  } catch {
    return ['ding1.mp3']
  }
}

function pickSoundFile(projectPath, seed) {
  const soundFiles = getSoundFiles()
  const input = `${projectPath}:${seed}`
  const hash = hashString(input)
  const index = hash % soundFiles.length
  return soundFiles[index]
}

let currentSessionID = null

export const NotificationPlugin = async ({ project, client, $, directory, worktree }) => {
  const config = loadConfig()
  const enabled = config.enabled !== false
  const desktopNotificationConfig = config.showDesktopNotification || {}
  const desktopNotificationEnabled = desktopNotificationConfig.enabled !== false
  const soundConfig = config.playSound || {}
  const soundEnabled = soundConfig.enabled !== false
  
  // Determine sound file: explicit file takes priority, then fileSeed, then directory-based with session ID
  let soundFile
  if (soundConfig.file) {
    soundFile = soundConfig.file
  } else if (soundConfig.fileSeed !== undefined) {
    soundFile = pickSoundFile(worktree || directory, soundConfig.fileSeed)
  } else if (currentSessionID !== null) {
    soundFile = pickSoundFile(worktree || directory, currentSessionID)
  } else {
    soundFile = pickSoundFile(worktree || directory, hashString(worktree || directory))
  }

  const playNotificationSound = async () => {
    if (!enabled || !soundEnabled) return
    
    const soundPath = join(__dirname, 'notificator-sounds', soundFile)
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
    if (!enabled || !desktopNotificationEnabled) return
    
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
      if (event.type === "session.created" && event.sessionID) {
        currentSessionID = event.sessionID
      }
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
