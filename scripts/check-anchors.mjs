// Fails when an internal link points at a page or #anchor that does not exist
// in the built site. Run after `markline export` (default dir: out).
//
//   node scripts/check-anchors.mjs [dir]
//
// Only h2/h3 headings with plain text get an id on this site; h4s and
// headings that are only inline code do not, so links to them break silently.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, posix } from "node:path";

const root = process.argv[2] ?? "out";

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (name.endsWith(".html")) yield p;
  }
}

// "/cli/cast" for out/cli/cast.html and out/cli/cast/index.html; "/" for index.html.
function route(file) {
  let r = "/" + relative(root, file).split("\\").join("/").replace(/\.html$/, "");
  r = r.replace(/\/index$/, "");
  return r === "" ? "/" : r;
}

const pages = new Map(); // route -> { ids:Set, links:string[] }
for (const file of walk(root)) {
  const html = readFileSync(file, "utf8");
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const links = [...html.matchAll(/<a\s[^>]*?href="([^"]+)"/g)].map((m) => m[1]);
  pages.set(route(file), { ids, links });
}

const errors = [];
for (const [from, { links }] of pages) {
  for (const raw of links) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("//")) continue; // external, mailto:
    const href = raw.replaceAll("&amp;", "&");
    const [pathPart, hash] = href.split("#");
    let target = from;
    if (pathPart) {
      target = pathPart.startsWith("/") ? pathPart : posix.join(posix.dirname(from + "/x"), pathPart);
      target = posix.normalize(target.split("?")[0]).replace(/\/$/, "") || "/";
    }
    if (/\.[a-z0-9]+$/i.test(target)) continue; // assets (.svg, .jpg, .txt, ...)
    const page = pages.get(target);
    if (!page) {
      if (pathPart) errors.push(`${from}: link to missing page ${raw}`);
      continue;
    }
    if (hash && !page.ids.has(decodeURIComponent(hash))) {
      errors.push(`${from}: no id "${hash}" on ${target} (${raw})`);
    }
  }
}

if (errors.length) {
  console.error(`${errors.length} broken internal link(s):`);
  for (const e of [...new Set(errors)].sort()) console.error("  " + e);
  console.error(
    '\nA heading only gets an id when it is an h2/h3 made of plain text. For an h4, or a heading ' +
      'with `code` or **bold** in it, put <span id="your-id"></span> on its own line just above it, ' +
      "or fix the link."
  );
  process.exit(1);
}
console.log(`check-anchors: ${pages.size} pages, all internal links resolve`);
