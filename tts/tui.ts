import { execFile, spawn } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { userInfo } from "node:os"
import { Plugin } from "@opencode/plugin/tui"

const SAY = `${process.env.HOME}/.local/bin/say`
const UID = userInfo().uid
const RUNTIME = process.env.XDG_RUNTIME_DIR ?? "/tmp"
const PIDFILE = `${RUNTIME}/say-${UID}.pid`
const PAUSED_FILE = `${RUNTIME}/say-${UID}.paused`

// Strip the parts of markdown that sound bad when read aloud.
function speechText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function isActive(): boolean {
  try {
    const pid = parseInt(readFileSync(PIDFILE, "utf8").trim(), 10)
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function isPaused(): boolean {
  return existsSync(PAUSED_FILE)
}

export default Plugin.define({
  id: "tts.cli",
  setup(context) {
    async function lastAssistantText(sessionID: string): Promise<string | undefined> {
      let cursor: string | undefined
      for (let page = 0; page < 3; page++) {
        const response = await context.client.message.list({
          sessionID,
          limit: 50,
          ...(cursor ? { cursor } : { order: "desc" as const }),
          type: "assistant" as const,
        })
        for (const message of response.data ?? []) {
          if (message.type !== "assistant") continue
          const text = message.content
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join("\n\n")
          const clean = speechText(text)
          if (clean) return clean
        }
        cursor = response.cursor?.next ?? undefined
        if (!cursor) break
      }
      return undefined
    }

    function control(flag: string, onMessage?: (message: string) => void) {
      execFile(SAY, [flag], { timeout: 5000 }, (error, stdout) => {
        const message = stdout.trim()
        if (error) {
          context.ui.toast.show({ message: `TTS: ${error.message}`, variant: "error" })
        } else if (onMessage && message) {
          onMessage(message)
        }
      })
    }

    async function startReading() {
      const route = context.ui.router.current()
      if (route.type !== "session") {
        context.ui.toast.show({ message: "Open a session first", variant: "warning" })
        return
      }
      try {
        const text = await lastAssistantText(route.sessionID)
        if (!text) {
          context.ui.toast.show({ message: "No assistant text to read", variant: "warning" })
          return
        }
        const child = spawn(SAY, ["--", text], { detached: true, stdio: "ignore" })
        child.on("error", (error) => {
          context.ui.toast.show({ message: `TTS failed: ${error.message}`, variant: "error" })
        })
        child.unref()
        context.ui.toast.show({ message: "Reading aloud", variant: "info" })
      } catch (error) {
        context.ui.toast.show({ message: `TTS failed: ${error}`, variant: "error" })
      }
    }

    async function toggle() {
      if (isActive()) {
        control("--toggle", (message) => {
          context.ui.toast.show({ message: `TTS: ${message}`, variant: "info" })
        })
      } else {
        await startReading()
      }
    }

    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "tts.say",
          title: "Toggle reading last assistant message",
          description: "Start, pause, or resume edge-tts playback",
          group: "TTS",
          bind: "ctrl+alt+r",
          palette: true,
          slash: { name: "say" },
          async run() {
            await toggle()
          },
        },
        {
          id: "tts.stop",
          title: "Stop reading",
          description: "Stop edge-tts playback completely",
          group: "TTS",
          bind: "ctrl+alt+x",
          palette: true,
          slash: { name: "say-stop" },
          run() {
            control("--stop", (message) => {
              context.ui.toast.show({ message: `TTS: ${message}`, variant: "info" })
            })
          },
        },
      ],
    }))
  },
})
