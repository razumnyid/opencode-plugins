# opencode-plugins

OpenCode v2 plugins for terminal/TUI workflows.

Repository: `https://github.com/razumnyid/opencode-plugins`

## Plugins

### `image-clipboard`

Save pasted (`Ctrl+V`) or dragged images to disk and insert a text marker into the prompt.

What it does:
- On every user prompt it looks at `event.prompt.files`.
- Image attachments (`data:image/...` from clipboard or `file:///` from drag-and-drop) are saved to `~/.local/share/opencode/pasted-images/`.
- The image file part is replaced with a marker like `[Image: /home/.../.local/share/opencode/pasted-images/paste-....png]`.
- A short system nudge is injected so the model knows the image paths are available.

Useful when the active model does not natively accept image attachments, or when you want a persistent copy of pasted screenshots.

### `tts`

Read the last assistant response aloud with `edge-tts`.

Keybinds:
- `Ctrl+Alt+R` — toggle: start reading / pause / resume from the same place.
- `Ctrl+Alt+X` — stop playback completely.
- Slash commands: `/say`, `/say-stop`.

Prerequisites:
- `edge-tts` Python package installed in `~/.local/share/edge-tts/`.
- `ffplay` in `$PATH` (from `ffmpeg`).
- WSLg audio sink working (default `RDPSink`).

## Install

### Quick install (clone directly into OpenCode plugin dir)

```bash
git clone https://github.com/razumnyid/opencode-plugins.git ~/.config/opencode/plugins
```

OpenCode auto-discovers plugins in `~/.config/opencode/plugins/`.

### Development install (keep the repo elsewhere, symlink plugins)

Useful if you want to work on the repo in `~/projects/` and keep OpenCode pointing at it:

```bash
git clone https://github.com/razumnyid/opencode-plugins.git ~/projects/opencode-plugins
mkdir -p ~/.config/opencode/plugins
ln -s ~/projects/opencode-plugins/image-clipboard ~/.config/opencode/plugins/image-clipboard
ln -s ~/projects/opencode-plugins/tts ~/.config/opencode/plugins/tts
```

## Verify

```bash
opencode plugin list
```

You should see:

```
ID               VERSION  SOURCE
image-clipboard  local    /home/<user>/.config/opencode/plugins/image-clipboard/index.ts
tts.server       local    /home/<user>/.config/opencode/plugins/tts/index.ts
```

If a plugin fails to load, check `~/.local/share/opencode/log/opencode.log`.

## Update

```bash
cd ~/.config/opencode/plugins
git pull
```

Or, if using the development symlink setup:

```bash
cd ~/projects/opencode-plugins
git pull
```

Restart or reload OpenCode if a plugin does not hot-reload automatically.

## Adding a new plugin

1. Create a new directory under this repo, e.g. `my-plugin/index.ts`.
2. For TUI plugins use `import { Plugin } from "@opencode/plugin/tui"`.
3. For server plugins use `import { Plugin } from "@opencode/plugin"`.
4. Export `export default Plugin.define({ id: "my-plugin", setup(ctx) { ... } })`.
5. Symlink or copy the directory into `~/.config/opencode/plugins/`.
6. Commit and push.

## Notes

- These plugins are written for **OpenCode v2**. They will not load in v1.
- The repository is currently owned by the GitHub account `razumnyid` because the local `gh` CLI is authenticated as that user. Collaborator access was granted to `thesanedenis`; accept the invite on GitHub if you want to push from that account.
