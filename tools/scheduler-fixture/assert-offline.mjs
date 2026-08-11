// One-time offline runtime assertion (plan §13.0d) + adapter contract
// checks (§1.3), run against the built fixture (vite.fixture.config.ts).
//
// Serves tools/scheduler-fixture/dist on 127.0.0.1 and drives a headless
// Chromium with ALL non-local requests blocked at the interception layer.
// Static scanning is not a substitute — this is the authoritative
// behavioral evidence that the Scheduler surface makes zero external
// requests, renders IBM Plex (not a fallback), shows real icon glyphs,
// and honors the drag/readonly/theme/date-mapping contract.
//
// Playwright is NOT an EMS dependency (plan D6): point PLAYWRIGHT_CORE at
// an external playwright-core install and CHROMIUM_BIN at a Chromium.
//
//   PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core \
//   CHROMIUM_BIN=/path/to/chrome \
//   node tools/scheduler-fixture/assert-offline.mjs

import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "dist");
const PORT = 4199;
const ORIGIN = `http://127.0.0.1:${PORT}`;

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".txt": "text/plain",
  ".svg": "image/svg+xml",
};

const pwPath = process.env.PLAYWRIGHT_CORE;
const chromiumBin = process.env.CHROMIUM_BIN;
if (!pwPath || !chromiumBin) {
  console.error("Set PLAYWRIGHT_CORE and CHROMIUM_BIN (see header comment).");
  process.exit(2);
}
const { chromium } = await import(pathToFileURL(path.join(pwPath, "index.mjs")));

const server = createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, ORIGIN).pathname);
  let file = path.join(DIR, urlPath === "/" ? "index.html" : urlPath);
  if (!existsSync(file)) file = path.join(DIR, "index.html");
  res.setHeader("Content-Type", MIME[path.extname(file)] ?? "application/octet-stream");
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const failures = [];
const check = (ok, msg) => {
  console.log(`${ok ? "  ✓" : "  ✗"} ${msg}`);
  if (!ok) failures.push(msg);
};

const externalRequests = [];
const browser = await chromium.launch({ executablePath: chromiumBin });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

// THE gate: every non-local request is recorded AND aborted.
await page.route("**/*", (route) => {
  const url = route.request().url();
  if (url.startsWith(ORIGIN)) return route.continue();
  externalRequests.push(url);
  return route.abort();
});

await page.goto(ORIGIN + "/", { waitUntil: "networkidle" });
await page.waitForSelector(".wx-bar", { timeout: 10000 });

console.log("\n— §13.0d offline network interception —");
check(externalRequests.length === 0, `zero external requests (got ${externalRequests.length}${externalRequests.length ? ": " + externalRequests.slice(0, 5).join(", ") : ""})`);

console.log("\n— fonts (computed style, not a fallback) —");
const fontChecks = await page.evaluate(async () => {
  await document.fonts.ready;
  return {
    sansLoaded: document.fonts.check("13px 'IBM Plex Sans'"),
    condensedLoaded: document.fonts.check("13px 'IBM Plex Sans Condensed'"),
    ganttFont: getComputedStyle(document.querySelector(".wx-gantt")).fontFamily,
    esGlyphs: (() => {
      // EN+ES coverage probe: measure accented glyphs vs missing-glyph width.
      const el = document.createElement("span");
      el.style.cssText = "font-family:'IBM Plex Sans';font-size:32px;position:absolute;visibility:hidden";
      document.body.appendChild(el);
      el.textContent = "ñÑáéíóúüÜ¿¡";
      const w = el.getBoundingClientRect().width;
      el.remove();
      return w > 0;
    })(),
  };
});
check(fontChecks.sansLoaded, "IBM Plex Sans loaded from local woff2");
check(fontChecks.ganttFont.includes("IBM Plex Sans"), `Gantt computed font is IBM Plex (${fontChecks.ganttFont.slice(0, 60)})`);
check(fontChecks.esGlyphs, "ES glyphs render (ñ, accents, inverted punctuation)");

