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

None yet.
