---
title: rune whoami / status / version
description: Three small utilities — identity, namespace summary, and version info.
---

## `rune whoami`

```sh
rune whoami
rune whoami -o json
```

Shows the active context, the server, the configured namespace, the (masked) token, whether the connection works, and — if authenticated — the subject ID and attached policies.

```
Current Context: prod
Server: runed.example.com:7863
Default Namespace: prod
Token: 29b******364
Status: Authenticated
Subject ID: fba66da0-98de-48b8-b5d3-ae5111900388
Name: alice
Policies: [readwrite]
```

If `Status: Not connected to server`, run `rune login` again or check that the server is reachable.

## `rune status`

A namespace summary — what's running, what's degraded.

```sh
rune status
rune status -n prod
```

```
Services in default:
NAME     STATUS    SCALE
api      Running   3
worker   Running   5
echo     Failed    1
```

Useful as a health check from a dashboard or shell prompt.

## `rune version`

```sh
rune version
runed --version    # equivalent for the server
```

```
Rune v0.1.0 (abc1234) - 2026-04-25T18:00:00Z darwin/arm64
```

The build is tagged with the git commit and build timestamp. If you see `-dirty` in the version, the binary was built from uncommitted changes.

## Combining

A tiny on-call dashboard:

```sh
watch -n 5 'rune whoami && echo && rune status'
```
