# Performance log

Every performance change follows the same loop: measure, change one thing, measure again, keep it or revert it. Every attempt is logged here, kept or reverted.

## How to measure

Interaction figures come from `scripts/measure-perf.mjs`. It serves the repository on a local port, opens `index.html` in Chromium through Playwright, and repeats each run five times (set `RUNS` to change it). Each run:

1. loads the page and records largest contentful paint, layout shift, and the DOM node count;
2. opens the sample assessment and moves to the catalog review, then records the node count again;
3. types 21 characters into the first catalog note, 60 ms apart;
4. switches the catalog filter three times: Gaps, Technical, All;
5. attaches a 10 MB file to the first catalog row, creating the file inside the page the way a file chooser hands it over;
6. saves the full file, then attaches 15 MB more and saves again with 25 MB of evidence;
7. opens the result, a file holding 25 MB of evidence.

The script reads Event Timing entries for interactions (the longest is reported as INP, which is how INP is defined for fewer than 50 interactions) and Long Task entries for main thread work over 50 ms. Save duration is the time `SRA.exportAssessment(true)` takes in the page, with the download itself suppressed. The script needs Playwright, which is not a dependency of the project:

```bash
node scripts/measure-perf.mjs
```

Lighthouse 12 runs three times per form factor against the same files served by `python3 -m http.server`, which sends them uncompressed, and the median is reported.

Machine for every figure below: a 4 core Intel Xeon at 2.1 GHz cloud container, Chromium 1243 headless, Node 22.

The page cannot load data with `fetch`: the Content Security Policy sets `connect-src 'none'`. Anything new that loads data at run time loads it as a same-origin script.

## Phase 0 baseline

Recorded on `main` at version 4.2.0 (`e69f1ce`). `npm run check`: text lint clean on 25 files, 156 tests pass.

### Lighthouse

| Measure | Desktop | Mobile |
| --- | --- | --- |
| Performance score | 100 | 96 |
| First contentful paint | 0.56 s | 2.10 s |
| Largest contentful paint | 0.56 s | 2.40 s |
| Cumulative layout shift | 0 | 0 |
| Total blocking time | 0 ms | 16 ms |
| Total transfer, uncompressed | 412 KB | 412 KB |
| Requests | 14 | 14 |

Transfer by type, uncompressed: scripts 217 KB, stylesheet 42 KB, logo image 78 KB, fonts 47 KB. Only `inter-latin-400-normal.woff2` and `inter-latin-500-normal.woff2` are fetched for the page as shipped; the latin-ext files are not requested.

### Script and stylesheet sizes

| File | Raw | Gzip |
| --- | --- | --- |
| `assets/app.js` | 48,713 B | 14,307 B |
| `assets/catalog.js` | 57,831 B | 14,784 B |
| `assets/ephi-map.js` | 20,210 B | 6,941 B |
| `assets/format.js` | 9,229 B | 3,222 B |
| `assets/report.js` | 61,321 B | 17,113 B |
| `assets/theme.js` | 977 B | 463 B |
| `assets/ward.js` | 22,704 B | 7,456 B |
| `assets/styles.css` | 43,332 B | 9,305 B |
| Total | 264,317 B | 73,591 B |

### Interaction, sample loaded

Median of five runs, with the range in brackets.

| Measure | Result |
| --- | --- |
| DOM nodes after load | 3,054 |
| DOM nodes with the sample open | 6,806 |
| INP while typing in a catalog note | 40 ms (32 to 56) |
| Long tasks while typing | 0 |
| INP switching catalog filters | 64 ms (56 to 72) |
| Long tasks switching filters | 1 (0 to 1) |
| Attach a 10 MB file, until it is listed | 1,513 ms (1,485 to 1,622) |
| Longest task during that attach | 1,110 ms (1,068 to 1,135) |
| Save the full file, 10 MB of evidence | 92 ms (85 to 102) |
| Save the full file, 25 MB of evidence | 239 ms (218 to 263) |

Observations:

- Attaching a large file appeared to block the main thread for over a second. Phase 6 found that this figure measured Playwright handing the file to the page, not the workspace; see the correction below.
- Every keystroke in a note runs `updateDashboard`, which redraws the flow map and the readiness list. It stays under 100 ms on this machine, but it is work the keystroke does not need.
- The catalog draws all 65 rows, so opening the sample more than doubles the node count.

## Changes

