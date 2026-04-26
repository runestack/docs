---
title: rune pack
description: Package a runeset directory into a distributable .runeset.tgz archive.
---

```sh
rune pack <runeset-dir> [flags]
```

## Examples

```sh
# Package with default name (<dir>.runeset.tgz)
rune pack ./my-app

# Custom output path
rune pack ./my-app -o dist/my-app-1.2.0.runeset.tgz

# Also write a SHA-256 checksum file
rune pack ./my-app -o dist/my-app-1.2.0.runeset.tgz --sha256
```

Outputs:

- `<output>.runeset.tgz` — the bundle.
- `<output>.runeset.tgz.sha256` — checksum, if `--sha256`.

## Flags

| Flag             | Notes                                                       |
| ---------------- | ----------------------------------------------------------- |
| `-o, --output`   | Output path. Defaults to `<dir>.runeset.tgz`.               |
| `--sha256`       | Also write a `.sha256` file alongside the archive.          |

## What goes in

- `runeset.yaml` (required).
- `values.yaml` (optional).
- Everything under `templates/`.
- `README.md` and other docs at the runeset root.

What's excluded: dotfiles, `node_modules`, `.git`, your local `secrets.local.yaml`, etc. (See the `.runesetignore` pattern matching.)

## Distributing

After packing you can:

- Upload to a release page or CDN.
- Push to a private bucket and reference by URL.
- Commit to a git repo and use `rune cast github.com/org/repo@tag`.

## See also

- [Runesets](/concepts/runesets/)
- [Package a runeset](/guides/runesets/)
