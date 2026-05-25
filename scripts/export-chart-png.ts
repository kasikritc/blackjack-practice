import { chromium } from "playwright";
import { readFileSync, existsSync } from "fs";
import { resolve, join, dirname } from "path";

// --- CLI args ---

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const runDir = arg("--run");
const chartFile = arg("--chart");
const outputArg = arg("--output");

if (!runDir && !chartFile) {
  console.error("Usage: export-chart-png --run <dir> [--output <file>]");
  console.error("       export-chart-png --chart <file> [--output <file>]");
  process.exit(1);
}

const chartPath = chartFile
  ? resolve(chartFile)
  : join(resolve(runDir!), "chart.json");

if (!existsSync(chartPath)) {
  console.error(`chart.json not found: ${chartPath}`);
  process.exit(1);
}

const chart = JSON.parse(readFileSync(chartPath, "utf8")) as Record<
  string,
  Record<string, Record<string, string>>
>;

let title = "Strategy Chart";
const manifestPath = runDir ? join(resolve(runDir), "manifest.json") : null;
if (manifestPath && existsSync(manifestPath)) {
  try {
    const m = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (m.name) title = m.name;
    else if (m.config?.name) title = m.config.name;
  } catch {}
}

const outputPath =
  outputArg ??
  (runDir ? join(resolve(runDir), "chart.png") : join(dirname(chartPath), "chart.png"));

// --- Chart layout constants ---

const DEALERS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"];

const ABBREV: Record<string, string> = {
  hit: "H",
  stand: "S",
  double: "D",
  split: "P",
  surrender: "R",
};

const HARD_ROWS = Array.from({ length: 18 }, (_, i) => {
  const total = i + 4;
  return { key: `h${total}`, label: String(total) };
});

const SOFT_ROWS = Array.from({ length: 9 }, (_, i) => {
  const total = i + 13;
  return { key: `s${total}`, label: `A,${total - 11}` };
});

const PAIR_ORDER = ["A", "10", "9", "8", "7", "6", "5", "4", "3", "2"];
const PAIR_ROWS = PAIR_ORDER.map((v) => ({
  key: `p${v}`,
  label: v === "A" ? "A,A" : `${v},${v}`,
}));

// --- HTML builder ---

function buildTable(
  section: string,
  label: string,
  rows: { key: string; label: string }[]
): string {
  const cells = chart[section] ?? {};

  const headerCols = DEALERS.map(
    (d) => `<th><div class="strategy-column-toggle">${d}</div></th>`
  ).join("");

  const sectionRow = `
    <tr class="strategy-section-row">
      <th colspan="${DEALERS.length + 1}">
        <div class="strategy-row-toggle is-included">${label}</div>
      </th>
    </tr>`;

  const dataRows = rows
    .map(({ key, label: rowLabel }) => {
      const rowData = cells[key] ?? {};
      const tds = DEALERS.map((d) => {
        const action = rowData[d] ?? "";
        const abbrev = ABBREV[action] ?? "";
        const cls = action ? ` action-${action}` : "";
        return `<td><div class="strategy-cell${cls}">${abbrev}</div></td>`;
      }).join("");
      return `<tr>
        <td><div class="strategy-row-toggle is-included">${rowLabel}</div></td>
        ${tds}
      </tr>`;
    })
    .join("\n");

  return `
    <div class="compact-strategy-table-wrap">
      <table class="strategy-table compact-strategy-table">
        <thead>
          <tr>
            <th><div class="strategy-column-toggle">Hand</div></th>
            ${headerCols}
          </tr>
        </thead>
        <tbody>
          ${sectionRow}
          ${dataRows}
        </tbody>
      </table>
    </div>`;
}

const LEGEND_ACTIONS: [string, string][] = [
  ["hit", "Hit"],
  ["stand", "Stand"],
  ["double", "Double"],
  ["split", "Split"],
  ["surrender", "Surrender"],
];

const legendHtml = LEGEND_ACTIONS.map(
  ([action, name]) =>
    `<span class="strategy-legend-chip action-${action}"><strong>${ABBREV[action]}</strong> ${name}</span>`
).join("");

