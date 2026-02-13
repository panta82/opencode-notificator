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

function getProjectName(projectPath) {
  if (!projectPath) return 'unknown project'
  // Extract the last directory name and make it human-readable
  const name = projectPath.split('/').filter(Boolean).pop() || 'unknown project'
  // Replace hyphens, underscores, dots with spaces for natural speech
  return name.replace(/[-_.]/g, ' ')
}

let currentSessionID = null

export const NotificationPlugin = async ({ project, client, $, directory, worktree }) => {
  const config = loadConfig()
  const enabled = config.enabled !== false
  const desktopNotificationConfig = config.showDesktopNotification || {}
  const desktopNotificationEnabled = desktopNotificationConfig.enabled !== false
  const soundConfig = config.playSound || {}
  const soundEnabled = soundConfig.enabled !== false
  const ttsConfig = config.textToSpeech || {}
  const ttsEnabled = ttsConfig.enabled !== false
  
  const projectPath = worktree || directory
  const projectName = ttsConfig.projectName || getProjectName(projectPath)
  const ttsVoice = ttsConfig.voice || 'Samantha'
  const ttsRate = ttsConfig.rate || 200
  
  // Determine sound file: explicit file takes priority, then fileSeed, then directory-based with session ID
  let soundFile
  if (soundConfig.file) {
    soundFile = soundConfig.file
  } else if (soundConfig.fileSeed !== undefined) {
    soundFile = pickSoundFile(projectPath, soundConfig.fileSeed)
  } else if (currentSessionID !== null) {
    soundFile = pickSoundFile(projectPath, currentSessionID)
  } else {
    soundFile = pickSoundFile(projectPath, hashString(projectPath))
  }

  const speakNotification = async (message) => {
    if (!enabled || !ttsEnabled) return
    
    const platform = process.platform
    const text = message.replace(/"/g, '\\"')
    
    try {
      if (platform === "darwin") {
        await $`say -v ${ttsVoice} -r ${String(ttsRate)} "${text}"`.quiet()
      } else if (platform === "linux") {
        // espeak is commonly available on Linux
        await $`espeak -s ${String(ttsRate)} "${text}"`.quiet()
      }
    } catch (err) {
      // Silently fail - TTS is not critical
    }
  }

  const playNotificationSound = async () => {
    if (!enabled || !soundEnabled) return
    
    const soundPath = join(__dirname, 'notificator-sounds', soundFile)
    const platform = process.platform
    
    try {
      if (platform === "darwin") {
        await $`afplay "${soundPath}"`.quiet()
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
        const escapedMessage = message.replace(/'/g, "'\"'\"'")
        const escapedTitle = title.replace(/'/g, "'\"'\"'")
        await $`osascript -e 'display notification "${escapedMessage}" with title "${escapedTitle}"'`
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
      if (event.type === "session.idle" && event.sessionID === currentSessionID) {
        await sendNotification("OpenCode", "Generation completed")
        await playNotificationSound()
        await speakNotification(`${projectName} is done`)
      }
    },
    "permission.ask": async (input, output) => {
      const message = `Permission request: ${input.type}`
      await sendNotification("OpenCode", message)
      await playNotificationSound()
      await speakNotification(`${projectName} needs permission`)
    },
  }
}
