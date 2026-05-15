// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// Deployed at https://runestack.github.io/docs/
// Override with env vars if moving to a custom domain:
//   SITE_URL=https://docs.runehq.io SITE_BASE=/
const SITE = process.env.SITE_URL || 'https://docs.runestack.io';
const BASE = process.env.SITE_BASE || '/';

export default defineConfig({
  site: SITE,
  base: BASE,
  integrations: [
    starlight({
      title: 'Rune',
      description:
        'A lightweight, single-binary orchestration platform inspired by Kubernetes and Nomad.',
      logo: { light: './src/assets/logo-light.svg', dark: './src/assets/logo-dark.svg', replacesTitle: true },
      customCss: ['./src/styles/custom.css'],
      components: {
        Pagination: './src/components/Pagination.astro',
        Sidebar: './src/components/Sidebar.astro',
      },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/runestack/rune' },
      ],
      editLink: {
        baseUrl: 'https://github.com/runestack/rune-docs/edit/main/',
      },
      lastUpdated: true,
      pagination: true,
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 4 },
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'What is Rune?', slug: 'start/what-is-rune' },
            { label: 'Quick start', slug: 'start/quick-start' },
            { label: 'Installation', slug: 'start/installation' },
            { label: 'Bootstrap & first user', slug: 'start/bootstrap' },
          ],
        },
        {
          label: 'Concepts',
          items: [
            { label: 'Architecture', slug: 'concepts/architecture' },
            { label: 'Services', slug: 'concepts/services' },
            { label: 'Instances', slug: 'concepts/instances' },
            { label: 'Namespaces', slug: 'concepts/namespaces' },
            { label: 'Networking', slug: 'concepts/networking' },
            { label: 'Runesets', slug: 'concepts/runesets' },
            { label: 'Secrets & ConfigMaps', slug: 'concepts/secrets-configmaps' },
            { label: 'Storage', slug: 'concepts/storage' },
            { label: 'Identity & RBAC', slug: 'concepts/identity-rbac' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Deploy your first service', slug: 'guides/first-service' },
            { label: 'Use secrets & configmaps', slug: 'guides/secrets-configmaps' },
            { label: 'Persistent storage', slug: 'guides/persistent-storage' },
            { label: 'Init steps', slug: 'guides/init-steps' },
            { label: 'Scale & restart', slug: 'guides/scale-restart' },
            { label: 'Logs & exec', slug: 'guides/logs-exec' },
            { label: 'Health checks', slug: 'guides/health' },
            { label: 'Service dependencies', slug: 'guides/dependencies' },
            { label: 'Expose a service (HTTPS + ACME)', slug: 'guides/expose-service' },
            { label: 'Network policy', slug: 'guides/network-policy' },
            { label: 'Package a runeset', slug: 'guides/runesets' },
            { label: 'Process runner', slug: 'guides/process-runner' },
            { label: 'Pull from GHCR (private images)', slug: 'guides/ghcr-auth' },
            { label: 'Deploy from GitHub Actions', slug: 'guides/ci-deployments' },
            { label: 'Deploy on AWS EC2 (Terraform)', slug: 'guides/terraform-ec2' },
            { label: 'Deploy on a DigitalOcean droplet', slug: 'guides/digital-ocean-deploy' },
            { label: 'Provision DigitalOcean (Terraform module)', slug: 'guides/terraform-digitalocean' },
          ],
        },
        {
          label: 'CLI reference',
          items: [
            { label: 'Overview', slug: 'cli/overview' },
            { label: 'rune cast', slug: 'cli/cast' },
            { label: 'rune get', slug: 'cli/get' },
            { label: 'rune scale', slug: 'cli/scale' },
            { label: 'rune restart / stop', slug: 'cli/restart-stop' },
            { label: 'rune logs', slug: 'cli/logs' },
            { label: 'rune exec', slug: 'cli/exec' },
            { label: 'rune port-forward', slug: 'cli/port-forward' },
            { label: 'rune delete', slug: 'cli/delete' },
            { label: 'rune create', slug: 'cli/create' },
            { label: 'rune storageclass', slug: 'cli/storageclass' },
            { label: 'rune volume', slug: 'cli/volume' },
            { label: 'rune snapshot', slug: 'cli/snapshot' },
            { label: 'rune health', slug: 'cli/health' },
            { label: 'rune deps', slug: 'cli/deps' },
            { label: 'rune lint', slug: 'cli/lint' },
            { label: 'rune pack', slug: 'cli/pack' },
            { label: 'rune login / context', slug: 'cli/login-config' },
            { label: 'rune admin', slug: 'cli/admin' },
            { label: 'rune whoami / status / version', slug: 'cli/misc' },
          ],
        },
        {
          label: 'RefeStorage resources', slug: 'reference/storage-resources' },
            { label: 'rence',
          items: [
            { label: 'Service spec', slug: 'reference/service-spec' },
            { label: 'Runefile (server config)', slug: 'reference/runefile' },
            { label: 'Networking CLI', slug: 'reference/cli-network' },
            { label: 'API surface (gRPC + REST)', slug: 'reference/api' },
            { label: 'Exit codes & errors', slug: 'reference/errors' },
          ],
        },
        {
          label: 'Operations',
          items: [
            { label: 'Running runed', slug: 'operations/runed' },
            { label: 'Configuration', slug: 'operations/configuration' },
            { label: 'Security hardening', slug: 'operations/security' },
            { label: 'Upgrades', slug: 'operations/upgrades' },
          ],
        },
      ],
    }),
  ],
});