Each entry names the change, what was measured before and after with the method above, and whether it was kept. Figures are medians of five runs (Lighthouse: three).

### 1. Smaller interface logo and a separate favicon (kept)

The header used the 4000 by 1008 `SaberGuard_1.png` (80 KB) and the same file as the favicon. It now uses `assets/logo.png` (230 by 55, 11.5 KB) with `width` and `height` set, and `assets/favicon.png` (64 by 64, 6.5 KB). The original stays for the docs site and the printed letterhead.

| Measure | Before | After |
| --- | --- | --- |
| Image transfer on load | 78 KB | 11 KB |
| Lighthouse mobile largest contentful paint | 2.40 s | 2.10 s |
| Lighthouse desktop largest contentful paint | 0.56 s | 0.56 s |

Landed together with the redesign, so the mobile paint figure reflects both. The image saving is attributable to this change alone.

### 2. One view per step (kept)

The workspace drew every step, including all 65 catalog cards, on one page. It now shows one view at a time and renders a view when it is opened. Edits refresh only the open view; the others are marked stale and drawn when you go to them. Dashboard work after an edit is coalesced into one animation frame, and the flow map is drawn only on its own view.

| Measure | Before | After |
| --- | --- | --- |
| DOM nodes after load | 3,054 | 573 |
| DOM nodes with the sample open, catalog shown | 6,806 | 1,321 |
| INP switching catalog filters | 64 ms (56 to 72) | 24 ms (24 to 24) |
| Long tasks switching filters | 1 | 0 |
| INP while typing in a catalog note | 40 ms (32 to 56) | 32 ms (24 to 40) |

The typing figures overlap from run to run, so no typing improvement is claimed. The coalescing and the map change were not measured on their own; they are part of this change.

### 3. Start screen in the initial markup (kept, fixes a regression from change 2)

With views hidden until the script ran, the start screen appeared after load and pushed the footer down: cumulative layout shift 0.5. The start screen is now visible in the HTML, and the rail is hidden by a class on `<body>`.

| Measure | Before | After |
| --- | --- | --- |
| Cumulative layout shift on load | 0.5 | 0 |

### Effect of new features on size

Phases 2 to 4 added evidence hashing, the fingerprint, protected files, the risk analysis fields, the coverage panel, and the new interface. On first load, uncompressed scripts grew from 217 KB to 282 KB and the stylesheet from 42 KB to 55 KB. The sample (38 KB) is loaded only when the start screen asks for it. Total first-load transfer, uncompressed: 412 KB before, 438 KB after.

| File | Raw | Gzip |
| --- | --- | --- |
| `assets/app.js` | 93,255 B | 26,564 B |
| `assets/catalog.js` | 62,921 B | 16,235 B |
| `assets/ephi-map.js` | 20,614 B | 6,998 B |
| `assets/format.js` | 10,753 B | 3,692 B |
| `assets/integrity.js` | 8,031 B | 3,088 B |
| `assets/report.js` | 67,392 B | 18,863 B |
| `assets/theme.js` | 977 B | 463 B |
| `assets/ward.js` | 22,768 B | 7,483 B |
| `assets/styles.css` | 56,184 B | 11,662 B |
| `assets/sample.js`, loaded on request | 38,173 B | 10,604 B |

### Unchanged

| Measure | Baseline | After phases 2 to 4 |
| --- | --- | --- |
| Attach a 10 MB file, until listed | 1,513 ms | 1,508 ms |
| Longest task during that attach | 1,110 ms | 1,074 ms |
| Save, 10 MB of evidence | 92 ms | 102 ms |
| Save, 25 MB of evidence | 239 ms | 250 ms |

Attaching now hashes the file as well, with no measurable cost. The attach figures in this table are corrected in phase 6.

## Phase 6

### Correction to the attach figures

The attach measurements above timed `setInputFiles`, which sends the 10 MB file from Playwright to the page. That transfer, not the workspace, produced the 1.5 s and the one-second long task. The script now creates the file inside the page and hands it to the file input, as a file chooser does. Measured that way on `main` before any phase 6 change, median of five runs:

| Measure | Result |
| --- | --- |
| Attach a 10 MB file, until it is listed | 132 ms (125 to 165) |
| Longest task during that attach | 109 ms (101 to 135) |
| Save, 25 MB of evidence | 256 ms (244 to 295) |
| Open a file holding 25 MB of evidence | 235 ms (228 to 255) |
| Longest task while opening it | 325 ms (315 to 353) |

