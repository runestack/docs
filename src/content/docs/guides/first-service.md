---
title: Deploy your first service
description: A complete walkthrough — write a service spec, apply it, verify, scale, and clean up.
---

This is the [quick start](/start/quick-start/) with more meat on the bones. We'll deploy a real `nginx` service with health checks, an exposed port, and an environment variable.

## 1. Write the spec

`nginx.yaml`:

```yaml
service:
  name: web
  namespace: default
  image: nginx:alpine
  scale: 2

  ports:
    - name: http
      port: 80

  env:
    NGINX_HOST: localhost

  resources:
    cpu:
      request: 100m
      limit: 500m
    memory:
      request: 64Mi
      limit: 256Mi

  health:
    liveness:
      type: http
      path: /
      port: 80
      initialDelaySeconds: 5
      intervalSeconds: 10
      timeoutSeconds: 2
      failureThreshold: 3
```

## 2. Lint before you cast

```sh
rune lint nginx.yaml
```

`rune lint` validates the schema and checks for common mistakes (typos in fields, invalid resource quantities, undefined references). Fix anything it flags before applying.

## 3. Apply

```sh
rune cast nginx.yaml
```

Output:

```
Service 'web' created in namespace 'default'.
Generation: 1
Waiting for rollout...
  ✓ web-instance-a4f9d2 Running
  ✓ web-instance-b7e3c1 Running
Rollout complete.
```

The CLI streams reconciliation progress until all instances are ready. Pass `--detach` to return immediately.

## 4. Verify

```sh
rune get services
rune get instances -n default
rune health web --checks
rune logs web --tail=20
```

`rune health` shows liveness probe results — useful when something looks wrong.

## 5. Iterate

Change `scale: 2` to `scale: 4`, then re-cast:

```sh
rune cast nginx.yaml
```

The reconciler computes the diff, increments the generation, and rolls in two new instances.

For a quick scale-only operation, skip the YAML edit:

```sh
rune scale web 4
```

## 6. Inspect a single instance

```sh
rune get instances
rune get instance web-instance-a4f9d2 -o yaml
```

You'll see status conditions, restart count, started-at, and the runner-specific details.

## 7. Exec in for debugging

```sh
rune exec web sh
# or against a specific instance:
rune exec web-instance-a4f9d2 ls /etc/nginx
```

## 8. Tear down

```sh
rune delete web
```

Or stop without deleting (keeps spec, drops to 0 instances):

```sh
rune stop web
rune scale web 2   # bring it back later
```

## What you've used so far

| Command       | What it did                              |
| ------------- | ---------------------------------------- |
| `rune lint`   | Validated YAML.                          |
| `rune cast`   | Applied the spec.                        |
| `rune get`    | Read service and instance state.         |
| `rune health` | Inspected liveness probes.               |
| `rune logs`   | Tailed container output.                 |
| `rune scale`  | Changed desired replica count.           |
| `rune exec`   | Ran a shell inside an instance.          |
| `rune delete` | Removed the service.                     |

## Where next

- [Use secrets & configmaps](/guides/secrets-configmaps/) — same nginx, but with real config.
- [Health checks](/guides/health/) — designing probes that don't lie.
- [Scale & restart](/guides/scale-restart/) — gradual rollouts.
