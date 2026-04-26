---
title: Architecture
description: How runed is structured internally — the orchestrator, runners, store, and API layers.
---

This page is the mental model for everything that follows. Read it once, the rest of the docs make more sense.

## The two binaries

| Binary  | Role                                                                 |
| ------- | -------------------------------------------------------------------- |
| `runed` | Server. Owns state, runs the orchestrator, serves the API.           |
| `rune`  | CLI. Pure client — no local state aside from `~/.rune/config.yaml`.  |

The CLI talks to the server over **gRPC** on `:7863` by default. A REST gateway on `:7861` exposes the same surface for HTTP clients.

## Server internals

```
                   ┌──────────────────────────────────────┐
                   │              API Layer                │
   gRPC :7863  ──▶ │    auth → admin → rbac → handler      │
   REST :7861  ──▶ │    (interceptors as a chain)          │
                   └────────────────────┬─────────────────┘
                                        │
                                        ▼
                          ┌──────────────────────────┐
                          │     Service handlers     │   pkg/api/service
                          │  namespace, service,     │
                          │  instance, exec, logs,   │
                          │  secret, configmap,      │
                          │  health, auth, admin     │
                          └────────────┬─────────────┘
                                       │
                  ┌────────────────────┼─────────────────────┐
                  ▼                    ▼                     ▼
        ┌──────────────────┐ ┌────────────────────┐ ┌──────────────────┐
        │   Orchestrator   │ │   Runner Manager   │ │      Store       │
        │ (controllers,    │ │  Docker / Process  │ │   BadgerDB +     │
        │  reconciler,     │ │      runners       │ │   per-resource   │
        │  probes, tasks)  │ │                    │ │   repos          │
        └──────────────────┘ └────────────────────┘ └──────────────────┘
```

Code map:

| Package                              | Responsibility                                                  |
| ------------------------------------ | --------------------------------------------------------------- |
| `pkg/api/server`                     | gRPC server, auth/RBAC interceptors, bootstrap.                 |
| `pkg/api/service`                    | RPC handlers — one per resource.                                |
| `pkg/api/rest`                       | REST gateway middleware (logging, CORS, recovery).              |
| `pkg/orchestrator/controllers`       | Reconcilers for service, instance, scaling, health.             |
| `pkg/orchestrator/probes`            | HTTP / TCP probes for health checks.                            |
| `pkg/runner/{docker,process}`        | The two runtime backends.                                       |
| `pkg/runner/manager`                 | Multiplexes between runners.                                    |
| `pkg/store`                          | Storage interface + Badger and in-memory implementations.       |
| `pkg/store/repos`                    | Per-resource repositories with validation.                      |
| `pkg/crypto`                         | AES-256-GCM AEAD + KEK loading for envelope encryption.         |
| `pkg/worker`                         | Async worker pool, queues, scheduler (used for deletion etc.).  |
| `pkg/cli`                            | The `rune` CLI (cobra commands).                                |

## How a `rune cast` flows through the system

1. **CLI** parses YAML, validates locally with `rune lint` rules, sends `CreateService` (or `UpdateService`) over gRPC.
2. **Auth interceptor** extracts the bearer token, looks it up in `TokenRepo`, attaches `AuthInfo` to the context.
3. **RBAC interceptor** evaluates the subject's policies against (resource=`service`, verb=`create`, namespace=`default`).
4. **Service handler** validates, then calls `serviceRepo.Create(...)` to persist desired state in BadgerDB.
5. **Service controller** sees the new resource (via watch), reconciles desired vs. actual: it computes how many instances should exist and emits instance creates.
6. **Instance controller** picks up new instances, calls into the **Runner Manager**, which dispatches to the Docker runner (or the process runner).
7. **Health controller** schedules probes; results update instance status; failures cascade into restarts.

Everything above the runner layer is namespace-scoped. The runner layer is namespace-agnostic — it just runs containers.

## State

`runed` keeps state in BadgerDB at `--data-dir`. Every resource is namespaced and addressable as `(type, namespace, id)`. The `store.Store` interface ([pkg/store/interface.go](https://github.com/runestack/rune/blob/master/pkg/store/interface.go)) is small enough that swapping the backend (in-memory for tests, Raft FSM for HA) is a known seam.

Secrets are encrypted at rest with envelope encryption:

- A 32-byte **KEK** (Key Encryption Key) is loaded from a file, env var, or generated and persisted with mode `0600`.
- Each secret value is encrypted with a per-secret **DEK** (Data Encryption Key) using AES-256-GCM with associated data binding `(namespace, name, version)`.
- The DEK is wrapped by the KEK and stored alongside the ciphertext.

## Reconcilers

Controllers run in a continuous loop ([pkg/orchestrator/controllers/reconciler.go](https://github.com/runestack/rune/blob/master/pkg/orchestrator/controllers/reconciler.go)). Each pass:

1. Lists desired state from the store.
2. Lists actual state from the runner manager.
3. Computes a diff.
4. Issues create/delete/update operations.
5. Records status back to the store.

This is the same pattern as Kubernetes' control loop. No magic.

## What's not here yet

- **Multi-node consensus.** Today there's exactly one `runed`. Raft + Badger FSM is the next major work (RUNE-025).
- **Cross-node scheduling.** Same reason.
- **Watch streams with ordered guarantees.** RUNE-027.
- **mTLS.** Server TLS works (file-based); client certs aren't wired (RUNE-028).

If those land, the diagram above grows a "consensus" box around the store and an "agent" running on each node. The shape stays the same.

## Further reading

- [Services](/concepts/services/) — the unit of deployment.
- [Instances](/concepts/instances/) — running copies of a service.
- [Identity & RBAC](/concepts/identity-rbac/) — auth in detail.
- [Running runed](/operations/runed/) — production layout.
