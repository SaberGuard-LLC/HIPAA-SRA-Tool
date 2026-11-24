# Performance log

Every performance change follows the same loop: measure, change one thing, measure again, keep it or revert it. Every attempt is logged here, kept or reverted.

## How to measure

Interaction figures come from `scripts/measure-perf.mjs`. It serves the repository on a local port, opens `index.html` in Chromium through Playwright, and repeats each run five times (set `RUNS` to change it). Each run:

1. loads the page and records largest contentful paint, layout shift, and the DOM node count;
2. opens the sample assessment and moves to the catalog review, then records the node count again;
3. types 21 characters into the first catalog note, 60 ms apart;
4. switches the catalog filter three times: Gaps, Technical, All;
5. attaches a 10 MB file to the first catalog row;
6. saves the full file, then attaches 15 MB more and saves again with 25 MB of evidence.

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

- Attaching a large file blocks the main thread for over a second. The file is read into a base64 data URL and the catalog is redrawn with it.
- Every keystroke in a note runs `updateDashboard`, which redraws the flow map and the readiness list. It stays under 100 ms on this machine, but it is work the keystroke does not need.
- The catalog draws all 65 rows, so opening the sample more than doubles the node count.

## Changes

Each entry names the change, what was measured before and after with the method above, and whether it was kept. Figures are medians of five runs (Lighthouse: three).

### 1. Smaller interface logo and a separate favicon (kept)

The header used the 4000 by 1008 `SaberGuard_1.png` (80 KB) and the same file as the favicon. It now uses `assets/logo.png` (230 by 55, 11.5 KB) with `width` and `height` set, and `assets/favicon.png` (64 by 64, 6.5 KB). The original stays for the README, the docs site, and the printed letterhead.

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

Attaching now hashes the file as well, with no measurable cost. The long task on attach remains: the file is still held as a base64 data URL.

## Not yet attempted

These items from the 5.0.0 plan have not been tried, so there is nothing to keep or revert yet: holding evidence as `ArrayBuffer` and encoding only on save (the next candidate, given the attach long task), preloading only `inter-latin-400-normal.woff2`, moving the scripts into `<head>` with `defer`, and a size budget test.