const hardTable = buildTable("hard", "Hard Totals", HARD_ROWS);
const softTable = buildTable("soft", "Soft Totals", SOFT_ROWS);
const pairTable = buildTable("pair", "Pairs", PAIR_ROWS);

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: #14221f;
    color: #f6efe0;
    font-family: system-ui, -apple-system, sans-serif;
    padding: 20px;
    display: inline-block;
  }

  .export-root {
    display: inline-block;
  }

  .export-title {
    font-size: 13px;
    font-weight: 700;
    color: #d9b45a;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 12px;
  }

  .strategy-review-layout {
    display: grid;
    grid-template-columns: max-content max-content;
    gap: 12px;
    align-items: start;
  }

  .strategy-review-chart-stack {
    display: grid;
    gap: 10px;
    align-content: start;
  }

  .strategy-table {
    border-collapse: collapse;
    table-layout: fixed;
    width: max-content;
    min-width: 0;
  }

  .strategy-table th,
  .strategy-table td {
    border: 1px solid rgba(255,255,255,0.08);
    padding: 0;
    text-align: center;
  }

  .strategy-table th {
    background: rgba(0,0,0,0.2);
  }

  .compact-strategy-table th:first-child,
  .compact-strategy-table td:first-child { width: 70px; }

  .compact-strategy-table th:not(:first-child),
  .compact-strategy-table td:not(:first-child) { width: 38px; }

  .strategy-cell,
  .strategy-row-toggle,
  .strategy-column-toggle {
    width: 100%;
    min-height: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 900;
    color: #f6efe0;
    padding: 0 2px;
    line-height: 1;
  }

  .strategy-column-toggle {
    color: #b8c5bf;
    font-size: 11px;
  }

  .strategy-row-toggle {
    color: #b8c5bf;
    font-size: 12px;
    font-weight: 600;
  }

  .strategy-section-row th {
    background: rgba(217,180,90,0.12);
  }

  .strategy-section-row .strategy-row-toggle {
    min-height: 24px;
    height: 24px;
    justify-content: flex-start;
    padding-left: 7px;
    color: #d9b45a;
    text-transform: uppercase;
    font-size: 10px;
    letter-spacing: 0.08em;
  }

  .strategy-cell.action-hit      { background: rgba(62,132,216,0.26); color: #dcecff; }
  .strategy-cell.action-stand    { background: rgba(103,213,138,0.24); color: #e5ffed; }
  .strategy-cell.action-double   { background: rgba(217,180,90,0.3);  color: #fff3ca; }
  .strategy-cell.action-split    { background: rgba(174,120,232,0.28); color: #f0e4ff; }
  .strategy-cell.action-surrender { background: rgba(228,95,95,0.28);  color: #ffe1e1; }

  .strategy-review-footer {
    margin-top: 10px;
  }

  .strategy-action-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    font-size: 10px;
    font-weight: 800;
    color: #b8c5bf;
  }

  .strategy-legend-chip {
    min-height: 22px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 6px;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.12);
    background: rgba(255,255,255,0.05);
  }

  .strategy-legend-chip strong { color: #f6efe0; }

  .strategy-legend-chip.action-hit      { border-color: rgba(62,132,216,0.55); }
  .strategy-legend-chip.action-stand    { border-color: rgba(103,213,138,0.55); }
  .strategy-legend-chip.action-double   { border-color: rgba(217,180,90,0.6); }
  .strategy-legend-chip.action-split    { border-color: rgba(174,120,232,0.6); }
  .strategy-legend-chip.action-surrender { border-color: rgba(228,95,95,0.6); }
</style>
</head>
<body>
<div class="export-root">
  <div class="export-title">${title}</div>
  <div class="strategy-review-layout">
    <div class="strategy-review-main-chart">
      ${hardTable}
    </div>
    <div class="strategy-review-chart-stack">
      ${softTable}
      ${pairTable}
    </div>
  </div>
  <div class="strategy-review-footer">
    <div class="strategy-action-legend">
      ${legendHtml}
    </div>
  </div>
</div>
</body>
</html>`;

// --- Render ---

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1200, height: 900 });
await page.setContent(html, { waitUntil: "load" });
await page.locator(".export-root").screenshot({ path: outputPath });
await browser.close();

console.log(`PNG saved: ${outputPath}`);
