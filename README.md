# Frame Glue SPC

Local sample dashboard for eight lines and sixteen frame gluing machines.

## Open the dashboard

Run `Start dashboard.cmd`, then open http://localhost:3000/. Keep the launcher running while using the website. The server binds to loopback only. The original workbook is not modified.

Choose **Admin**, select each line's product, and click **Save settings**. Each line controls two machines. Assignments start unassigned and are stored in this browser's local storage. Use the same browser and the same localhost address to retain them. This sample Admin page has no login and does not write machine recipes.

The header theme selector switches between **Original white** and **Dark blue**, and remembers the choice in this browser. Direct links: `http://localhost:3000/?theme=light#overview` and `http://localhost:3000/?theme=dark#overview`. Both themes include the current charts, Cpk calculations and product settings.

Overview defaults to All machines and supports selecting an individual machine. Click a machine to open its four charts and measurement history; detail initially selects that machine, and its machine dropdown includes all sixteen machines without a line-selection step. Both pages support start/end dates; the end date includes the entire day. The date range carries between pages. Overview totals, latest machine readings, and OOT numbers use only the selected machines and date range. The Full date range button restores the source date span. Empty or invalid ranges never fall back to older readings. Each frame keeps its own Time. Control limits are fixed and inclusive. Only values strictly outside LCL/UCL are flagged; other run rules and moving-range charts are not implemented.

## Source and interpretation

`data/sample.json` contains 979 readings from `Glue weight.xlsx`, `Sheet1`, rows 2–980, covering 2026-09-02 14:42:03 through 2026-09-07 08:54:17. Source `Time` is used, never `采集时间`. Time has no timezone metadata, so the source clock is preserved without conversion. Chart calendar coordinates use UTC internally solely to avoid browser timezone shifts.

The export has eight WS1 machines, 101/102 through 401/402. Slots 501/502 through 801/802 display No sample data. Missing measurements are not zero or passing readings. Each source row is one frame reading; four independent rows are not claimed to be a complete production cycle.

Products are absent from the source. **Admin changes re-evaluate the full sample using your chosen product.** This is a sample assignment, not production changeover history. Future API records can include `productType`; that historical value takes precedence over the local sample assignment. Before live use, implement effective-dated line assignments on the backend and set the correct product on every measurement.

The top overview widgets show machines with sample data, the count of machines outside limits based on their latest frame readings, the affected machine numbers, and the machines whose latest readings are within limits. A machine is counted once if any frame's latest reading is outside limits; older OOT readings do not count after that frame recovers. The machine-number links open the corresponding detail view. Latest machine status uses each frame's most recent reading, which may have different timestamps. A latest-within-limits label does not assert overall process stability.

## Cp and Cpk in machine details

Per user instruction, the fixed control limits are also the specification limits for capability: **LSL = LCL; USL = UCL**. No additional specification configuration is required. Per machine and frame, use all readings in the selected Time window and assigned product. Cpk = min[(USL − mean)/(3σ), (mean − LSL)/(3σ)], with within-process σ estimated as mean successive moving range / 1.128. Readings are sorted by Time; outside-limit points are retained. This is the individuals moving-range estimator, not overall sample standard deviation / Ppk.

Four frame widgets show **Cp and Cpk together**. Cp = (USL − LSL)/(6σ), using the same within-process sigma as Cpk. There is no lowest-frame summary widget. Long and short frames are never pooled. Missing product, fewer than two readings, mixed products, duplicate Time without sequence, and zero observed variation return an explanatory unavailable state. Values based on fewer than 50 readings are labeled small-sample estimates. Stability and normality have not been verified, so these are exploratory capability estimates rather than a process qualification.

References: [NIST capability](https://www.itl.nist.gov/div898/handbook/pmc/section1/pmc16.htm) and [NIST individuals variation](https://www.itl.nist.gov/div898/handbook/pmc/section3/pmc322.htm).

## Oracle API integration

The UI already requests the same-origin `GET /api/measurements` through `lib/data-source.ts`. The route currently returns the imported sample. Replace the route implementation with an Oracle-backed HTTP service. Keep Oracle access and credentials on the backend.

Optional query filters: `lineId`, `machineId`, `frame`, `from`, `to`. Time filters use `YYYY-MM-DD HH:mm:ss` and inclusive bounds. Example: `/api/measurements?machineId=101&frame=1`.

Response shape:

```json
{
  "metadata": {
    "mode": "sample", "source": "Glue weight.xlsx", "sheet": "Sheet1",
    "timestampField": "Time", "timezone": "source-local-unspecified",
    "from": "2026-09-02 14:42:03", "to": "2026-09-07 08:54:17",
    "recordCount": 979, "machineCount": 8, "units": "g",
    "productAssignment": "not-provided"
  },
  "readings": [{
    "id": "unique-source-record-id", "workshop": "WS1", "lineId": "L1",
    "machineId": "101", "equipmentCode": "150107240001", "frame": 1,
    "weight": 112.2, "Time": "2026-09-07 08:54:10", "productType": null
  }]
}
```

For live integration: use stable database row/event IDs, return readings sorted by Time, include historical products, define source timezone and missing/stale-data thresholds, and add server-backed product configuration. The current site is an explicit historical sample, with no polling or live connection indicator.

## Development

Preserves the generated Vinext / React / TypeScript / Shadcn starter; charts use Recharts. Dependencies are pinned in `pnpm-lock.yaml`.

For a fresh checkout, install Node.js 22.13 or newer and pnpm, then run `pnpm install --frozen-lockfile` in the project folder. Start the dashboard with the command below (or `Start dashboard.cmd` on Windows).

```text
node node_modules/vinext/dist/cli.js dev --host 127.0.0.1 --port 3000
node node_modules/typescript/bin/tsc --noEmit
node --test --test-isolation=none tests/spc.test.mjs
node node_modules/vinext/dist/cli.js build
```

The direct Node commands avoid a Windows pnpm runner issue that attempts to reinstall an already installed dependency tree. The starter installer reported blocked optional install scripts for esbuild, sharp and workerd. They were not enabled; installed platform packages support the local preview and build.

Re-import a workbook with bundled Python: `python scripts/import_sample.py "absolute-path-to-workbook.xlsx"` (requires openpyxl). The importer validates the source columns and outputs JSON only.

WebMCP is feature-detected and offers read settings and save sample products through the same actions as Admin. Actual registration in a WebMCP-enabled browser is not verified in this environment; standard browser controls work independently.
