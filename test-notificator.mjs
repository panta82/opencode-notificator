// Isolated smoke test for the notificator plugin.
//   node test-notificator.mjs
// Fakes the V2 plugin context and pushes synthetic events, so you should see
// real desktop banners and (optionally) hear sounds without running OpenCode.

import plugin from "./index.js"

class Channel {
  constructor() {
    this.queue = []
    this.waiting = null
  }
  push(value) {
    if (this.waiting) {
      const resolve = this.waiting
      this.waiting = null
      resolve({ value, done: false })
    } else {
      this.queue.push(value)
    }
  }
  async *subscribe({ signal } = {}) {
    while (true) {
      if (signal?.aborted) return
      if (this.queue.length) {
        yield this.queue.shift()
        continue
      }
      const next = await new Promise((resolve) => {
        this.waiting = resolve
        signal?.addEventListener("abort", () => resolve({ value: undefined, done: true }), { once: true })
      })
      if (next.done) return
      yield next.value
    }
  }
}

const channel = new Channel()

const ctx = {
  options: {
    // For the test, enable plugin sound too (default is off).
    sound: { enabled: true },
  },
  location: {
    directory: process.cwd(),
    project: { id: "test", directory: process.cwd(), canonical: process.cwd() },
  },
  session: {
    async get() {
      return { title: "Login bug session", parentID: undefined }
    },
  },
  event: { subscribe: (opts) => channel.subscribe(opts) },
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const ses = "ses_test_0001"

console.log("Starting plugin...")
const cleanup = await plugin.setup(ctx)
await wait(300)

console.log("1) done  -> session.execution.started + session.idle")
channel.push({ type: "session.created", data: { sessionID: ses, title: "Login bug session" } })
channel.push({ type: "session.execution.started", data: { sessionID: ses } })
await wait(1500)
channel.push({ type: "session.idle", data: { sessionID: ses } })
await wait(1200)

console.log("2) question -> form.created")
channel.push({
  type: "form.created",
  data: { form: { id: "frm_1", sessionID: ses, title: "Which database should I target?" } },
})
await wait(1200)

console.log("3) permission -> permission.asked")
channel.push({
  type: "permission.asked",
  data: { sessionID: ses, action: "shell", resources: ["git push origin main"] },
})
await wait(1200)

console.log("4) error -> session.execution.failed")
channel.push({
  type: "session.execution.failed",
  data: { sessionID: ses, error: { type: "provider.error", message: "upstream 500" } },
})
await wait(1200)

console.log("Done. If you saw 4 banners (and 4 sounds), the plugin works.")
cleanup?.()
process.exit(0)
