// Three-layer self-containment gates for the vendored SVAR React Gantt
// artifacts (Phase 4 plan §1.1). Runs in the §12 pre-PR gate and on any
// vendor change:
//
//   Layer 1 — forbidden-origin scan: no SVAR/CDN/font-host origin may
//             appear anywhere in the generated artifacts.
//   Layer 2 — network-capability scan: every occurrence of a token that
//             could reach the network must be classified in the committed
//             allowlist below (empirically derived, code-reviewed);
//             anything unclassified fails the gate.
//   Layer 3 — supply-chain integrity: artifact hashes match the vendor
//             manifest; banners present; export surface exact; the root
//             package files contain no @svar-ui entry; the tarball
//             archive is complete and hash-clean; the license inventory
//             covers every archived tarball.
//
// (The runtime network-interception assertion — plan §13.0d — is a
// separate, browser-level test; static scanning is not a substitute.)

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PIPELINE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(PIPELINE_DIR, "../../..");
const VENDOR_DIR = path.join(REPO_ROOT, "src/components/scheduler/vendor/svar-gantt");
const MANIFEST_PATH = path.join(PIPELINE_DIR, "vendor-manifest.json");

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const count = (haystack, needle) => haystack.split(needle).length - 1;

const failures = [];
const fail = (msg) => failures.push(msg);
const check = (ok, msg) => (ok ? null : fail(msg));

const js = readFileSync(path.join(VENDOR_DIR, "svar-gantt.es.js"), "utf8");
const css = readFileSync(path.join(VENDOR_DIR, "svar-gantt.es.css"), "utf8");

// ── Layer 1: forbidden origins ─────────────────────────────────────────
const FORBIDDEN_ORIGINS = [
  "svar.dev", // covers cdn.svar.dev
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "unpkg.com",
  "jsdelivr.net",
  "esm.sh",
  "gpteng.co",
  "lovable.dev",
];
for (const origin of FORBIDDEN_ORIGINS) {
  check(count(js, origin) === 0, `L1: "${origin}" found in svar-gantt.es.js`);
  check(count(css, origin) === 0, `L1: "${origin}" found in svar-gantt.es.css`);
}

// ── Layer 2: network-capability scan with classified allowlist ────────
// Tokens that must be entirely absent from the generated JS:
const ZERO_TOKENS = [
  "importScripts",
  "new Worker",
  "SharedWorker",
  "XMLHttpRequest",
  "WebSocket(",
  "new EventSource",
  "fetch(",
  "sendBeacon",
  'createElement("script")',
  'createElement("link")',
];
for (const tok of ZERO_TOKENS) {
  const n = count(js, tok);
  check(n === 0, `L2: forbidden capability token "${tok}" appears ${n}× in svar-gantt.es.js`);
}

// Classified inert occurrences (exact counts pinned at acquisition;
// re-derive and re-review on any version bump):
const INERT_ALLOWLIST = [
  {
    token: "https://",
    expected: 1,
    classification: "date-fns documentation URL inside an error-message string (inert)",
    validate: (idx) =>
      js.startsWith("https://github.com/date-fns/date-fns", idx),
  },
  {
    token: "http://",
    expected: 2,
    classification: "SVG namespace identifier (inert — never fetched)",
    validate: (idx) => js.startsWith("http://www.w3.org/2000/svg", idx),
  },
  {
    token: "getXlsxWorker",
    expected: 1,
    classification: "T2 rejecting stub — no Worker/importScripts remain",
    validate: (idx) =>
      /^getXlsxWorker\(\)\s*\{\s*return Promise\.reject\(new Error\("XLSX export is not included in the EMS Scheduler build"\)\);?\s*\}/.test(
        js.slice(idx, idx + 200)
      ),
  },
];
for (const entry of INERT_ALLOWLIST) {
  const indices = [];
  let i = 0;
  while ((i = js.indexOf(entry.token, i)) !== -1) {
    indices.push(i);
    i += entry.token.length;
  }
  check(
    indices.length === entry.expected,
    `L2: "${entry.token}" appears ${indices.length}× (allowlist expects ${entry.expected})`
  );
  for (const idx of indices) {
    check(
      entry.validate(idx),
      `L2: unclassified "${entry.token}" occurrence at offset ${idx} — not the allowlisted ${entry.classification}`
    );
  }
}

// The https:// occurrences inside the http:// scan overlap check: "http://"
// never matches inside "https://" (the 's' breaks it), so counts are exact.

// CSS: no remote references and no font-face at all (style.css baseline;
// SVAR text renders in the app font via the theme bridge).
check(count(css, "url(http") === 0, "L2: remote url() in svar-gantt.es.css");
check(count(css, "@import") === 0, "L2: @import in svar-gantt.es.css");
check(count(css, "@font-face") === 0, "L2: @font-face in svar-gantt.es.css");

// ── Layer 3: supply-chain integrity ────────────────────────────────────
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));

for (const out of manifest.outputs) {
  const p = path.join(VENDOR_DIR, out.file);
  const actual = sha256(readFileSync(p));
  check(
    actual === out.sha256,
    `L3: ${out.file} hash drift — manifest ${out.sha256}, actual ${actual} (regenerate ONLY via build.mjs)`
  );
}

check(
  js.startsWith("/*!\n * EMS Scheduler vendored bundle"),
  "L3: MIT banner missing from svar-gantt.es.js"
);
check(
  css.startsWith("/*!\n * EMS Scheduler vendored styles"),
  "L3: MIT banner missing from svar-gantt.es.css"
);

