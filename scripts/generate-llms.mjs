import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const docsRoot = process.cwd();
const contentRoot = path.join(docsRoot, 'src', 'content', 'docs');
const publicRoot = path.join(docsRoot, 'public');
const generatedDate = new Date().toISOString().slice(0, 10);

const orderedSections = [
  {
    slug: 'start',
    title: 'Start Here',
    summary: 'What Rune is, how to install it, and your first binary.',
  },
  {
    slug: 'concepts',
    title: 'Concepts',
    summary: 'Architecture, services, instances, namespaces, networking, runesets, secrets, configmaps, identity, and RBAC.',
  },
  {
    slug: 'guides',
    title: 'Guides',
    summary: 'Deploy services, use secrets & configmaps, scale, exec, health checks, dependencies, expose services, network policy, runesets, process runner, and cloud deployment guides.',
  },
  {
    slug: 'cli',
    title: 'CLI Reference',
    summary: 'Full CLI commands: cast, get, scale, restart/stop, logs, exec, delete, create, health, deps, lint, pack, login, admin, and misc utilities.',
  },
  {
    slug: 'reference',
    title: 'Reference',
    summary: 'Service spec, runefile (server config), networking CLI, API surface (gRPC + REST), and exit codes.',
  },
  {
    slug: 'operations',
    title: 'Operations',
    summary: 'Running runed, configuration, security hardening, and upgrades.',
  },
];

const sectionBySlug = new Map(orderedSections.map((section) => [section.slug, section]));

async function main() {
  const documents = await collectDocuments(contentRoot);
  const orderedDocuments = orderDocuments(documents);

  await mkdir(publicRoot, { recursive: true });
  await writeFile(path.join(publicRoot, 'llms.txt'), buildLlmsIndex(orderedDocuments));
  await writeFile(path.join(publicRoot, 'llms-full.md'), buildLlmsFull(orderedDocuments));

  process.stdout.write(`Generated ${orderedDocuments.length} docs into public/llms.txt and public/llms-full.md\n`);
}

async function collectDocuments(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const documents = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      documents.push(...await collectDocuments(fullPath));
      continue;
    }

    if (!entry.isFile() || !/\.(md|mdx)$/.test(entry.name)) {
      continue;
    }

    const relativePath = path.relative(contentRoot, fullPath).split(path.sep).join('/');
    if (relativePath === 'index.mdx') {
      continue;
    }

    const raw = await readFile(fullPath, 'utf8');
    const { frontmatter, body } = splitFrontmatter(raw);
    const cleanedBody = cleanupMarkdown(body);
    const title = extractTitle(frontmatter) ?? fallbackTitle(relativePath);
    const sectionSlug = relativePath.split('/')[0];

    documents.push({
      title,
      relativePath,
      sectionSlug,
      urlPath: toUrlPath(relativePath),
      body: cleanedBody.trim(),
    });
  }

  return documents;
}

function splitFrontmatter(source) {
  if (!source.startsWith('---\n')) {
    return { frontmatter: '', body: source };
  }

  const end = source.indexOf('\n---\n', 4);
  if (end === -1) {
    return { frontmatter: '', body: source };
  }

  return {
    frontmatter: source.slice(4, end),
    body: source.slice(end + 5),
  };
}

