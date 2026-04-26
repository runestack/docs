---
title: API surface (gRPC + REST)
description: The full RPC surface of runed. Both gRPC and a REST gateway are exposed.
---

`runed` exposes its API over two transports:

- **gRPC** on `:7863` — the primary surface. Used by the CLI and ideal for automation.
- **REST** on `:7861` — auto-generated gateway over the same RPCs. Use when gRPC isn't an option.

Both paths share the same auth, RBAC, and validation interceptors.

## Authentication

Every request (except `AdminBootstrap`) requires a bearer token:

```
Authorization: Bearer <token>
```

In gRPC, set the metadata key `authorization`. In REST, send the header.

## Services

The server exposes one gRPC service per resource group, all under the `rune.api` package:

| gRPC service        | Resource          | REST base path             |
| ------------------- | ----------------- | -------------------------- |
| `NamespaceService`  | namespaces        | `/v1/namespaces`           |
| `ServiceService`    | services          | `/v1/namespaces/{ns}/services` |
| `InstanceService`   | instances         | `/v1/namespaces/{ns}/instances` |
| `LogService`        | logs (streaming)  | `/v1/namespaces/{ns}/logs`  |
| `ExecService`       | exec (streaming)  | `/v1/namespaces/{ns}/exec`  |
| `HealthService`     | health            | `/v1/namespaces/{ns}/health` |
| `SecretService`     | secrets           | `/v1/namespaces/{ns}/secrets` |
| `ConfigmapService`  | configmaps        | `/v1/namespaces/{ns}/configmaps` |
| `AuthService`       | tokens, whoami    | `/v1/auth`                 |
| `AdminService`      | bootstrap, users, policies, registries | `/v1/admin` |

Each service follows the standard CRUD pattern (`Get`, `List`, `Create`, `Update`, `Delete`) where applicable, plus streaming RPCs for logs, exec, and watch.

## Proto definitions

Source of truth: [`pkg/api/proto/`](https://github.com/runestack/rune/tree/master/pkg/api/proto) in the repo. Highlights:

- [`service.proto`](https://github.com/runestack/rune/blob/master/pkg/api/proto/service.proto)
- [`instance.proto`](https://github.com/runestack/rune/blob/master/pkg/api/proto/instance.proto)
- [`secret.proto`](https://github.com/runestack/rune/blob/master/pkg/api/proto/secret.proto)
- [`auth.proto`](https://github.com/runestack/rune/blob/master/pkg/api/proto/auth.proto)
- [`admin.proto`](https://github.com/runestack/rune/blob/master/pkg/api/proto/admin.proto)

Generated Go code lives in [`pkg/api/generated/`](https://github.com/runestack/rune/tree/master/pkg/api/generated).

## REST conventions

The REST gateway follows gRPC-Gateway conventions:

- `GET    /v1/.../{name}`        → `Get*`
- `GET    /v1/.../`              → `List*`
- `POST   /v1/.../`              → `Create*`
- `PUT    /v1/.../{name}`        → `Update*`
- `DELETE /v1/.../{name}`        → `Delete*`

Streaming RPCs are exposed as Server-Sent Events:

```
GET /v1/namespaces/default/logs/api?follow=true
```

## Error model

Standard gRPC status codes:

| Code                | When                                                |
| ------------------- | --------------------------------------------------- |
| `OK`                | Success.                                            |
| `Unauthenticated`   | Missing / invalid bearer token.                     |
| `PermissionDenied`  | Token valid, policy denies.                         |
| `NotFound`          | Resource doesn't exist.                             |
| `AlreadyExists`     | Conflicts with an existing resource.                |
| `InvalidArgument`   | Schema or validation error.                         |
| `FailedPrecondition`| State doesn't allow the operation (e.g., delete in use). |
| `Internal`          | Server-side error. Check `runed` logs.              |

REST maps these to HTTP status codes (401, 403, 404, 409, 400, 412, 500).

## Generating clients

For Go consumers, use the generated code:

```go
import "github.com/runestack/rune/pkg/api/generated"
import "google.golang.org/grpc"

conn, _ := grpc.Dial("runed.example.com:7863", grpc.WithTransportCredentials(...))
client := generated.NewServiceServiceClient(conn)
```

For other languages, run `protoc` against [`pkg/api/proto/`](https://github.com/runestack/rune/tree/master/pkg/api/proto) with your language's plugin.

## Roadmap

- **OpenAPI / Swagger spec** for the REST gateway — not generated today. Tracked.
- **Watch streams** with ordered, resumable cursors — RUNE-027.
- **mTLS** — RUNE-028.