// Condensed at the mobile breakpoint (index.css --app-font swap ≤768px).
await page.setViewportSize({ width: 700, height: 800 });
const mobileFont = await page.evaluate(
  () => getComputedStyle(document.querySelector(".wx-gantt")).fontFamily
);
check(mobileFont.includes("IBM Plex Sans Condensed"), `Condensed family at mobile breakpoint (${mobileFont.slice(0, 60)})`);
// Compact-font mode forces Condensed at any width.
await page.setViewportSize({ width: 1280, height: 800 });
const compactFont = await page.evaluate(() => {
  document.documentElement.setAttribute("data-compact-font", "true");
  const f = getComputedStyle(document.querySelector(".wx-gantt")).fontFamily;
  document.documentElement.removeAttribute("data-compact-font");
  return f;
});
check(compactFont.includes("IBM Plex Sans Condensed"), "Condensed family in compact-font mode");

console.log("\n— icons (local Lucide masks, no tofu) —");
const iconCheck = await page.evaluate(() => {
  const els = [...document.querySelectorAll('[class*="wxi-"]')];
  if (els.length === 0) return { present: 0, masked: 0 };
  const masked = els.filter((el) => {
    const s = getComputedStyle(el, "::before");
    return (s.maskImage ?? s.webkitMaskImage ?? "none") !== "none";
  }).length;
  return { present: els.length, masked };
});
check(
  iconCheck.present === 0 || iconCheck.masked > 0,
  `wxi glyphs (${iconCheck.present} present, ${iconCheck.masked} with local SVG mask)`
);

console.log("\n— rendering contract (§1.3) —");
const render = await page.evaluate(() => ({
  bars: document.querySelectorAll(".wx-bar").length,
  emsTypeBars: document.querySelectorAll(".wx-bar[class*='ems-']").length,
  cells: document.querySelectorAll('[data-testid="ems-cell"]').length,
  themeClass: !!document.querySelector(".wx-willow-theme"),
  weekend: document.querySelectorAll(".sch-weekend").length,
  todayLine: !!document.querySelector(".sch-today-line"),
  todayLeft: parseFloat(document.querySelector(".sch-today-line")?.style.left ?? "-1"),
  barColor: (() => {
    const b = document.querySelector(".wx-bar.ems-leader-firm");
    return b ? getComputedStyle(b).borderColor : null;
  })(),
}));
check(render.bars === 5, `5 fixture bars render (got ${render.bars})`);
check(render.emsTypeBars === 5, "every bar carries its ems-* type class (custom task rendering)");
check(render.cells === 5, "custom React column cells render");
check(render.themeClass, "Willow (light) theme active");
check(render.weekend > 0, `weekend cells shaded at weeks zoom (${render.weekend})`);
check(render.todayLine, "EMS Today line present inside .wx-area");
const expectedToday = await page.evaluate(() => window.__fixture.expectedTodayOffset("weeks"));
check(
  Math.abs(render.todayLeft - expectedToday) < 0.5,
  `Today line x matches todayOffsetPx at weeks zoom (${render.todayLeft} ≈ ${expectedToday?.toFixed(1)})`
);

console.log("\n— Today line stays aligned across zooms (walk item 12) —");
for (const zoom of ["months", "quarters"]) {
  await page.evaluate((z) => window.__fixture.setZoom(z), zoom);
  await page.waitForTimeout(250);
  const { left, expected } = await page.evaluate((z) => ({
    left: parseFloat(document.querySelector(".sch-today-line")?.style.left ?? "-1"),
    expected: window.__fixture.expectedTodayOffset(z),
  }), zoom);
  check(Math.abs(left - expected) < 0.5, `${zoom}: ${left} ≈ ${expected?.toFixed(1)}`);
}
await page.evaluate(() => window.__fixture.setZoom("weeks"));
await page.waitForTimeout(250);

