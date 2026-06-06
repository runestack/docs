/* ============================================================
   RUNE — landing interactions
   ============================================================ */
(function () {
  "use strict";

  /* ---------- copy buttons ---------- */
  document.querySelectorAll(".copy[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var text = btn.getAttribute("data-copy");
      try { navigator.clipboard.writeText(text); } catch (e) {}
      btn.classList.add("done");
      var svg = btn.innerHTML;
      btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
      setTimeout(function () { btn.classList.remove("done"); btn.innerHTML = svg; }, 1300);
    });
  });

  /* ---------- CLI tabs ---------- */
  var tabs = document.getElementById("cli-tabs");
  var well = document.getElementById("cli-well");
  if (tabs && well) {
    tabs.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-pane]");
      if (!b) return;
      var pane = b.getAttribute("data-pane");
      tabs.querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x === b); });
      well.querySelectorAll(".pane").forEach(function (p) { p.classList.toggle("on", p.getAttribute("data-pane") === pane); });
    });
  }

  /* ---------- API three-pane: endpoint hover/select (cosmetic) ---------- */
  document.querySelectorAll(".tp-ep").forEach(function (ep) {
    ep.addEventListener("click", function () {
      document.querySelectorAll(".tp-ep").forEach(function (x) { x.classList.remove("on"); });
      ep.classList.add("on");
    });
  });
  document.querySelectorAll(".tp-right .rq-bar span").forEach(function (s) {
    s.addEventListener("click", function () {
      s.parentNode.querySelectorAll("span").forEach(function (x) { x.classList.remove("on"); });
      s.classList.add("on");
    });
  });

  /* ---------- hero terminal typing ---------- */
  var termBody = document.getElementById("term-body");
  var SCRIPT = [
    { t: "cmd",  s: "$ rune cast -f service.rune", d: 34 },
    { t: "out",  s: "✓ parsed service.rune · 1 service", c: "ok" },
    { t: "out",  s: "✓ pushed ghcr.io/acme/api-core:1.4.0", c: "ok" },
    { t: "out",  s: "→ rolling out api-core  production", c: "arrw" },
    { t: "out",  s: "  ✓ api-core-7fk2d  ready", c: "ok" },
    { t: "out",  s: "  ✓ api-core-9xb1c  ready", c: "ok" },
    { t: "out",  s: "  ✓ api-core-2mn8p  ready", c: "ok" },
    { t: "out",  s: "✓ cast to production at v4  ·  3/3 ready", c: "ok" },
    { t: "gap" },
    { t: "cmd",  s: "$ rune get services", d: 34 },
    { t: "raw",  s: "NAME          READY  STATUS    AGE", c: "dim" },
    { t: "svc",  s: "web-gateway   3/3    running   14d" },
    { t: "svc",  s: "api-core      4/4    running   6d" },
    { t: "svc",  s: "worker-queue  5/5    running   2d" },
    { t: "prompt" }
  ];

  function esc(str) { return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  function renderSvc(line) {
    // colorize "running" green
    return esc(line).replace("running", '<span class="ok">running</span>');
  }

  function runTerminal() {
    if (!termBody) return;
    termBody.innerHTML = "";
    var i = 0;
    function step() {
      if (i >= SCRIPT.length) return;
      var item = SCRIPT[i];
      var line = document.createElement("div");
      line.className = "tl";
      if (item.t === "gap") {
        line.innerHTML = "&nbsp;";
        termBody.appendChild(line);
        i++; setTimeout(step, 120); return;
      }
      if (item.t === "prompt") {
        line.innerHTML = '<span class="pr">$</span> <span class="cursor"></span>';
        termBody.appendChild(line);
        return; // done
      }
      if (item.t === "cmd") {
        // typewriter the command
        termBody.appendChild(line);
        var full = item.s, pos = 0;
        (function type() {
          pos++;
          var shown = full.slice(0, pos);
          shown = shown.replace(/^\$/, '<span class="pr">$</span>');
          line.innerHTML = '<span class="cm">' + shown + '</span><span class="cursor"></span>';
          if (pos < full.length) { setTimeout(type, item.d || 32); }
          else { line.innerHTML = '<span class="cm">' + full.replace(/^\$/, '<span class="pr">$</span>') + '</span>'; i++; setTimeout(step, 260); }
        })();
        return;
      }
      // output-ish lines
      var cls = item.c || "out";
      if (item.t === "svc") line.innerHTML = renderSvc(item.s);
      else line.innerHTML = '<span class="' + cls + '">' + esc(item.s) + '</span>';
      termBody.appendChild(line);
      i++;
      setTimeout(step, item.t === "out" ? 150 : 90);
    }
    step();
  }

  // start terminal when visible (or after small delay)
  var started = false;
  function maybeStart() {
    if (started) return;
    var term = document.getElementById("hero-term");
    if (!term) return;
    var r = term.getBoundingClientRect();
    if (r.top < window.innerHeight && r.bottom > 0) { started = true; runTerminal(); }
  }
  window.addEventListener("scroll", maybeStart, { passive: true });
  setTimeout(maybeStart, 400);

  /* ---------- scroll reveal ---------- */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
  }, { threshold: 0.12 });
  document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });

  /* ---------- ⌘K command palette ---------- */
  var DOCS = [
    { g: "Start", n: "What is Rune?", u: "/start/what-is-rune", s: "start" },
    { g: "Start", n: "Installation", u: "/start/installation", s: "start" },
    { g: "Start", n: "Quick start", u: "/start/quick-start", s: "start" },
    { g: "Start", n: "Bootstrap & first user", u: "/start/bootstrap", s: "start" },
    { g: "Concepts", n: "Architecture", u: "/concepts/architecture", s: "concept" },
    { g: "Concepts", n: "Services", u: "/concepts/services", s: "concept" },
    { g: "Concepts", n: "Instances", u: "/concepts/instances", s: "concept" },
    { g: "Concepts", n: "Namespaces", u: "/concepts/namespaces", s: "concept" },
    { g: "Concepts", n: "Networking", u: "/concepts/networking", s: "concept" },
    { g: "Concepts", n: "Runesets", u: "/concepts/runesets", s: "concept" },
    { g: "Concepts", n: "Secrets & ConfigMaps", u: "/concepts/secrets-configmaps", s: "concept" },
    { g: "Concepts", n: "Storage", u: "/concepts/storage", s: "concept" },
    { g: "Concepts", n: "Identity & RBAC", u: "/concepts/identity-rbac", s: "concept" },
    { g: "CLI", n: "rune cast", u: "/cli/cast", s: "cli" },
    { g: "CLI", n: "rune get", u: "/cli/get", s: "cli" },
    { g: "CLI", n: "rune scale", u: "/cli/scale", s: "cli" },
    { g: "CLI", n: "rune logs", u: "/cli/logs", s: "cli" },
    { g: "CLI", n: "rune exec", u: "/cli/exec", s: "cli" },
    { g: "CLI", n: "rune create", u: "/cli/create", s: "cli" },
    { g: "Reference", n: "Service spec", u: "/reference/service-spec", s: "ref" },
    { g: "Reference", n: "API surface (gRPC + REST)", u: "/reference/api", s: "ref" },
    { g: "Reference", n: "Runefile", u: "/reference/runefile", s: "ref" },
    { g: "Guides", n: "Deploy your first service", u: "/guides/first-service", s: "guide" },
    { g: "Guides", n: "Use secrets & configmaps", u: "/guides/secrets-configmaps", s: "guide" },
    { g: "Guides", n: "Network policy", u: "/guides/network-policy", s: "guide" },
    { g: "Operations", n: "Security hardening", u: "/operations/security", s: "op" }
  ];

  var scrim = document.getElementById("cmdk-scrim");
  var modal = document.getElementById("cmdk");
  var input = document.getElementById("cmdk-input");
  var list = document.getElementById("cmdk-list");
  var sel = 0, filtered = [];

  function openK() { scrim.classList.add("open"); modal.classList.add("open"); input.value = ""; renderK(""); setTimeout(function () { input.focus(); }, 30); }
  function closeK() { scrim.classList.remove("open"); modal.classList.remove("open"); }
  function isOpen() { return modal.classList.contains("open"); }

  function renderK(q) {
    q = q.trim().toLowerCase();
    filtered = DOCS.filter(function (d) { return !q || d.n.toLowerCase().indexOf(q) >= 0 || d.g.toLowerCase().indexOf(q) >= 0; });
    sel = 0;
    if (!filtered.length) { list.innerHTML = '<div class="cmdk-empty">No matches for “' + q + '”</div>'; return; }
    var html = "", lastG = null;
    filtered.forEach(function (d, idx) {
      if (d.g !== lastG) { html += '<div class="cmdk-grp">' + d.g + "</div>"; lastG = d.g; }
      html += '<div class="cmdk-item' + (idx === 0 ? " sel" : "") + '" data-idx="' + idx + '">' +
        '<svg class="ci-ico" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6v18h12V7zM14 3v4h4"/></svg>' +
        '<span class="ci-name">' + d.n + "</span><span class=\"ci-sub\">↵</span></div>";
    });
    list.innerHTML = html;
  }

  function moveSel(dir) {
    var items = list.querySelectorAll(".cmdk-item");
    if (!items.length) return;
    items[sel] && items[sel].classList.remove("sel");
    sel = (sel + dir + items.length) % items.length;
    items[sel].classList.add("sel");
    items[sel].scrollIntoView({ block: "nearest" });
  }
  function go() { if (filtered[sel]) window.location.href = filtered[sel].u; }

  if (input) {
    input.addEventListener("input", function () { renderK(input.value); });
    list.addEventListener("click", function (e) {
      var it = e.target.closest(".cmdk-item");
      if (it) { sel = parseInt(it.getAttribute("data-idx"), 10); go(); closeK(); }
    });
  }
  var kbtn = document.getElementById("kbtn");
  if (kbtn) kbtn.addEventListener("click", openK);
  if (scrim) scrim.addEventListener("click", closeK);

  document.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); isOpen() ? closeK() : openK(); return; }
    if (!isOpen()) return;
    if (e.key === "Escape") { closeK(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); moveSel(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); moveSel(-1); }
    else if (e.key === "Enter") { e.preventDefault(); go(); closeK(); }
  });
})();