function extractTitle(frontmatter) {
  const match = frontmatter.match(/^title:\s*(.+)$/m);
  if (!match) {
    return null;
  }

  return match[1].trim().replace(/^['"]|['"]$/g, '');
}

function fallbackTitle(relativePath) {
  const base = relativePath.split('/').pop()?.replace(/\.(md|mdx)$/, '') ?? relativePath;
  return base
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function cleanupMarkdown(source) {
  const lines = source.split('\n');
  const cleaned = [];
  let inCodeFence = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      inCodeFence = !inCodeFence;
      cleaned.push(line);
      continue;
    }

    if (!inCodeFence) {
      // Strip Astro component imports
      if (trimmed.startsWith('import ')) {
        continue;
      }

      // Strip inline Astro/JSX tags
      if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
        continue;
      }

      // Collapse consecutive blank lines
      if (trimmed === '') {
        const previous = cleaned[cleaned.length - 1];
        if (previous === '') {
          continue;
        }
      }
    }

    cleaned.push(line);
  }

  return cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function toUrlPath(relativePath) {
  // Remove .md/.mdx extension; if the file is index.mdx, use the parent directory
  let urlPath = relativePath.replace(/\.(md|mdx)$/, '/');
  if (urlPath.endsWith('/index/')) {
    urlPath = urlPath.replace(/index\/$/, '');
  }
  return `/${urlPath}`;
}

function orderDocuments(documents) {
  return documents.sort((left, right) => {
    const leftSection = orderedSections.findIndex((section) => section.slug === left.sectionSlug);
    const rightSection = orderedSections.findIndex((section) => section.slug === right.sectionSlug);

    if (leftSection !== rightSection) {
      return leftSection - rightSection;
    }

    return left.relativePath.localeCompare(right.relativePath);
  });
}

function buildLlmsIndex(documents) {
  const lines = [
    '# Rune Docs for Language Models',
    '',
    'Rune is a lightweight, single-binary orchestration platform inspired by Kubernetes and Nomad. It deploys services as local containers or processes, manages networking, secrets, configmaps, and provides a CLI-driven UX.',
    '',
    `Generated: ${generatedDate}`,
    'Canonical docs site: https://docs.runestack.io/',
    'Canonical full corpus: https://docs.runestack.io/llms-full.md',
    '',
    'This file is a compact index. Use it to discover the relevant canonical pages before loading the full corpus.',
    '',
    '## Sections',
    '',
  ];

  for (const section of orderedSections) {
    const sectionDocs = documents.filter((document) => document.sectionSlug === section.slug);
    if (sectionDocs.length === 0) {
      continue;
    }

    lines.push(`### ${section.title}`);
    lines.push(section.summary);
    lines.push('');
    for (const document of sectionDocs) {
      lines.push(`- ${document.title}: https://docs.runestack.io${document.urlPath}`);
    }
    lines.push('');
  }

  lines.push('## Consumption Notes');
  lines.push('');
  lines.push('- Prefer the canonical section page when answering a narrow question.');
  lines.push('- Use llms-full.md when you need cross-section context in one file.');
  lines.push('- Treat codebase behavior as authoritative when docs and implementation differ.');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function buildLlmsFull(documents) {
  const lines = [
    '# Rune Documentation for Agents',
    '',
    'This is a generated concatenation of the canonical Rune docs. Prefer the source pages for narrow citations; use this file when an agent benefits from a single loadable corpus.',
    '',
    `Generated: ${generatedDate}`,
    'Canonical docs site: https://docs.runestack.io/',
    '',
    '## Table of Contents',
    '',
  ];

  for (const section of orderedSections) {
    const sectionDocs = documents.filter((document) => document.sectionSlug === section.slug);
    if (sectionDocs.length === 0) {
      continue;
    }

    lines.push(`- ${section.title}`);
    for (const document of sectionDocs) {
      lines.push(`  - ${document.title} (${document.urlPath})`);
    }
  }

  for (const section of orderedSections) {
    const sectionDocs = documents.filter((document) => document.sectionSlug === section.slug);
    if (sectionDocs.length === 0) {
      continue;
    }

    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push(`# ${section.title}`);
    lines.push('');
    lines.push(section.summary);

    for (const document of sectionDocs) {
      lines.push('');
      lines.push('---');
      lines.push('');
      lines.push(`## ${document.title}`);
      lines.push('');
      lines.push(`Source path: src/content/docs/${document.relativePath}`);
      lines.push(`Canonical URL: https://docs.runestack.io${document.urlPath}`);
      lines.push('');
      lines.push(document.body);
    }
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
