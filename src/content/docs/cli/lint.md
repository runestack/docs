---
title: rune lint
description: Validate Rune YAML — both server config (runefiles) and resource specs (castfiles) — before applying.
---

`lint` is your "pre-flight check." Run it in CI. Run it before `cast`. It catches schema errors, typos, and common mistakes early.

## Examples

```sh
# Single file
rune lint myservice.yaml

# Recurse into a directory
rune lint ./manifests --recursive

# JSON for CI
rune lint examples/config/rune.yaml --format json

# Auto-fix simple issues
rune lint manifests/ --recursive --fix

# Bail on first failure
rune lint manifests/ --recursive --exit-on-fail
```

## What it validates

- **Schema** — every required field present, types correct, enums valid.
- **DNS-1123 names** — services, secrets, configmaps, namespaces.
- **Resource references** — `secretMounts.secretName` points to something defined or already in the cluster.
- **Cron expressions** (planned) on jobs.
- **CORS policies** — at least one allowed origin if specified.
- **Dependency cycles** — detected and rejected.
- **Runefile fields** — for server configs, addresses are well-formed, paths exist, etc.

It tells the difference between a runefile and a service spec by content, not filename.

## Flags

| Flag                | Default | Notes                                              |
| ------------------- | ------- | -------------------------------------------------- |
| `-r, --recursive`   | false   | Recurse into directories.                          |
| `--format <fmt>`    | `text`  | `text` or `json`.                                  |
| `--context <n>`     | `1`     | Lines of context shown around errors.              |
| `--expand-context`  | false   | Equivalent to `--context=3`.                       |
| `--quiet`           | false   | Errors only — no progress or success messages.     |
| `--exit-on-fail`    | false   | Stop at first failure.                             |
| `--fix`             | false   | Attempt safe auto-fixes (whitespace, defaults).    |
| `--strict`          | false   | Reserved for stricter rules.                       |

## In CI

```sh
rune lint manifests/ --recursive --format=json --exit-on-fail
```

Non-zero exit on any failure. Pipe to `jq` to extract structured errors for build annotations.

## See also

- [Service spec](/reference/service-spec/)
- [Runefile reference](/reference/runefile/)
