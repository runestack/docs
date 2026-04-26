---
title: What is Rune?
description: Rune is a lightweight, single-binary orchestration platform. Here's what it does, what it doesn't, and when to reach for it.
---

Rune is an orchestration platform — it takes declarative service definitions and keeps them running. It's inspired by Kubernetes and Nomad but trades surface area for simplicity. There are two binaries:

- **`runed`** — the server (control plane). Stores state in BadgerDB, runs the orchestrator and reconcilers, exposes a gRPC API and a REST gateway.
- **`rune`** — the CLI. Talks to `runed` over gRPC.

That's it. No etcd. No kubelet. No CRDs.

## What Rune does

- Runs Docker containers and native processes as **services** with a desired scale.
- Reconciles **instances** of those services to match the desired state.
- Streams **logs** and supports interactive **exec** into running services.
- Manages **secrets** (encrypted at rest) and **configmaps**.
- Enforces **health checks** (HTTP, TCP) and supports liveness probes.
- Models **dependencies** between services and waits for them on rollout.
- Authenticates clients with bearer tokens and authorizes them via policy-based **RBAC**.
- Packages multi-service applications as **runesets** (templated YAML bundles).

## What Rune doesn't (yet)

- **Multi-node clustering.** Single-node today. Raft-backed multi-node is in active development (Release 2).
- **Network policy enforcement / ingress controllers.** Schema accepts them; runtime enforcement is roadmap.
- **Persistent volume management.** No volume abstraction yet — bind mounts only.
- **Autoscaling.** Manual `rune scale` only; metric-driven autoscaling is roadmap.
- **Service mesh / mTLS between services.** Roadmap.

If you need any of those today, reach for Kubernetes or Nomad.

## When Rune is the right tool

- You're a small team running 5–50 services on 1–3 boxes and Kubernetes feels like a tax.
- You're building an internal platform and want a control plane you can actually read end-to-end.
- You have a mix of containers and bare-metal processes and don't want two systems.
- You want a self-hosted alternative to Heroku/Render that you can `ssh` into.

## When it isn't

- You need multi-region, thousands of nodes, or strict SLAs today.
- You depend on the Kubernetes ecosystem (operators, Helm charts, kubectl plugins).
- You need pluggable storage classes, CSI drivers, or sophisticated scheduling.

## How the pieces fit

```
┌─────────┐  gRPC + REST  ┌──────────────────────────────┐
│  rune   │ ────────────▶ │            runed              │
│  (CLI)  │               │                                │
└─────────┘               │  ┌─────────────────────────┐  │
                          │  │     Orchestrator        │  │
┌──────────┐  REST/gRPC   │  │  (controllers, probes)  │  │
│  app /   │ ───────────▶ │  └────────────┬────────────┘  │
│  CI/CD   │              │               ▼               │
└──────────┘              │   ┌──────────────────────┐    │
                          │   │   Runner manager     │    │
                          │   │   ┌────────┐ ┌────┐  │    │
                          │   │   │ Docker │ │Proc│  │    │
                          │   │   └────────┘ └────┘  │    │
                          │   └──────────────────────┘    │
                          │   ┌──────────────────────┐    │
                          │   │  BadgerDB state      │    │
                          │   │  (encrypted secrets) │    │
                          │   └──────────────────────┘    │
                          └────────────────────────────────┘
```

Read [Architecture](/concepts/architecture/) for the full picture, or jump straight to the [quick start](/start/quick-start/).
