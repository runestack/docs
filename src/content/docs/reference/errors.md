---
title: Exit codes & errors
description: What CLI exit codes mean, what gRPC status codes you'll see, and how to debug each.
---

## CLI exit codes

| Code | Meaning                                                            |
| ---- | ------------------------------------------------------------------ |
| `0`  | Success.                                                           |
| `1`  | Generic failure (network, parse, validation).                      |
| `2`  | Usage error — bad flag, missing argument.                          |
| `3`  | Auth failure — `Unauthenticated` or `PermissionDenied`.            |
| `4`  | Resource not found.                                                |
| `5`  | Conflict / already exists.                                         |
| `6`  | Validation error.                                                  |
| `7`  | Timeout (rollout, scale, etc.).                                    |
| `124`| Inner-process timeout (passed through from `exec`).                |

Scripts should branch on exit code — not on stderr text.

## gRPC status codes

The CLI surfaces these directly:

| Code                | When                                                            | Common fix                                  |
| ------------------- | --------------------------------------------------------------- | ------------------------------------------- |
| `Unauthenticated`   | No token, expired token, or revoked token.                      | `rune login` again.                         |
| `PermissionDenied`  | Token is valid but the policy doesn't allow this verb/resource. | Check `rune whoami` policies; ask admin.    |
| `NotFound`          | Resource missing.                                               | `rune get` to confirm.                      |
| `AlreadyExists`     | Trying to create something that already exists.                 | Use `cast` (idempotent) instead of `create`. |
| `InvalidArgument`   | Schema/validation rejected by the server.                        | `rune lint` locally first.                  |
| `FailedPrecondition`| State doesn't allow this op (e.g., delete in use).              | Resolve dependents first.                   |
| `DeadlineExceeded`  | Request timed out.                                              | Increase `--timeout`, check server load.    |
| `Internal`          | Server-side bug or runtime error.                               | Check `runed` logs.                         |
| `Unavailable`       | Server unreachable.                                             | Network / process / firewall.               |

## Common error messages and fixes

### `failed to connect to API server`

The server isn't reachable. Check:

```sh
sudo systemctl status runed
sudo journalctl -u runed -n 50 --no-pager
nc -zv <host> 7863
```

If TLS is enabled, make sure the client context has the right CA / cert / key.

### `missing bearer token`

Your context has no token. Re-run `rune login` or set `--token` / `--token-file` for a one-off.

### `invalid bearer token`

The token is wrong, expired, or revoked. `rune admin token list` to verify.

### `access denied for resource: X verb: Y`

RBAC. Your subject's policies don't allow `Y` on `X`. Either:

- Use a different context with broader policies, or
- Get an admin to attach a policy. See [Identity & RBAC](/concepts/identity-rbac/).

### `validation error: <field>: ...`

The spec failed validation. Fix the field. `rune lint` would have caught this locally.

### `service ... has dependents`

Something depends on the resource you're deleting. List dependents:

```sh
rune deps dependents <name>
```

Force if you really mean it:

```sh
rune delete <name> --force
```

### `failed to pull image: ...`

The Docker runner couldn't pull. Either:

- Image doesn't exist (typo).
- Registry is private — add credentials with `rune admin registries add`.
- Network can't reach the registry from the host.

### `failed to start process: exec: "...": file does not exist`

Process runner can't find the binary. The path in `process.command` must exist on the host.

## Where to look for more

- `runed` logs: `journalctl -u runed -n 200 --no-pager`.
- Set `--log-level=debug` on the CLI for verbose RPC traces.
- Set `--debug` on `runed` for full server traces.
- Each RPC error includes a server-side request ID — search for it in the logs.