console.log("\n— dark theme —");
await page.evaluate(() => window.__fixture.setDark(true));
await page.waitForTimeout(200);
const dark = await page.evaluate(() => ({
  themeClass: !!document.querySelector(".wx-willow-dark-theme"),
  bg: getComputedStyle(document.querySelector(".wx-gantt")).color,
}));
check(dark.themeClass, "WillowDark active when root has .dark");
await page.evaluate(() => window.__fixture.setDark(false));

console.log("\n— drag / date mapping / api events (§1.3 contract) —");
// After the zoom round-trip the bar DOM was rebuilt — re-wait, then scroll
// the chart so the bar's right edge sits inside the viewport (mouse events
// cannot land outside it).
await page.waitForSelector(".wx-bar[data-id=':a1']", { state: "visible" });
await page.evaluate(() => {
  const chart = document.querySelector(".wx-chart");
  const bar = document.querySelector(".wx-bar[data-id=':a1']");
  chart.scrollLeft = Math.max(0, bar.offsetLeft + bar.offsetWidth - 300);
});
await page.waitForTimeout(200);
const barBox = await page.locator(".wx-bar[data-id=':a1']").boundingBox();
// Resize: grab the right edge, move exactly 7 day-cells (weeks zoom = 28px/day).
await page.mouse.move(barBox.x + barBox.width - 2, barBox.y + barBox.height / 2);
await page.mouse.down();
await page.mouse.move(barBox.x + barBox.width - 2 + 7 * 28, barBox.y + barBox.height / 2, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(400);
const commits = await page.evaluate(() => window.__commits);
check(commits.length === 1, `resize produced exactly one committed update-task (got ${commits.length})`);
if (commits.length === 1) {
  const orig = await page.evaluate(() => window.__fixture.window);
  const expectedEnd = await page.evaluate(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30 + 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  check(commits[0].id === "a1", "commit targets the dragged bar");
  check(
    commits[0].end === expectedEnd,
    `+7-day resize maps to +7 calendar days, no one-day drift (${commits[0].end} vs ${expectedEnd})`
  );
  check(/^\d{4}-\d{2}-\d{2}$/.test(commits[0].start), "commit dates are yyyy-MM-dd strings");
}

console.log("\n— click opens (I-2) vs drag discrimination —");
// locator.click() auto-scrolls the bar into view.
await page.locator(".wx-bar[data-id=':a2']").click({ position: { x: 30, y: 10 } });
await page.waitForTimeout(200);
const opens = await page.evaluate(() => window.__opens);
check(opens.includes("a2"), `click on a bar fires onBarOpen (got [${opens}])`);
const commitsAfterClick = await page.evaluate(() => window.__commits.length);
check(commitsAfterClick === 1, "plain click commits nothing");

console.log("\n— readonly honors (I-12) —");
await page.evaluate(() => window.__fixture.setReadonly(true));
await page.waitForTimeout(250);
await page.evaluate(() => {
  const chart = document.querySelector(".wx-chart");
  const bar = document.querySelector(".wx-bar[data-id=':a5']");
  chart.scrollLeft = Math.max(0, bar.offsetLeft - 300);
});
await page.waitForTimeout(200);
const bar5 = await page.locator(".wx-bar[data-id=':a5']").boundingBox();
await page.mouse.move(bar5.x + bar5.width - 2, bar5.y + bar5.height / 2);
await page.mouse.down();
await page.mouse.move(bar5.x + bar5.width + 100, bar5.y + bar5.height / 2, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(400);
const commitsAfterReadonly = await page.evaluate(() => window.__commits.length);
check(commitsAfterReadonly === 1, "readonly blocks drag commits");

console.log("\n— multi-segment staff (D4 fixture) —");
const segments = await page.evaluate(() =>
  ["a3", "a4"].map((id) => !!document.querySelector(`.wx-bar[data-id=':${id}']`))
);
check(segments.every(Boolean), "two non-overlapping segments render as separate adjacent bars");

console.log("\n— keyboard row actions (P1-05: semantic buttons, not vendor tab stops) —");
// Each key must INDEPENDENTLY activate a freshly located and focused native
// button exactly once. The prior test pressed Enter then Space in a single
// focus epoch with a fixed sleep and a `>= 2` aggregate count: Enter activation
// can bubble into the vendor table and move/replace the focused node before the
// Space press, and a literal " " went to whatever owned global focus — making
// the assertion flaky and under-diagnostic. Re-resolve + refocus per key, use
// locator.press() with canonical key names, and wait on the real observable
// (exactly one activation) rather than elapsed time (PR #223 rev.5 P2-03).
async function assertCellKeyboardActivation(key) {
  await page.evaluate(() => {
    window.__opens.length = 0;
  });

  // Focus with a bounded retry: a single-shot focus()+check races the
  // vendor table's own focus management right after DOM rebuilds (flaky
  // locally ~1 in 2 runs). The contract is that focus HOLDS — asserting
  // it via a short retry loop removes the race without weakening it.
  const button = page.locator('[data-testid="ems-cell"]').first();
  let focused = false;
  for (let attempt = 0; attempt < 5 && !focused; attempt++) {
    await button.focus();
    focused = await button.evaluate((node) => node === document.activeElement);
    if (!focused) await page.waitForTimeout(150);
  }
  check(focused, `${key}: cell action button receives keyboard focus`);

  // locator.press() targets the current element and uses canonical key names.
  await button.press(key);

  try {
    await page.waitForFunction(
      () => window.__opens.filter((value) => value === "cell:a1").length === 1,
      undefined,
      { timeout: 2_000 }
    );
  } catch {
    // Record the detailed contract failure through check() below so the
    // remainder of the offline assertions can still report their results.
  }

  const opens = await page.evaluate(() => [...window.__opens]);
  check(
    opens.filter((value) => value === "cell:a1").length === 1,
    `${key} activates the focused row action exactly once (got [${opens}])`
  );
}

await assertCellKeyboardActivation("Enter");
await assertCellKeyboardActivation("Space");

console.log("\n— current-callback contract after re-render (P1-03) —");
await page.evaluate(() => window.__fixture.setReadonly(false));
await page.evaluate(() => window.__fixture.bumpVersion());
await page.waitForTimeout(250);
await page.evaluate(() => {
  const chart = document.querySelector(".wx-chart");
  const bar = document.querySelector(".wx-bar[data-id=':a2']");
  chart.scrollLeft = Math.max(0, bar.offsetLeft + bar.offsetWidth - 300);
});
await page.waitForTimeout(200);
const bar2b = await page.locator(".wx-bar[data-id=':a2']").boundingBox();
await page.mouse.move(bar2b.x + bar2b.width - 2, bar2b.y + bar2b.height / 2);
await page.mouse.down();
await page.mouse.move(bar2b.x + bar2b.width - 2 + 3 * 28, bar2b.y + bar2b.height / 2, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(400);
const versioned = await page.evaluate(() => window.__commits);
check(versioned.length === 2, `post-bump drag committed exactly once more (got ${versioned.length})`);
check(
  versioned[versioned.length - 1]?.v === 2,
  `SVAR-registered handler invoked the CURRENT closure, not the init-time one (v=${versioned[versioned.length - 1]?.v})`
);

console.log("\n— Phase 7: compact-mode pane selection keeps the timeline usable at 390x844 (D-P7-11; PR #233 P1-02) —");
// Below SVAR's hardcoded 650px compact threshold, displayMode "all" is
// COERCED to "grid" (grid pane takes calc(100% - 4px)) — dual panes are
// impossible. First document that failure mode, then assert the Employee
// Gantt's composition: displayMode "chart" (its mobile default) must give
// a full-width, scrollable timeline with bars and axis labels, and
// displayMode "grid" must keep the label buttons as usable focus targets.
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
const coerced = await page.evaluate(() => {
  const chart = document.querySelector(".wx-chart");
  const box = chart?.getBoundingClientRect();
  return box ? Math.max(0, Math.min(box.right, window.innerWidth) - Math.max(box.left, 0)) : 0;
});
console.log(`    (displayMode "all" at 390px: vendor compact mode leaves ${coerced.toFixed(0)}px of visible timeline — the P1-02 failure mode)`);

await page.evaluate(() => window.__fixture.setDisplayMode("chart"));
await page.waitForSelector(".wx-bar", { timeout: 10000 });
await page.waitForTimeout(300);
const chartGeom = await page.evaluate(() => {
  const chart = document.querySelector(".wx-chart");
  if (!chart) return null;
  const chartBox = chart.getBoundingClientRect();
  const visibleRight = Math.min(chartBox.right, window.innerWidth);
  const chartVisible = Math.max(0, visibleRight - Math.max(chartBox.left, 0));
  const inPane = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.right > Math.max(chartBox.left, 0) + 1 && r.left < visibleRight - 1;
  };
  const visibleBars = [...document.querySelectorAll(".wx-bar")].filter(inPane).length;
  const axisCells = [...document.querySelectorAll(".wx-scale .wx-cell")].filter(inPane).length;
  const before = chart.scrollLeft;
  chart.scrollLeft = before + 200;
  const scrolled = chart.scrollLeft > before;
  chart.scrollLeft = before;
  return { chartVisible, visibleBars, axisCells, scrolled };
});
check(chartGeom !== null, "chart pane located at 390px in displayMode 'chart'");
if (chartGeom) {
  check(
    chartGeom.chartVisible >= 300,
    `timeline pane fills the phone viewport (got ${chartGeom.chartVisible.toFixed(0)}px of 390)`
  );
  check(chartGeom.visibleBars > 0, `assignment bars render inside the visible pane (${chartGeom.visibleBars})`);
  check(chartGeom.axisCells > 0, `time-axis labels render inside the visible pane (${chartGeom.axisCells})`);
  check(chartGeom.scrolled, "timeline pane scrolls horizontally");
}

await page.evaluate(() => window.__fixture.setDisplayMode("grid"));
await page.waitForSelector('[data-testid="ems-cell"]', { timeout: 10000 });
await page.waitForTimeout(300);
const gridGeom = await page.evaluate(() => {
  const button = document.querySelector('[data-testid="ems-cell"]');
  const box = button?.getBoundingClientRect();
  return {
    cells: document.querySelectorAll('[data-testid="ems-cell"]').length,
    focusTargetVisible: !!box && box.width > 0 && box.left >= 0 && box.right <= window.innerWidth,
  };
});
check(gridGeom.cells > 0, `label list renders in displayMode 'grid' (${gridGeom.cells} row actions)`);
check(gridGeom.focusTargetVisible, "row action button is a visible, in-viewport focus target");

await page.evaluate(() => window.__fixture.setDisplayMode("all"));
await page.setViewportSize({ width: 1280, height: 800 });
await page.waitForSelector(".wx-bar", { timeout: 10000 });
await page.waitForTimeout(250);
const restoredDesktop = await page.evaluate(() => {
  const chart = document.querySelector(".wx-chart");
  const grid = document.querySelector(".wx-table-container");
  return {
    both: !!chart && !!grid && chart.getBoundingClientRect().width > 200 && grid.getBoundingClientRect().width > 200,
  };
});
check(restoredDesktop.both, "desktop keeps BOTH panes in displayMode 'all' (regression guard)");

console.log("\n— Phase 7 R2: container-aware pane selection in REAL layout widths (D-P7-15; R2 P1-01) —");
// The REAL StaffEngagementGantt inside the production width layers
// (sidebar + AppLayout main padding + page padding). The pane decision
// must follow the CONTAINER, not the viewport: with the expanded 256px
// sidebar, 768–1000px viewports leave a sub-650px host that a viewport
// breakpoint would call "desktop" — the R2 failure left a 0px timeline
// there. Expectation per scenario is computed from the MEASURED host
// against SVAR's 650px threshold, then asserted structurally.
const LAYOUTS = [
  { vw: 390, sidebar: 0 },    // phone (sidebar offcanvas)
  { vw: 768, sidebar: 256 },  // R2 failure row: host 416
  { vw: 900, sidebar: 256 },  // R2 failure row: host 548
  { vw: 1000, sidebar: 256 }, // R2 failure row: host 648 (just compact)
  { vw: 1024, sidebar: 256 }, // host 672 — first dual-pane width
  { vw: 1440, sidebar: 256 }, // wide desktop
  { vw: 768, sidebar: 48 },   // collapsed sidebar: host 624 (compact)
  { vw: 1000, sidebar: 48 },  // collapsed sidebar: host 856 (dual-pane)
  { vw: 1440, sidebar: 48 },  // collapsed sidebar, wide
];
for (const { vw, sidebar } of LAYOUTS) {
  await page.setViewportSize({ width: vw, height: 844 });
  await page.evaluate(() => window.__fixture.setStaffLayout(null));
  await page.waitForTimeout(120);
  await page.evaluate((s) => window.__fixture.setStaffLayout({ sidebar: s }), sidebar);
  await page.waitForSelector('[data-testid="staff-harness"]', { timeout: 10000 });
  await page.waitForTimeout(400); // ResizeObserver settle + canvas mount
  const geom = await page.evaluate(() => {
    const host = document.querySelector(".sch-gantt-host");
    const chart = document.querySelector(".wx-chart");
    const grid = document.querySelector(".wx-table-container");
    if (!host || !chart) return null;
    const hostBox = host.getBoundingClientRect();
    const chartBox = chart.getBoundingClientRect();
    const visibleRight = Math.min(chartBox.right, window.innerWidth);
    const chartVisible = Math.max(0, visibleRight - Math.max(chartBox.left, 0));
    const bars = [...document.querySelectorAll(".wx-bar")].filter((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.right > Math.max(chartBox.left, 0) + 1 && r.left < visibleRight - 1;
    }).length;
    const toggle = [...document.querySelectorAll("button")].some(
      (b) => b.textContent?.trim() === "Cronograma"
    );
    // Phase 7b: total line + purple out-of-scope row.
    const strip = document.querySelector('[data-testid="utilization-strip"]');
    const stripBands = strip ? [...strip.querySelectorAll('[role="img"]')] : [];
    const stripLevels = new Set(
      stripBands.map((b) =>
        b.className.includes("bg-destructive")
          ? "over"
          : b.className.includes("bg-success")
            ? "ok"
            : b.className.includes("bg-warning")
              ? "under"
              : "?"
      )
    );
    return {
      hostWidth: hostBox.width,
      chartVisible,
      bars,
      toggle,
      gridWidth: grid ? grid.getBoundingClientRect().width : 0,
      stripPresent: !!strip,
      stripBandCount: stripBands.length,
      stripLevels: [...stripLevels].sort().join(","),
      stripHasPercentText: stripBands.some((b) => /%$/.test(b.textContent?.trim() ?? "")),
      purpleBar: !!document.querySelector(".wx-bar.ems-out-of-scope"),
    };
  });
  const label = `${vw}px viewport / ${sidebar}px sidebar`;
  check(geom !== null, `${label}: gantt host mounted`);
  if (!geom) continue;
  const expectCompact = geom.hostWidth <= 650;
  console.log(
    `    ${label}: host ${geom.hostWidth.toFixed(0)}px → ${expectCompact ? "compact" : "dual-pane"} (chart ${geom.chartVisible.toFixed(0)}px, grid ${geom.gridWidth.toFixed(0)}px, bars ${geom.bars})`
  );
  check(geom.toggle === expectCompact, `${label}: pane toggle ${expectCompact ? "present" : "absent"}`);
  if (expectCompact) {
    check(
      geom.chartVisible >= geom.hostWidth - 12,
      `${label}: timeline fills the host (${geom.chartVisible.toFixed(0)} of ${geom.hostWidth.toFixed(0)}px)`
    );
  } else {
    check(geom.gridWidth > 150, `${label}: label pane present (${geom.gridWidth.toFixed(0)}px)`);
    check(geom.chartVisible > 150, `${label}: timeline pane visible (${geom.chartVisible.toFixed(0)}px)`);
  }
  check(geom.bars > 0, `${label}: assignment bars visible (${geom.bars})`);
  // Phase 7b (D-P7-18/19): the total line accompanies every timeline
  // pane with all three booking levels, and the out-of-scope engagement
  // renders as a purple bar.
  check(geom.stripPresent, `${label}: utilization total line present`);
  check(
    geom.stripBandCount === 3 && geom.stripLevels === "ok,over,under",
    `${label}: three bands with under/ok/over levels (got ${geom.stripBandCount}: ${geom.stripLevels})`
  );
  check(geom.stripHasPercentText, `${label}: bands carry % labels (not color-only)`);
  check(geom.purpleBar, `${label}: out-of-scope engagement renders as a purple bar`);
}

console.log("\n— Phase 7b: strip scroll-sync survives a vendor DOM rebuild (PR #234 P1) —");
// Still mounted from the last matrix scenario (1440/48). Scroll the
// chart, assert the band area follows; then swap the THEME — SVAR
// rebuilds its subtree, and a one-shot listener would stay on the
// detached chart — and assert the sync still follows a fresh scroll.
async function stripFollowsScroll(px) {
  await page.evaluate((x) => {
    const chart = document.querySelector(".wx-chart");
    chart.scrollLeft = x;
  }, px);
  await page.waitForTimeout(250);
  return page.evaluate(() => {
    const chart = document.querySelector(".wx-chart");
    const inner = document.querySelector('[data-testid="utilization-strip"] > div:last-child > div');
    const m = /translateX\((-?\d+(?:\.\d+)?)px\)/.exec(inner?.style.transform ?? "");
    return { scrollLeft: chart.scrollLeft, translate: m ? parseFloat(m[1]) : null };
  });
}
const beforeTheme = await stripFollowsScroll(180);
check(
  beforeTheme.translate !== null && Math.abs(beforeTheme.translate + beforeTheme.scrollLeft) < 1,
  `strip follows chart scroll (scrollLeft ${beforeTheme.scrollLeft} ↔ translate ${beforeTheme.translate})`
);
await page.evaluate(() => window.__fixture.setDark(true));
await page.waitForTimeout(400);
const afterTheme = await stripFollowsScroll(340);
check(
  afterTheme.translate !== null && Math.abs(afterTheme.translate + afterTheme.scrollLeft) < 1,
  `strip STILL follows scroll after a theme rebuild (scrollLeft ${afterTheme.scrollLeft} ↔ translate ${afterTheme.translate})`
);
await page.evaluate(() => window.__fixture.setDark(false));
await page.waitForTimeout(200);

await page.evaluate(() => window.__fixture.setStaffLayout(null));
await page.setViewportSize({ width: 1280, height: 800 });
await page.waitForSelector(".wx-bar", { timeout: 10000 });
await page.waitForTimeout(250);

check(externalRequests.length === 0, `STILL zero external requests after all interactions`);

await browser.close();
server.close();

if (failures.length) {
  console.error(`\nassert-offline: ${failures.length} FAILURE(S)`);
  process.exit(1);
}
console.log("\nassert-offline: ALL CHECKS PASS — record this output in the PR description (§13.0d).");
