---
title: "Part 5 — Deploy & verify"
description: First end-to-end deploy, DNS cutover, smoke tests, and the commands you'll run when something breaks.
---

Everything's wired. This part is the dress rehearsal: push, watch, verify, and learn the commands you'll lean on when something goes sideways.

## 1. Point DNS at the Reserved IP

From [part 2](/tutorial/terraform/) you have a Reserved IP. At your DNS provider, add the A records you used in `values/<env>.yaml`:

```
dev.example.com.    IN  A   134.209.xx.xx
example.com.        IN  A   134.209.xx.xx     # if values/prod.yaml uses the apex
```

Verify before pushing — ACME's HTTP-01 challenge fails fast when DNS isn't ready:

```sh
dig +short dev.example.com
# → 134.209.xx.xx
```

## 2. Trigger the deploy

If you've followed [part 4](/tutorial/ci-cd/), every push to `main` deploys automatically. To kick off the first run without a code change:

```sh
git commit --allow-empty -m "ci: trigger first deploy"
git push origin main
```

Watch it live:

```sh
gh run watch
```

Or open the Actions tab in GitHub.

## 3. Verify on the server

While CI is casting, on your laptop:

```sh
rune get services -n dev
# NAME   NAMESPACE  GEN  DESIRED  READY  AGE
# web    dev        1    1        1      45s

rune get instances -n dev
rune health web -n dev --checks
rune logs web -n dev --tail 50 --follow
```

The first cast pulls the image from GHCR — first pull on a fresh droplet can take 30-60s depending on image size. Subsequent rollouts are seconds.

## 4. Confirm TLS

If you used `tls.mode: auto`, watch the certificate get issued:

```sh
rune get ingresses -n dev
# NAME   HOST              TLS    STATUS    READY  AGE
# web    dev.example.com   auto   Issued    true   90s
```

Then hit the URL:

```sh
curl -sI https://dev.example.com
# HTTP/2 200
# server: Caddy
```

If `STATUS` stays `Pending` for more than ~5 minutes, see [Expose a service → Troubleshooting](/guides/expose-service/) — usually it's a DNS record that hasn't propagated.

## 5. Iterate

A typical change loop now looks like this:

```sh
# make a code change in apps/web/
git add apps/web/
git commit -m "web: tweak homepage"
git push
```

CI rebuilds + redeploys `web` only (because `apps/web/**` is the path glob in `deploy-config.yml`). The runner streams the rollout in the cast job; on your laptop:

```sh
rune get instances -n dev -w
# Watch instances cycle: old Terminating, new Running.
```

`rune cast` is idempotent — no diff, no work. Re-running it with the same inputs is a safe no-op.

## 6. The eight commands you'll actually use

Bookmark these. They cover ~95% of day-to-day operation:

| Command | Use case |
|---------|----------|
| `rune cast <file> -n <env>` | Apply a service / configmap / secret. |
| `rune get services -n <env>` | List services + readiness. |
| `rune get instances -n <env>` | The actual containers running. |
| `rune logs <svc> -n <env> -f` | Tail logs across all instances. |
| `rune exec <svc> -n <env> sh` | Open a shell inside an instance. |
| `rune restart <svc> -n <env>` | Roll instances (e.g. after secret update). |
| `rune scale <svc> N -n <env>` | Quick scale without re-casting. |
| `rune health <svc> -n <env> --checks` | Why is a probe failing? |

For everything else, [CLI overview](/cli/overview/).

## 7. When CI is broken but you need to deploy

You can always cast manually from your laptop using the admin token from [part 2](/tutorial/terraform/):

```sh
rune login myapp-dev --server $(terraform -chdir=infra/terraform/do output -raw grpc_endpoint) \
  --token-file infra/terraform/do/rune-admin.token \
  --default-namespace dev

# Same templating CI does, just run locally:
rune cast infra/runeset/casts/web.yaml \
  --values infra/runeset/values/dev.yaml \
  --set app.tag=sha-$(git rev-parse --short HEAD) \
  -n dev
```

## 8. When things break — first three places to look

1. **`rune logs <svc> -n <env> --tail 200`** — app-level errors. 80% of issues stop here.
2. **`rune get instances -n <env>` + `rune get instance <id> -o yaml`** — restart count, last termination reason, image pull errors.
3. **`ssh root@$RESERVED_IP 'journalctl -u runed -n 200 --no-pager'`** — server-level issues (registry auth, ACME, networking). The [runed operations doc](/operations/runed/) lists log markers.

For specific failure modes, the [Errors reference](/reference/errors/) maps exit codes and error messages to their fix.

## 9. Tear down (when you're done playing)

```sh
# Drop everything in the namespace
rune delete services --all -n dev

# Or destroy the droplet entirely (the Reserved IP and volume survive
# unless you remove the `prevent_destroy` lifecycle blocks first)
cd infra/terraform/do
terraform destroy
```

## What's next

You now have a working pipeline. Pick what to harden next based on where the project is heading:

- **More than one service:** add another entry to `deploy-config.yml` + another `casts/<name>.yaml`. The detect/build/cast matrix scales without workflow changes.
- **Production environment:** repeat parts 2 & 4 with `environment = "prod"`, a separate droplet, and a per-env GitHub Environment.
- **Persistent storage / databases:** [Persistent storage](/guides/persistent-storage/) + [Storage resources](/reference/storage-resources/).
- **Stricter networking:** [Network policy](/guides/network-policy/).
- **Multi-replica scaling and rollouts:** [Scale & restart](/guides/scale-restart/) and [Health checks](/guides/health/).
- **Service-to-service dependencies / init steps:** [Dependencies](/guides/dependencies/) and [Init steps](/guides/init-steps/).

If you want to know how `runed` works under the covers, start with [Concepts → Architecture](/concepts/architecture/).

---

**Back:** [Part 4 — CI/CD](/tutorial/ci-cd/) · **Up:** [Tutorial overview](/tutorial/overview/)
