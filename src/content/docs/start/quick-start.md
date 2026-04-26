---
title: Quick start
description: Boot a Rune server, bootstrap a token, and deploy your first service in under five minutes.
---

This guide gets you from zero to a running service. Estimated time: 5 minutes.

## Prerequisites

- Linux or macOS (`amd64` or `arm64`).
- Docker, if you want to run container services. The process runner works without it.
- `runed` and `rune` installed. See [Installation](/start/installation/) — or run the one-liner below.

```sh
curl -fsSL https://raw.githubusercontent.com/runestack/rune/master/scripts/install.sh | sudo bash -s -- --version v0.1.0
```

## 1. Start the server

If you installed via the server script, `runed` is already running as a systemd unit:

```sh
sudo systemctl start runed
sudo systemctl status runed
```

For local hacking you can run it directly:

```sh
runed --data-dir ~/.rune/data --grpc-addr :7863 --http-addr :7861
```

`runed` listens on:

- **gRPC** — `:7863` (primary API for the CLI)
- **REST** — `:7861` (gateway for HTTP clients)

## 2. Bootstrap a root token

The first time you talk to `runed`, you create the root admin token. This call is gated to localhost on the server side, so run it on the same machine:

```sh
rune admin bootstrap --out-file ~/.rune/token
```

Output:

```
Bootstrap successful. Token written to ~/.rune/token (mode 0600).
```

The token is a long random string of the form `<uuid>.<uuid>`. Keep it safe — it has full root privileges.

## 3. Configure the CLI

Point the CLI at your server and tell it which token to use:

```sh
rune login local \
  --server localhost:7863 \
  --token-file ~/.rune/token \
  --namespace default
```

Verify:

```sh
rune whoami
```

You should see:

```
Current Context: local
Server: localhost:7863
Default Namespace: default
Status: Authenticated
Subject ID: <uuid>
Name: root
Policies: [root]
```

## 4. Deploy your first service

Create a file `echo.yaml`:

```yaml
service:
  name: echo
  namespace: default
  image: busybox
  scale: 1
  command: "/bin/sh"
  args:
    - "-c"
    - "while true; do echo \"Hello from Rune! $(date)\"; sleep 5; done"
```

Apply it:

```sh
rune cast echo.yaml
```

## 5. Watch it run

```sh
rune get services
rune logs echo --tail=20 --follow
```

You should see the echo loop streaming.

```
Hello from Rune! Sat Apr 25 18:00:00 UTC 2026
Hello from Rune! Sat Apr 25 18:00:05 UTC 2026
...
```

## 6. Scale and clean up

Scale to 3 instances, then tear it down:

```sh
rune scale echo 3
rune get instances
rune delete echo
```

## Where next

- [Deploy your first service](/guides/first-service/) — same idea, with health checks, env vars, and ports.
- [CLI reference](/cli/overview/) — every command and flag.
- [Service spec](/reference/service-spec/) — the full YAML schema.
- [Bootstrap & first user](/start/bootstrap/) — create a non-root user with scoped permissions.