const exportsMatch = js.match(/export\s*\{([^}]*)\}\s*;?\s*$/);
const exportNames = (exportsMatch?.[1] ?? "")
  .split(",")
  .map((s) => s.trim().split(/\s+as\s+/).pop())
  .filter(Boolean)
  .sort();
check(
  JSON.stringify(exportNames) === JSON.stringify([...manifest.exports].sort()),
  `L3: bundle exports [${exportNames}] != manifest [${manifest.exports}]`
);

// Root package files must never gain an @svar-ui entry (the pipeline is
// isolated from the EMS dependency graph).
for (const f of ["package.json", "package-lock.json"]) {
  const p = path.join(REPO_ROOT, f);
  if (existsSync(p)) {
    check(
      !readFileSync(p, "utf8").includes("@svar-ui"),
      `L3: @svar-ui leaked into root ${f}`
    );
  }
}

// Bundle byte budgets + runtime-package allowlist (PR #214 review P2-02):
// the explicit-export bundle deliberately retains small internal
// Editor/Menu/Toolbar contributions (tree shaking cannot drop live class
// methods — plan §1.0 finding 3), so growth is bounded by budget and any
// NEW package contributing bytes must be consciously allowlisted here.
const BYTE_BUDGET = { "svar-gantt.es.js": 450_000, "svar-gantt.es.css": 50_000 };
for (const [file, budget] of Object.entries(BYTE_BUDGET)) {
  const bytes = readFileSync(path.join(VENDOR_DIR, file)).length;
  check(
    bytes <= budget,
    `L3: ${file} is ${bytes} B — exceeds the ${budget} B budget (investigate before raising)`
  );
}
const RUNTIME_PACKAGE_ALLOWLIST = new Set([
  "entry.js",
  "@svar-ui/react-gantt",
  "@svar-ui/react-core",
  "@svar-ui/gantt-store",
  "@svar-ui/react-grid",
  "@svar-ui/grid-store",
  "@svar-ui/lib-react",
  "@svar-ui/react-editor",
  "@svar-ui/lib-dom",
  "@svar-ui/lib-state",
  "@svar-ui/react-toolbar",
  "@svar-ui/core-locales",
  "@svar-ui/react-menu",
  "@svar-ui/gantt-locales",
  "@svar-ui/grid-locales",
]);
for (const pkg of Object.keys(manifest.runtimeInputs ?? {})) {
  check(
    RUNTIME_PACKAGE_ALLOWLIST.has(pkg),
    `L3: unexpected package contributing runtime bytes: ${pkg} (review + allowlist deliberately)`
  );
}

// Archive completeness: every mapped tarball exists and hashes clean;
// counts line up across map, manifest, and license inventory. Nested
// duplicate versions intentionally REUSE a tarball (42 installed package
// entries → 39 unique files), so uniqueness is by file, and any file on
// disk NOT referenced by the map is an orphan (PR #214 review P2-06).
const map = JSON.parse(
  readFileSync(path.join(PIPELINE_DIR, "offline-dependencies.json"), "utf8")
);
const referencedTarballs = new Set();
for (const e of map.packages) {
  referencedTarballs.add(path.basename(e.tarball));
  const p = path.join(PIPELINE_DIR, e.tarball);
  if (!existsSync(p)) {
    fail(`L3: archived tarball missing: ${e.tarball}`);
    continue;
  }
  check(
    sha256(readFileSync(p)) === e.sha256,
    `L3: tarball hash drift: ${e.tarball}`
  );
}
for (const f of readdirSync(path.join(PIPELINE_DIR, "tarballs"))) {
  check(
    referencedTarballs.has(f),
    `L3: orphan tarball not referenced by offline-dependencies.json: tarballs/${f}`
  );
}
check(
  manifest.uniqueTarballFileCount === referencedTarballs.size,
  `L3: manifest uniqueTarballFileCount (${manifest.uniqueTarballFileCount}) != referenced files (${referencedTarballs.size})`
);
check(
  map.packages.length === manifest.closureEntryCount,
  `L3: offline map has ${map.packages.length} packages, manifest records ${manifest.closureEntryCount}`
);
check(
  manifest.licenseInventoryCount === manifest.closureEntryCount,
  `L3: license inventory (${manifest.licenseInventoryCount}) != tarball count (${manifest.closureEntryCount})`
);
const notices = readFileSync(
  path.join(REPO_ROOT, "LICENSES/THIRD-PARTY-NOTICES.md"),
  "utf8"
);
const noticeRows = (notices.match(/^\| [^|P]/gm) ?? []).length; // data rows (skip header "| Package")
check(
  noticeRows === manifest.closureEntryCount,
  `L3: THIRD-PARTY-NOTICES.md has ${noticeRows} rows, expected ${manifest.closureEntryCount}`
);

// Build-output hygiene: the tarball archive must never be copied into dist/.
const dist = path.join(REPO_ROOT, "dist");
if (existsSync(dist)) {
  const probe = spawnSyncFind(dist);
  check(!probe, "L3: tools/vendor content leaked into dist/");
}
function spawnSyncFind(dir) {
  // lightweight recursive scan for .tgz files or a tarballs/ dir in dist
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const f of readdirSync(d)) {
      const p = path.join(d, f);
      if (f === "tarballs" || f.endsWith(".tgz")) return p;
      if (statSync(p).isDirectory()) stack.push(p);
    }
  }
  return null;
}

// ── Verdict ────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`verify.mjs: ${failures.length} FAILURE(S):`);
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(
  "verify.mjs: all three layers PASS (forbidden origins, capability allowlist, supply-chain integrity)."
);
