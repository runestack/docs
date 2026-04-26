---
title: Process runner
description: Run native processes (no Docker) under Rune. Useful for legacy binaries, agents, and dev workflows.
---

Not everything is a container. Rune ships a process runner alongside the Docker runner, so you can supervise a native binary the same way you'd supervise a container.

## When to use it

- Legacy binaries that don't containerize cleanly.
- Local development where Docker is heavyweight.
- System-level agents that need direct host access.
- Anything that needs to share the host's network stack with zero overhead.

## Spec

```yaml
service:
  name: agent
  namespace: default
  scale: 1

  process:
    command: /usr/local/bin/myagent
    args:
      - --config
      - /etc/myagent/agent.toml
    workdir: /var/lib/myagent

  env:
    AGENT_LOG_LEVEL: info

  health:
    liveness:
      type: tcp
      port: 9100
      intervalSeconds: 10
```

The presence of `process:` (and absence of `image:`) tells Rune to use the process runner.

## Required vs. optional fields

| Field             | Required | Notes                                              |
| ----------------- | -------- | -------------------------------------------------- |
| `command`         | yes      | Absolute path to the executable on the host.       |
| `args`            | no       | List of string arguments.                          |
| `workdir`         | no       | Working directory. Defaults to `/`.                |
| `env`             | no       | Environment variables (merged with `envFrom`).      |
| `securityContext` | no       | User, group, capabilities, read-only FS — see below. |

## Health checks

The runner watches the PID — process death is detected immediately and triggers a restart. On top of that, you can declare an HTTP or TCP probe to catch hung-but-alive processes. Same shape as containers.

## Security context

```yaml
process:
  command: /usr/local/bin/myagent
  securityContext:
    user: rune-agent
    group: rune-agent
    readOnlyFS: true
    capabilities: [NET_BIND_SERVICE]
    deniedSyscalls: [ptrace, mount]
```

| Field             | Status today                                            |
| ----------------- | ------------------------------------------------------- |
| `user`, `group`   | **Implemented** — process runs as that uid/gid.         |
| `readOnlyFS`      | Accepted; **not enforced yet** — logs a warning.         |
| `capabilities`    | Accepted; **not enforced yet** (Linux only).            |
| `allowedSyscalls`/`deniedSyscalls` | Accepted; **not enforced yet**.        |

For now, treat `readOnlyFS` / capabilities / syscalls as documentation of intent. Until they're enforced, prefer running under a dedicated unprivileged user (`user:`).

## Logs

The process runner captures stdout and stderr line-by-line. `rune logs <name>` works the same as for containers.

If your process logs to a file, you'll need to either redirect to stdout in your wrapper script, or wait for log forwarding (RUNE-074).

## Limits

- **No image versioning.** With containers you pin `myimage:1.2.3`. With processes, the binary on disk is whatever's there. Use immutable filesystem layouts or a deploy script that updates atomically.
- **No isolation.** A process service shares the host kernel, FS, and networking. One misbehaving process can affect others on the same host.
- **No cross-host portability.** A process service binds you to a specific host's runtime — its libc, paths, etc.

## When to migrate to a container

If you find yourself building chroot wrappers, custom init scripts, or copying binaries into systemd units, you've outgrown the process runner. Containerize.
