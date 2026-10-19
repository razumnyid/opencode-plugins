import { Plugin } from "@opencode/plugin"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const STORAGE_DIR = join(homedir(), ".local/share/opencode/pasted-images")

const DATA_URL_REGEX = /^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,([\s\S]*)$/i

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "svg",
])

const NUDGE = `The user has attached one or more images. Each image is represented by a marker like [Image: /path/to/file.png]. When you need to understand the image, read that file. If the model supports image input, the file path is also available as an attachment.`

type FileAttachment = {
  uri?: string
  mime?: string
  name?: string
  [key: string]: unknown
}

function extensionFromMime(mimeType: string): string {
  const lowered = mimeType.toLowerCase()
  if (lowered === "image/jpeg") return "jpg"
  if (lowered === "image/svg+xml") return "svg"
  const slash = lowered.indexOf("/")
  if (slash === -1) return "bin"
  return lowered.slice(slash + 1).replace(/[^a-z0-9.+-]/gi, "") || "bin"
}

function isImageMime(mime?: string): boolean {
  return typeof mime === "string" && mime.toLowerCase().startsWith("image/")
}

function extFromPath(filePath: string): string {
  const dot = filePath.lastIndexOf(".")
  if (dot === -1) return ""
  return filePath.slice(dot + 1).toLowerCase()
}

function isImageUri(uri: string): boolean {
  if (uri.startsWith("data:")) {
    const match = DATA_URL_REGEX.exec(uri)
    if (match) {
      const mime = (match[1] || "").toLowerCase()
      return mime.startsWith("image/")
    }
    return false
  }
  if (uri.startsWith("file:")) {
    try {
      const path = fileURLToPath(uri)
      return IMAGE_EXTENSIONS.has(extFromPath(path))
    } catch {
      return false
    }
  }
  return IMAGE_EXTENSIONS.has(extFromPath(uri))
}

function parseDataUrl(uri: string): { mimeType: string; bytes: Buffer } | null {
  const match = DATA_URL_REGEX.exec(uri)
  if (!match) return null
  const mimeType = (match[1] || "application/octet-stream").toLowerCase()
  const isBase64 = Boolean(match[2])
  const payload = match[3] || ""
  if (!mimeType.startsWith("image/")) return null
  try {
    const bytes = isBase64
      ? Buffer.from(payload, "base64")
      : Buffer.from(decodeURIComponent(payload), "utf8")
    return { mimeType, bytes }
  } catch {
    return null
  }
}

async function uriToPath(uri: string, storageDir: string): Promise<string | null> {
  // data: URL → save to storage
  if (uri.startsWith("data:")) {
    const parsed = parseDataUrl(uri)
    if (!parsed) return null
    await mkdir(storageDir, { recursive: true })
    const ts = Date.now()
    const rand = Math.random().toString(36).slice(2, 8)
    const ext = extensionFromMime(parsed.mimeType)
    const filePath = join(storageDir, `paste-${ts}-${rand}.${ext}`)
    await writeFile(filePath, parsed.bytes)
    return filePath
  }

  // file: URL → resolve path
  if (uri.startsWith("file:")) {
    try {
      const sourcePath = fileURLToPath(uri)
      if (!existsSync(sourcePath)) return null
      if (sourcePath.startsWith(storageDir)) return sourcePath
      // Copy temp / dragged files into persistent storage so they are not lost.
      await mkdir(storageDir, { recursive: true })
      const bytes = await readFile(sourcePath)
      const ext = extFromPath(sourcePath) || "bin"
      const ts = Date.now()
      const rand = Math.random().toString(36).slice(2, 8)
      const filePath = join(storageDir, `paste-${ts}-${rand}.${ext}`)
      await writeFile(filePath, bytes)
      return filePath
    } catch {
      return null
    }
  }

  // Plain path
  if (existsSync(uri)) {
    if (uri.startsWith(storageDir)) return uri
    try {
      await mkdir(storageDir, { recursive: true })
      const bytes = await readFile(uri)
      const ext = extFromPath(uri) || "bin"
      const ts = Date.now()
      const rand = Math.random().toString(36).slice(2, 8)
      const filePath = join(storageDir, `paste-${ts}-${rand}.${ext}`)
      await writeFile(filePath, bytes)
      return filePath
    } catch {
      return null
    }
  }

  return null
}

export default Plugin.define({
  id: "image-clipboard",
  async setup(ctx) {
    const sessionsWithImages = new Set<string>()

    await ctx.session.hook("prompt", async (event) => {
      const files = (event.prompt.files ?? []) as FileAttachment[]
      if (files.length === 0) return

      const markers: string[] = []
      const remaining: FileAttachment[] = []

      for (const file of files) {
        const uri = file.uri
        if (!uri || !isImageUri(uri)) {
          remaining.push(file)
          continue
        }

        const path = await uriToPath(uri, STORAGE_DIR)
        if (!path) {
          remaining.push(file)
          continue
        }

        markers.push(`[Image: ${path}]`)
      }

      if (markers.length === 0) return

      event.prompt.files = remaining as any
      event.prompt.text = `${event.prompt.text}\n\n${markers.join("\n")}`.trim()
      sessionsWithImages.add(event.sessionID)
    })

    await ctx.session.hook("context", async (event) => {
      if (!sessionsWithImages.has(event.sessionID)) return
      event.system.push({ type: "text", text: NUDGE })
      sessionsWithImages.delete(event.sessionID)
    })
  },
})
