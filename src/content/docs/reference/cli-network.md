---
title: Networking CLI
description: Reference for `rune get ingress`, `rune get netpolicy`, and `rune get network` — the CLI surface for the networking layer.
---

This page is the operator reference for the networking-layer CLI. It covers what each command does, the flags it accepts, and the JSON shape it emits when you ask for `-o json`.

For the conceptual picture, see [Concepts: Networking](/concepts/networking/). For task-oriented walkthroughs, see [Expose a service](/guides/expose-service/) and [Write a network policy](/guides/network-policy/).

## Ingress

Inspect ingress + TLS certificate state. Read-only — these commands never mutate cluster state.

### `rune get ingresses`

List every service whose `spec.expose.host` is set, with its TLS mode, certificate state, and time-to-expiry.

```bash
rune get ingresses [-n <namespace>] [-A] [-o table|json|yaml]
```

| Flag                | Description                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------- |
| `-n, --namespace`   | Restrict to one namespace. Defaults to the context's default namespace.                  |
| `-A, --all`         | List across all namespaces.                                                              |
| `-o, --output`      | `table` (default), `json`, or `yaml`.                                                    |

**Sample output:**

```text
NAMESPACE  SERVICE  HOST             TLS     CERT     EXPIRES
default    api      api.example.com  acme    ready    89d
default    admin    admin.example.io manual  ready    12d
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
    "path": "",
    "port": "http",
    "tlsMode": "acme",
    "cert": {
      "state": "ready",
      "host": "api.example.com",
      "issuedAt": "2026-02-08T14:21:00Z",
      "expiresAt": "2026-05-09T14:21:00Z"
    }
  }
]
```

### `rune get ingress <service>`

Show the full `IngressCertStatus` for one service.

```bash
rune get ingress <service> [-n <namespace>] [-o table|json|yaml]
```

```text
$ rune get ingress api -n default
service:   default/api
host:      api.example.com
port:      http
tls mode:  acme
cert:
  state:   ready
  host:    api.example.com
  issued:  2026-02-08T14:21:00Z
  expires: 2026-05-09T14:21:00Z (in 89d)
```

When a request is failing, `Last error` and `Next retry` populate. The orchestrator retries with exponential backoff; existing certificates keep serving traffic during the retry loop.

## Network policy

Inspect compiled `ServiceNetworkPolicy` rules attached to a service. Read-only.

### `rune get netpolicy <service>`

Render the compiled rule table for a service the way the in-process evaluator sees it.

```bash
rune get netpolicy <service> [-n <namespace>] [-o table|json|yaml]
```

```text
$ rune get netpolicy api -n default
service:   default/api
policy:    default/api
default-deny ingress=true egress=false
ingress rules:
  [0] peers=[service=default/web service=jobs/worker cidr=10.0.0.0/8] ports=[http]
```

`service ... no policy (open)` means the service has no `networkPolicy` block yet. As soon as one is present, the relevant direction flips to default-deny. See [default-deny semantics](/guides/network-policy/#default-deny--opt-in-per-service).

### Validating a policy file

Use [`rune lint`](/cli/overview/) to compile-check a service YAML/JSON document — CIDR parsing, port format, and peer validation — without talking to the server. Run it in CI on every PR to catch typos before they land in the store.

```bash
rune lint api.service.yaml
```

## Cluster network state

Read-only view of cluster-level networking state.

### `rune get network`

Show the bootstrapped cluster CIDR, capacity, and current VIP allocation.

```bash
$ rune get network
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
watch rune get ingresses
```

State will move `pending → ready` and the expiry counter will jump to `in 89d`.

**"Why can't service A reach service B?"**

```bash
rune get netpolicy B -n <ns>
# look for service A in the ALLOW list; if missing, write a policy
```

Cross-reference with `rune_policy_drops_total{service="B",reason=...}` on `/metrics` to confirm packets are being dropped (and why).

**"Am I about to run out of VIPs?"**

```bash
rune get network
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