The cost was base64: 84 ms to encode and 80 ms to decode 10 MB in script, against 7 ms for the browser's own encoder. Hashing 10 MB took 17 ms.

Lighthouse on the same `main`, uncompressed files: desktop largest contentful paint 0.56 s, mobile 2.18 s (2.10 to 2.63), no layout shift. Only `inter-latin-400-normal.woff2` and `inter-latin-500-normal.woff2` are fetched; the latin-ext files are never requested for English content.

### 4. The browser's base64 for evidence (kept)

`SRAIntegrity.toBase64` and `fromBase64` use `Uint8Array.prototype.toBase64` and `Uint8Array.fromBase64` where the browser has them, and the earlier code where it does not. Evidence is encoded on attach and decoded on open, and protected files use the same functions.

| Measure | Before | After |
| --- | --- | --- |
| Attach a 10 MB file, until it is listed | 132 ms (125 to 165) | 56 ms (51 to 59) |
| Longest task during that attach | 109 ms | none over 50 ms |
| Open a file holding 25 MB of evidence | 235 ms (228 to 255) | 112 ms (109 to 118) |
| Longest task while opening it | 325 ms (315 to 353) | 205 ms (199 to 213) |
| Save, 25 MB of evidence | 256 ms (244 to 295) | 286 ms (252 to 297) |

Save did not change beyond run-to-run variance. In the browser the native and earlier encoders give identical output from 0 bytes to 1 MB, and protected files and evidence hashes are unaffected. Node 22 has no native encoder, so the tests exercise the earlier code.

### 5. Preload `inter-latin-400-normal.woff2` (reverted)

| Measure | Before | After |
| --- | --- | --- |
| Lighthouse mobile largest contentful paint | 2.18 s (2.10 to 2.63) | 2.33 s (2.33 to 2.33) |
| Lighthouse desktop largest contentful paint | 0.56 s | 0.56 s |

Within run-to-run variance on mobile and flat on desktop, so it was reverted.

### 6. Scripts in `<head>` with `defer` (reverted)

`theme.js` stayed where it is, since it must set the theme before the first paint; the other seven scripts moved into `<head>` with `defer`.

| Measure | Before | After |
| --- | --- | --- |
| Lighthouse mobile first contentful paint | 2.10 s | 1.50 s |
| Lighthouse mobile largest contentful paint | 2.18 s | 3.41 s |
| Lighthouse desktop largest contentful paint | 0.56 s | 0.72 s |

The first paint came sooner, but the largest paint came much later on both form factors, so it was reverted.

### 7. Size budgets (kept)

`tests/budget.test.mjs` gzips each script and the stylesheet with `node:zlib` and fails if one passes its budget, or if a file is added or removed without a budget. Budgets are the sizes after change 4 plus 10 percent, rounded up to the next 100 bytes. The phase 0 sizes could not serve as the base, since phases 2 to 5 added features on purpose.

| File | Gzip now | Budget |
| --- | --- | --- |
| `assets/app.js` | 26,983 B | 29,700 B |
| `assets/catalog.js` | 16,235 B | 17,900 B |
| `assets/ephi-map.js` | 6,998 B | 7,700 B |
| `assets/format.js` | 3,692 B | 4,100 B |
| `assets/integrity.js` | 3,120 B | 3,500 B |
| `assets/report.js` | 18,863 B | 20,800 B |
| `assets/sample.js` | 10,604 B | 11,700 B |
| `assets/styles.css` | 11,772 B | 13,000 B |
| `assets/theme.js` | 463 B | 600 B |
| `assets/ward.js` | 7,483 B | 8,300 B |

### Not attempted, with the reason

- Holding evidence as `ArrayBuffer` in memory and encoding only on save. After change 4, attaching has no long task and a save with 25 MB of evidence takes 0.29 s, under the 1.5 s target. Moving the encoding to save time would add to the one operation that has a target without a measurable gain elsewhere.
- Encoding in a Worker. The plan made it conditional on save still being slow, and it is not.

### Against the targets

| Target | Result |
| --- | --- |
| Largest contentful paint under 1.5 s, Lighthouse desktop | 0.56 s |
| Cumulative layout shift under 0.05 | 0 |
| INP under 100 ms while typing, sample loaded | 24 ms |
| Full save with 25 MB of evidence under 1.5 s | 0.29 s on this machine. A mid-range laptop was not available to measure. |
