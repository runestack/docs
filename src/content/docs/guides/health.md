---
title: Health checks
description: Designing probes that catch real failures without flapping. HTTP and TCP supported today.
---

A probe tells Rune whether an instance is doing its job. Failed probes mean the reconciler kills and replaces the instance. Get this right.

## Probe types

| Type   | What it does                                                     |
| ------ | ---------------------------------------------------------------- |
| `http` | GETs a path. Healthy if 2xx/3xx within timeout.                  |
| `tcp`  | Opens a TCP connection. Healthy if the connect succeeds.         |

Process-level health (PID alive) is implicit — that's what the runner watches. Probes are for application-level health.

## HTTP probe

```yaml
health:
  liveness:
    type: http
    path: /healthz
    port: 8080
    scheme: http             # or https
    headers:
      X-Health-Check: rune
    initialDelaySeconds: 5
    intervalSeconds: 10
    timeoutSeconds: 2
    failureThreshold: 3
    successThreshold: 1
```

Tunables:

| Field                  | Default | Notes                                                              |
| ---------------------- | ------- | ------------------------------------------------------------------ |
| `initialDelaySeconds`  | `0`     | Wait this long after container start before first probe.           |
| `intervalSeconds`      | `10`    | Time between probes.                                               |
| `timeoutSeconds`       | `1`     | Per-probe timeout.                                                 |
| `failureThreshold`     | `3`     | Consecutive failures before marking unhealthy.                     |
| `successThreshold`     | `1`     | Consecutive successes before marking healthy after a failure.      |

## TCP probe

```yaml
health:
  liveness:
    type: tcp
    port: 5432
    intervalSeconds: 5
    timeoutSeconds: 2
```

Use TCP when there's no HTTP endpoint to hit — databases, message queues, custom protocols.

## Designing a good probe

1. **Probe the dependency, not the framework.** A `/healthz` that always returns 200 tells you nothing. A `/healthz` that pings the DB and returns 503 if it can't is useful.
2. **Be cheap.** Probes run every 10s × N instances. Don't hit a slow query.
3. **Don't probe upstream services.** If your probe checks "can I reach the auth API?" then a brief auth blip kills your whole service. Keep probe scope local.
4. **Set `initialDelaySeconds`** generously for slow-starting services — JVM, Rails, anything with warm-up.
5. **`failureThreshold * intervalSeconds` is your tolerance window.** Default is 30s before kill — usually right.

## Inspecting probe state

```sh
rune health api --checks
rune health instance api-instance-abc123 --checks
```

Output includes the most recent probe result, last failure message, and consecutive counts.

## When probes lie

The two failure modes:

- **False negatives** — your service is fine but probes fail. Cause: tight timeout, expensive endpoint, network blip. The reconciler kills working instances. Fix: relax timeouts, simplify the endpoint.
- **False positives** — your service is broken but probes pass. Cause: probe doesn't actually exercise the failing path. Fix: have `/healthz` touch the things that actually matter (DB connection, cache, queue).

## Liveness vs. readiness

Today Rune has a single probe per service (`liveness`). Readiness — "ready to serve traffic but not yet probed-as-healthy" — is on the roadmap as part of multi-node ingress (RUNE-063).

For now, your liveness probe is your readiness probe. Treat it as both.
