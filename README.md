# HIPAA Security Risk Assessment (SRA) Tool

![SaberGuard Logo](SaberGuard_1.png)

[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)
[![Live tool](https://img.shields.io/badge/Live-GitHub%20Pages-blue)](https://saberguard-llc.github.io/HIPAA-SRA-Tool/)
[![Compliance](https://img.shields.io/badge/HIPAA-Security%20Rule%20SRA-teal)]()

A **local-first HIPAA Security Risk Assessment workspace** created by [SaberGuard](https://saberguard.tech). It runs entirely in the browser with no backend, trackers, cookies, or browser storage. Work exists only in the current tab until the assessor downloads a portable JSON assessment file or prints the report.

This is the same tool SaberGuard uses for its own annual risk analysis and for client engagements. It is open source so anyone can see exactly how the assessment is structured, what is tested, and how the report is produced.

## What it produces

**Print / Save as PDF** generates a formal risk assessment report, not a printout of the entry form:

| Section | Contents |
|---|---|
| Cover | Organization, review period, assessment date, assessor, security official, approver, version, classification |
| 01 Document control | Version history block, contents, distribution and handling, next review due, six-year retention note |
| 02 Executive summary | Assessor narrative (or auto-generated summary), implementation score, safeguard status by category, priority gaps, highest-rated risks |
| 03 Scope, environment & methodology | Organization profile, scope statement, environment, methodology, five-step approach, rating definitions for status, likelihood, impact, and risk level |
| 04 ePHI inventory | Systems, locations, and vendors that create, receive, maintain, or transmit ePHI |
| 05 Safeguard evaluation results | Summary by category and the full matrix of all 61 safeguards with citation, type, status, notes, and evidence count |
| 06 Findings & recommendations | One finding per partial or unmet safeguard with finding, recommendation, evidence, and linked risks; applicability basis for every N/A |
| 07 Risk register & analysis | 5×5 heat map, register sorted by score, and a detail card per risk with affected assets, linked safeguards, existing controls, treatment, and residual rating |
| 08 Remediation roadmap | Open actions in priority order with owner, target date, and status |
| 09 Management review & attestation | Assessor statement, management statement, signature blocks for assessor, security official, and executive approver |
| Appendix A | Evidence index |
| Appendix B | Assessment completeness checks |

The report carries a running header and footer, a **DRAFT** watermark until all readiness checks pass, and forces status colors to print.

## Features
- Guided, plain-language review of all 61 Security Rule standards and implementation specifications in 45 CFR 164.308, 164.310, 164.312, 164.314, and 164.316
- ePHI system and data-flow inventory to establish assessment scope
- Per-safeguard status, assessment notes, recommendation, and local evidence attachments
- Filterable gap review, live progress, and six readiness checks
- Risk register with likelihood × impact scoring, treatment decision, owner, target date, status, residual rating, and links to safeguards; a threat library pre-fills common scenarios
- Management attestation block for executive sign-off
- On-screen report preview that matches the printed output
- Portable JSON export/import (responses, risk records, and attached evidence); older export formats still open
- **No data leaves the tab unless the assessor chooses to download or print it**

## Quick start
```bash
git clone https://github.com/SaberGuard-LLC/HIPAA-SRA-Tool.git
cd HIPAA-SRA-Tool
open index.html   # or double-click in Finder/Explorer
```
Or use the hosted copy at <https://saberguard-llc.github.io/HIPAA-SRA-Tool/>. Open `samples/example-health-clinic-hipaa-sra-2026-09-06.json` with the **Open** button to see a completed assessment and its report.

### Printing a clean PDF
1. Click **Print / PDF** (or press Ctrl/Cmd+P from anywhere in the workspace).
2. Choose **Save as PDF**, paper size **Letter**.
3. Turn **off** "Headers and footers" so the browser's URL and timestamp do not print. Background colors are forced on by the report styles.

### Deploying
- **GitHub Pages:** Settings → Pages → Deploy from branch → `main` → `/ (root)`.
- **Vercel:** import the repository and deploy as-is. `vercel.json` serves the static app with a strict Content Security Policy. No environment variables, database, or server functions are required.

## Project layout
```
index.html            Workspace markup
assets/styles.css     Workspace, report preview, and print styles
assets/catalog.js     Security Rule catalog, rating scales, threat library, readiness checks
assets/app.js         Workspace logic, JSON save/open, print handling
assets/report.js      Metrics and the report renderer
samples/              Example completed assessment
```

## Data handling
- The application does not use `localStorage`, `sessionStorage`, IndexedDB, cookies, analytics, or network APIs.
- Unsaved work is held in JavaScript memory and is lost when the tab is closed or refreshed. The browser warns before you leave with unsaved work.
- Evidence attachments are limited to 10 MB per file and 25 MB per assessment to avoid exhausting browser memory.
- JSON files and printed reports contain sensitive security details. Store them only in an approved encrypted location and follow the client's retention and access-control policies.

## Scope and interpretation
The catalog includes the Security Rule's standards and required/addressable implementation specifications, including organizational requirements and applicability-dependent provisions. An **addressable** specification is not optional: assessors must determine whether it is reasonable and appropriate, implement an equivalent alternative when appropriate, and document the decision. An **N/A** response likewise needs a documented applicability basis, which the report prints.

Risk scoring uses a 1–5 likelihood and 1–5 impact scale (definitions are printed in the report). Inherent risk = likelihood × impact: Low 1–7, Medium 8–14, High 15–25. The implementation score is (met + ½ partial) ÷ applicable safeguards reviewed.

The Security Rule requires risk analysis and periodic evaluation; it does not prescribe one universal annual checklist. SaberGuard presents the catalog as an annual workflow because annual reassessment is a practical baseline, but organizations must also reassess when environmental or operational changes affect ePHI security. This tool supports, but cannot by itself establish, a complete risk analysis: assessors must identify all ePHI, threats, vulnerabilities, existing measures, likelihood, impact, and risk treatment within the organization's actual scope.

Authoritative references: [45 CFR Part 164, Subpart C](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-C), [HHS Security Risk Assessment guidance](https://www.hhs.gov/hipaa/for-professionals/security/guidance/guidance-risk-analysis/index.html), and [HHS Security Rule guidance](https://www.hhs.gov/hipaa/for-professionals/security/guidance/index.html).

## Disclaimer
This tool is provided **"as-is"** for educational and compliance support purposes. It does **not** constitute legal advice. Covered Entities and Business Associates are responsible for validating results with legal/compliance professionals. HIPAA requires SRA documentation retention for **6 years**.

## License
Open-sourced under the MIT License. See [LICENSE](LICENSE) for details.

---

💜 Made with care by **SaberGuard** - empowering small teams and HIPAA-regulated providers with transparent, secure tools.
