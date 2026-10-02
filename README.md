# SaberGuard SRA Workspace

A workspace for documenting a HIPAA Security Rule risk analysis. Published by SaberGuard LLC.

This is not the HHS Security Risk Assessment (SRA) Tool, is not affiliated with or endorsed by HHS, OCR, or ONC, and does not replace the HHS SRA Tool (https://www.healthit.gov/topic/privacy-security-and-hipaa/security-risk-assessment-tool). HHS states that use of its own tool is neither required by nor guarantees compliance with federal, state or local laws.

## What it is

A static page that runs in the browser. There is nothing to install and no account. It has no backend, trackers, cookies, or browser storage. Work exists only in the current tab until the assessor saves a JSON file or prints the report.

With it an assessor can:

- record the organization, scope, environment, method, and the entity profile (covered entity or business associate, clearinghouse within a larger organization, group health plan), which marks the rows that do not apply as Not applicable with the basis recorded;
- inventory the people, devices, systems, outside parties, and backups that store, receive, maintain, or transmit ePHI, with kind, zone, lifecycle, vendor, business associate agreement, location, encryption at rest, and multi-factor authentication, and the data flows between them;
- review the Security Rule standards and implementation specifications in 45 CFR 164.308, 164.310, 164.312, 164.314, and 164.316, with notes, recommendations, attached evidence, and the basis on which each status was verified (observed, document reviewed, or stated by the client);
- see an ePHI flow map drawn from the inventory and flows: three columns (people and devices in the practice, the systems that hold ePHI with backups listed inside them, outside parties), direct-entry flows left out, a label only on flows that are not encrypted or not checked, and one tag per finding using the risk register reference. The same map prints in section 04 of the report. The layout is deterministic: the same file produces the same drawing;
- build a risk register with likelihood and impact ratings, treatment decisions, owners, target dates, and residual ratings, each risk linked to the inventory rows, data flows, and catalog rows it affects, starting from a risk scenario library where useful;
- print a formatted report, or save as PDF, with a draft watermark until the completeness checks pass and the status is set to Final.

## What it is not

It is not a scanner, it does not test systems, and it does not decide anything. It records the assessor's work and judgment. Using it does not by itself make a risk analysis complete, and it does not establish compliance with the HIPAA Security Rule. It is not legal advice.

## Quick start

```bash
git clone https://github.com/SaberGuard-LLC/HIPAA-SRA-Tool.git
cd HIPAA-SRA-Tool
open index.html   # or double-click the file
```

Or use the hosted copy at <https://saberguard-llc.github.io/HIPAA-SRA-Tool/>. Open `samples/example-health-clinic-hipaa-sra-2026-09-06.json` with the **Open** button to see a filled-in assessment and its report. The sample is fictitious.

### Printing a PDF

1. Click **Print / PDF** (or press Ctrl/Cmd+P from anywhere in the workspace).
2. Choose **Save as PDF**, paper size **Letter**.
3. Turn off "Headers and footers" so the browser's URL and timestamp do not print. Background colors are forced on by the report styles.

## The catalog

The catalog has one row per standard, one row per titled implementation specification, and one row for the untitled implementation specifications paragraph at 45 CFR 164.314(b)(2). 164.308(b)(1) is counted as a standard because Appendix A to Subpart C lists it as one; 164.308(b)(2) has no heading and is shown with it. Under this convention there are 65 catalog rows: 22 standards, 21 Required implementation specifications, and 22 Addressable implementation specifications. The regulation itself states no total. The count is SaberGuard's convention. Every displayed count is derived from the catalog.

Each row carries the regulation's own wording and, separately, a plain-language summary labelled as SaberGuard's. A test compares the regulation wording on every row with the official text kept in `tests/fixtures/`.

An addressable implementation specification is not optional. The covered entity or business associate must assess whether it is reasonable and appropriate in its environment; implement it if it is; and if it is not, document why and implement an equivalent alternative measure if one is reasonable and appropriate (45 CFR 164.306(d)(3)). The workspace records this with two statuses available on addressable rows only: "Alternative measure in place" and "Not implemented, decision documented". Both need a note. A Not applicable response likewise needs a recorded basis, which the report prints.

## Scoring

Likelihood and impact are each rated 1 to 5. Inherent risk is likelihood multiplied by impact: Low 1 to 7, Medium 8 to 14, High 15 to 25. The implementation score is (met + alternative measure + half of partial) divided by the applicable rows reviewed; rows rated Not applicable or Not implemented, decision documented are left out. These scales and thresholds are SaberGuard's own. The implementation score is a progress measure, not a compliance score.

## Review frequency

The HIPAA Security Rule sets no fixed interval for a risk analysis. It requires the security measures to be reviewed and modified as needed (45 CFR 164.306(e)), documentation to be reviewed periodically and updated in response to environmental or operational changes (45 CFR 164.316(b)(2)(iii)), and periodic evaluation (45 CFR 164.308(a)(8)). The workspace has a "Next planned review" field that the organization sets.

## Data handling

- The application does not use `localStorage`, `sessionStorage`, IndexedDB, cookies, analytics, or network APIs. A Content Security Policy meta tag in `index.html` blocks network connections from the page; `vercel.json` sets the same policy and related headers on a Vercel deployment. GitHub Pages does not apply the headers.
- Unsaved work is held in memory and is lost when the tab is closed or reloaded. The browser warns before you leave if there are edits since the last save or open.
- Evidence attachments are limited to 10 MB per file and 25 MB per assessment. Evidence must not show patient identifiers; the workspace warns at the attach control. "Save file without evidence" writes the assessment with the names and sizes of attachments but not the files themselves.
- A row or flow flagged for a missing or unconfirmed business associate agreement, encryption at rest or in transit, or multi-factor authentication must be linked to a risk before the report leaves draft. Appendix B lists any that are not.
- Saved files use format version 4. Files saved by earlier versions open without loss: the three old 164.314 rows (O01 to O03) move to the current rows O12, O13 and O15, free-text risk links are kept as legacy notes beside the new id lists, and answers on rows whose citation or regulation text changed are marked "carried from version 3, review again" and count as not reviewed until the assessor confirms them. Rows added since version 3 open as not reviewed, so a complete version 3 file opens as incomplete.
- Saved JSON files and printed reports contain sensitive security details. Store them only in an approved encrypted location.
- The Security Rule requires documentation, including the risk analysis, to be retained for 6 years from the date of its creation or the date when it last was in effect, whichever is later (45 CFR 164.316(b)(2)(i)). State law or contracts may require longer.

## Project layout

```
index.html            Workspace markup
assets/styles.css     Workspace, report preview, and print styles
assets/catalog.js     Security Rule catalog, statuses, rating scales, risk scenario library, completeness checks
assets/app.js         Workspace logic, JSON save and open, print handling
assets/report.js      Metrics and the report renderer
samples/              Fictitious example assessment
scripts/lint-text.mjs Text lint run in CI
tests/                Tests (node --test) and the regulation fixture
VERIFICATION.md       Every regulatory statement that ships, with its source and the date checked
```

Run `npm run check` to run the text lint and the tests. There are no runtime dependencies.

## References

- [45 CFR Part 164, Subpart C](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-C)
- [HHS OCR Guidance on Risk Analysis](https://www.hhs.gov/hipaa/for-professionals/security/guidance/guidance-risk-analysis/index.html)
- [HHS Security Risk Assessment (SRA) Tool](https://www.healthit.gov/topic/privacy-security-and-hipaa/security-risk-assessment-tool)

## License

Code is released under the MIT License. See [LICENSE](LICENSE). The SaberGuard name and logo are not covered by that license.
