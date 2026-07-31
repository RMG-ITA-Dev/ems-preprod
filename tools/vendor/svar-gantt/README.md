# SVAR React Gantt — self-contained vendor pipeline

This directory is the committed, reproducible pipeline behind the generated
Scheduler vendor artifacts in `src/components/scheduler/vendor/svar-gantt/`.
It exists so that EMS can run, audit, and **regenerate** its Gantt bundle
forever without SVAR, npm publication availability, SVAR repositories, or
SVAR hosted infrastructure (Phase 4 plan §1, decision D1 rev. 2).

## The three self-containment guarantees

1. **Runtime self-containment** — the deployed EMS browser app makes no
   request to SVAR-controlled infrastructure. Enforced statically by
   `verify.mjs` and behaviorally by the offline runtime assertion
   (plan §13.0c/d).
2. **SVAR rebuild self-containment** — a future maintainer can regenerate
   the committed artifacts from this directory alone: no npmjs.org, no
   GitHub, no registry, starting from **no node_modules and an empty npm
   cache with network blocked**, producing byte-identical hashes. Proven by
   the hermetic gate (below) on every vendor change.
3. **Application-wide external-origin policy** — broader than SVAR; enforced
   by `tools/verify-external-origins.mjs` on every PR.

## Canonical rebuild environment (pinned)

| | |
|---|---|
| OS / arch | Linux x64 |
| Node | **v20.20.2** (LTS) |
| npm | 10.8.2 (bundled with that Node; used by `acquire.mjs` only) |
| esbuild | 0.28.1 (+ `@esbuild/linux-x64` archived) |
| Locale / TZ | UTF-8 / UTC |

Rebuilds on other platforms are **unsupported** (the deployed app never
needs esbuild — platform specificity affects regeneration only, and only
the Linux x64 esbuild binary is archived). `build.mjs` enforces this and
fails closed; `EMS_VENDOR_SKIP_ENV_CHECK=1` exists for exploration only —
its outputs are never authoritative.

## Files

| File | Role |
|---|---|
| `package.json` | Exact pins: `@svar-ui/react-gantt@2.7.1`, `esbuild@0.28.1`, `react@18.3.1`, `react-dom@18.3.1`. React is pinned because npm would otherwise resolve React peers to 19.x — not EMS's 18.3.1. |
| `package-lock.online.json` | The registry-resolved acquisition graph (audit reference; NOT the offline mechanism). |
| `offline-dependencies.json` | The offline reconstruction map: every installed package (incl. nested duplicate versions) → repo-relative tarball + npm SRI integrity + SHA-256. Generated — never hand-edited. |
| `tarballs/` | The complete install closure: 42 installed package entries backed by 39 unique archived tarballs, ~10 MB (nested duplicate versions intentionally reuse a tarball). Each verified against the lockfile's integrity at acquisition; `verify.mjs` rejects missing, drifted, AND orphan files. |
| `entry.js` | Explicit exports: `Gantt`, `Willow`, `WillowDark` + `style.css`. |
| `acquire.mjs` | ONLINE, one-time (already run). Installs pins, archives the closure, generates the map + licenses, builds, then self-proves with the hermetic gate. |
| `rebuild-offline.mjs` | OFFLINE reconstruction — the normal path forever after. Also hosts the hermetic gate (`--hermetic`). |
| `transform.mjs` | Verified transformations T1–T3 (below). |
| `build.mjs` | Deterministic build core (env check → transforms → esbuild → manifest write/compare). The ONLY way vendor artifacts are regenerated. |
| `verify.mjs` | Three-layer self-containment gates (forbidden origins, capability allowlist, supply-chain integrity). |
| `vendor-manifest.json` | Environment, inputs (all tarballs + hashes), transformation records, output hashes/sizes, export list. |

## Why this design (verified findings, 2026-07-16/17)

- **CDN phone-home:** the SVAR theme components inject
  `<link>`s to `cdn.svar.dev` when their `fonts` prop is true (default).
  Patching the default is insufficient — the branch stays re-activatable —
  so **T1 removes the entire injection branch** (3 occurrences in
  `@svar-ui/react-core`); T3 flips the defaults as defense in depth.
- **Tree shaking cannot remove the XLSX worker:** `getXlsxWorker` lives on
  a retained store class in `@svar-ui/grid-store` (verified: `importScripts`
  / `new Worker` survive an explicit-export bundle). **T2 replaces the
  method body with a local rejecting stub** and asserts zero worker tokens
  remain.
- **Committed tarballs beside a registry lockfile are NOT offline-capable:**
  `npm ci --offline` still resolves registry URLs and fails `ENOTCACHED`
  (verified). Reconstruction therefore uses an EMS-owned deterministic
  installer driven by `offline-dependencies.json` — npm is never invoked;
  only `node` + `tar` are required.
- Each transform pins its input SHA-256 and an exact match count and
  **fails closed**. A version bump invalidates the pins on purpose: new
  tarballs + lockfile + manifest + code review (see below).

## Procedures

**Regenerate the artifacts (offline — the normal path):**

```bash
node tools/vendor/svar-gantt/rebuild-offline.mjs
```

Wipes this directory's `node_modules`, reinstalls purely from `tarballs/`,
applies T1–T3, bundles, and byte-compares against `vendor-manifest.json`.

**Prove the archive (hermetic gate — run in the pre-PR gate and on any
vendor change):**

```bash
node tools/vendor/svar-gantt/rebuild-offline.mjs --hermetic
```

Fresh temp dir, new empty HOME/npm cache, network blocked via an unshared
network namespace (`unshare -rn`), committed inputs only → byte-identical
output hashes. Fails if any tarball is missing or hash-drifted, any
transformation count mismatches, or outputs differ.

**Verify self-containment (static gates):**

```bash
node tools/vendor/svar-gantt/verify.mjs
```

**Version bump (rare, deliberate):** update `package.json` pins, re-derive
the transform pins in `transform.mjs` against a fresh install (the pinned
hashes/counts will fail closed until you do), then run `acquire.mjs` on the
canonical platform with network access, and put the whole result through
code review. Never edit anything in `src/components/scheduler/vendor/` or
`tarballs/` by hand.

## Rules

- This pipeline is **isolated from EMS's root `package.json`/lockfile** —
  no `@svar-ui/*` entry may ever appear there (`verify.mjs` gates it).
- Only `src/components/scheduler/GanttCanvas.tsx` may import the vendored
  bundle (ESLint `no-restricted-imports` boundary).
- `markers` (Today line) and `splitTasks` are PRO-gated upstream and are
  NOT in the EMS adapter contract — the Today line and the one-row-per-
  assignment model are EMS-owned (plan D4, §6).
- **Never use the deprecated `wx-react-gantt` 1.x npm package — it is
  GPLv3.** Only `@svar-ui/react-gantt` 2.x is MIT.
- Licensing: `LICENSES/svar-react-gantt.txt` (MIT + full inventory),
  `LICENSES/date-fns.txt` (embedded in SVAR dists), and the generated
  `LICENSES/THIRD-PARTY-NOTICES.md` (dual inventory covering every
  archived tarball) must stay in sync with this archive — `verify.mjs`
  checks the counts.
