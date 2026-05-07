---
title: Networking CLI
description: Reference for `rune ingress`, `rune policy`, and `rune admin network` — the CLI surface for the networking layer.
---

This page is the operator reference for the networking-layer CLI. It covers what each command does, the flags it accepts, and the JSON shape it emits when you ask for `-o json`.

For the conceptual picture, see [Concepts: Networking](/concepts/networking/). For task-oriented walkthroughs, see [Expose a service](/guides/expose-service/) and [Write a network policy](/guides/network-policy/).

## `rune ingress`

Inspect ingress + TLS certificate state. Read-only — these commands never mutate cluster state.

### `rune ingress list`

List every service whose `spec.expose.host` is set, with its TLS mode, certificate state, and time-to-expiry.

```bash
rune ingress list [-n <namespace>] [-A] [-o table|json|yaml]
```

| Flag                | Description                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------- |
| `-n, --namespace`   | Restrict to one namespace. Defaults to the context's default namespace.                  |
| `-A, --all`         | List across all namespaces.                                                              |
| `-o, --output`      | `table` (default), `json`, or `yaml`.                                                    |

**Sample output:**

```text
NAMESPACE  SERVICE  HOST             MODE    STATE    EXPIRES
default    api      api.example.com  acme    ready    in 89d
default    admin    admin.example.io manual  ready    in 12d
jobs       worker   jobs.example.com acme    pending  -
```

Sort order is stable: namespace, then host, then service. Diff-friendly across runs.

The JSON form returns one object per row:

```json
[
  {
    "namespace": "default",
    "service": "api",
    "host": "api.example.com",
    "mode": "acme",
    "state": "ready",
    "issuedAt": "2026-02-08T14:21:00Z",
    "expiresAt": "2026-05-09T14:21:00Z",
    "lastError": "",
    "nextRetryAt": null
  }
]
```

### `rune ingress get <service>`

Show the full `IngressCertStatus` for one service.

```bash
rune ingress get <service> [-n <namespace>] [-o table|json|yaml]
```

```text
$ rune ingress get api -n default
Service:      default/api
Host:         api.example.com
TLS mode:     acme
State:        ready
Issued:       2026-02-08 14:21:00 UTC
Expires:      2026-05-09 14:21:00 UTC (in 89d)
Last error:   -
Next retry:   -
```

When a request is failing, `Last error` and `Next retry` populate. The orchestrator retries with exponential backoff; existing certificates keep serving traffic during the retry loop.

## `rune policy`

Inspect compiled `ServiceNetworkPolicy` rules. Read-only.

### `rune policy explain <service>`

Render the compiled rule table for a service the way the in-process evaluator sees it.

```bash
rune policy explain <service> [-n <namespace>] [-o table|json|yaml]
```

```text
$ rune policy explain api -n default
Service: default/api
Default action: DENY
Compiled rules:
  ALLOW from service=default/web port=8080
  ALLOW from service=jobs/worker  port=8080
  ALLOW from cidr=10.0.0.0/8      port=8080
```

`Default action: ALLOW` means no policy targets this service yet. As soon as any policy lists it, this flips to `DENY` and only the listed sources can reach it. See [default-deny semantics](/guides/network-policy/#default-deny--opt-in-per-service).

### `rune policy validate -f <file>`

Pure-CLI compile check on a policy YAML — CIDR parsing, port format, structural validation. Doesn't talk to the server.

```bash
$ rune policy validate -f api-policy.yaml
api-allow: 1 ingress rule, 2 sources, 1 port — OK
```

Run it in CI on every PR to catch typos before they land in the store.

## `rune admin network`

Privileged commands for cluster-level networking state. Requires an admin token.

### `rune admin network status`

Show the bootstrapped cluster CIDR, capacity, and current VIP allocation.

```bash
$ rune admin network status
CIDR:             10.96.0.0/16
Capacity:         65533 usable IPs
Allocated:        12
Free list size:   3
Pending releases: 0 (cooldown)
```

| Field             | Meaning                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------- |
| CIDR              | The bootstrapped cluster CIDR (set once at first start, immutable thereafter).           |
| Capacity          | Total usable `/32`s in the CIDR (excluding network + broadcast).                         |
| Allocated         | VIPs currently assigned to services.                                                     |
| Free list size    | Released VIPs available for immediate reuse.                                             |
| Pending releases  | VIPs in cooldown after a service deletion (prevents stale-DNS-answer bugs).              |

If `Allocated + Pending releases` approaches `Capacity`, you're running out of VIPs — bump the CIDR (requires re-bootstrapping a new cluster) or audit deleted services that haven't released yet.

## Common workflows

**"Did my certificate just renew?"**

```bash
watch rune ingress list
```

State will move `pending → ready` and the expiry counter will jump to `in 89d`.

**"Why can't service A reach service B?"**

```bash
rune policy explain B -n <ns>
# look for service A in the ALLOW list; if missing, write a policy
```

Cross-reference with `rune_policy_drops_total{service="B",reason=...}` on `/metrics` to confirm packets are being dropped (and why).

**"Am I about to run out of VIPs?"**

```bash
rune admin network status
```

Or alert on the Prometheus gauge:

```promql
rune_vip_allocated / rune_vip_capacity > 0.9
```

## What's not here yet

A few commands are designed but deferred to follow-up tickets:

- `rune trace network <service>` — packet-path tracer from the proxy down through nftables. Needs a server-side gRPC endpoint.
- `rune get endpoints <service>` — read back the OrderedLog `endpoints/` keyspace as resolved by the agent. Needs the watch service to expose it.

Both are tracked and will land before Phase 2.
