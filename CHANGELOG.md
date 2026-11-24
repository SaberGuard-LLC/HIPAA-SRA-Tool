# Changelog

Notable changes to SaberGuard SRA Workspace. Versions follow [semantic versioning](https://semver.org/). The major version tracks the saved file format.

## [5.0.0] - Unreleased

Version 5.0.0 is in progress. The work is tracked in the 5.0.0 milestones on GitHub.

### Changed
- File format version 5. Files from versions 1, 3, and 4 open without loss and save as version 5.
- The license is now the [PolyForm Shield License 1.0.0](LICENSE). Anyone may use, modify, and run the workspace, including an organization assessing itself. Selling it, hosting it as a service, or using it to compete with SaberGuard's products and services, including paid risk assessments, needs a commercial license. Versions up to and including 4.2.0 remain available under the MIT License.
- `package.json` declares `SEE LICENSE IN LICENSE`, because PolyForm Shield has no SPDX identifier.

### Added
- Every evidence file records its SHA-256, the date it was attached, and whether it came from an upload or from Ward. The catalog row shows a shortened hash, and Appendix A of the report prints the full value with the source and date. Files opened from earlier versions are hashed when they are opened, if their contents are embedded, and an embedded file that no longer matches its recorded hash is marked.
- An assessment file fingerprint: a SHA-256 over the assessment's contents, including every evidence hash. The report prints the first 16 characters on the cover and in section 01, and the full value in Appendix B. Step 7 shows the fingerprint of the open assessment, and `scripts/fingerprint.mjs` computes it for a saved file.
- **Save protected file**: the assessment encrypted with AES-256-GCM, with a key derived from a passphrase of at least 12 characters by PBKDF2-SHA-256 with 600,000 iterations. **Open** asks for the passphrase. A wrong passphrase or a changed file opens nothing.
- Save in place: in Chrome and Edge, later saves write to the file chosen at the first save instead of downloading a new copy.
- Each risk names its threat and its vulnerability in their own fields, and which of confidentiality, integrity, and availability it affects. The 18 scenarios in the library fill all three. A risk carried from version 4 keeps its statement and shows a prompt to split it. A new check, "Every risk names a threat and a vulnerability", is advisory in 5.0.0: it is shown in step 7 and Appendix B but does not hold the report in draft. It will become a completeness check in a later release.
- A coverage panel in the risk register: inventory rows considered, flagged rows and flows linked to an open risk, catalog gaps linked to a risk, and risks with an owner and a target date, each with the list of what is missing. An inventory row can record why no reasonably anticipated threat applies. Appendix B prints the four figures.
- An interview and document log in step 1, printed in the report's methodology section.
- **Export CSV** in the risk register: the remediation plan as RFC 4180 CSV, UTF-8 with a byte order mark, with formula-like values neutralized.
- The sample is now a version 5 assessment with threats and vulnerabilities on its risks, an interview log, and evidence hashes.
- `PERF.md`, with the baseline measurements and `scripts/measure-perf.mjs`.
- `CONTRIBUTING.md`, and an updated security policy.
- Security scanning on every pull request and push to `main`: Semgrep, gitleaks over the full history, actionlint and zizmor for the workflows, dependency review, and OpenSSF Scorecard. CodeQL also analyzes the workflows. Every action is pinned to a commit.
- A release workflow that publishes a GitHub release from the changelog, with a zip of the workspace and its SHA-256.

## [4.2.0] - 2026-11-11

More from a Ward evidence file: inventory rows and draft risks, offered for the assessor to add, and no repeat attachments when nothing changed.

### Added
- A Ward evidence file that lists the services, devices, and mail domains Ward saw now offers them as inventory rows: Microsoft 365 or Google Workspace, each managed device, and any mail domain delivered elsewhere. Nothing is added until you press **Add to the inventory**. Each row carries what Ward observed in its notes and leaves the ePHI held and the lifecycle stages blank, so the inventory check stays open until you confirm the row or remove it.
- Open Ward findings (not rejected in review) are offered as draft risks, linked to their catalog row and to the inventory rows Ward can name. Likelihood, impact, owner, target date, and treatment are left blank. A finding already in the register (its description still names "Ward finding" and the rule id) is not offered again.
- `attachWardEvidence(file, { confirmName: false })` for a host that fetched the file for the assessment's own client, and it now returns what it attached and what it offered.

### Changed
- A newer Ward collection that says the same thing about a row as the attachment already there (same outcome, rules, findings, and fact values) is not attached again, and the status line names those rows as unchanged.
- Attaching Ward evidence that adds nothing no longer marks the assessment as having unsaved changes.

## [4.1.0] - 2026-11-11

Regulation text on every row, a flat light and dark design, and a report laid out for letterhead and signature.

### Added
- The official eCFR text of 45 CFR Part 164, Subpart C (issue of November 5, 2026) is kept in `tests/fixtures/`, and all 65 catalog rows are compared with it by test. The 40 rows that printed a summary in place of the regulation wording now print the regulation.
- The comparison also fails if the regulation has a standard or a titled implementation specification that the catalog has no row for.
- Dark theme, from the toggle in the top bar. Light stays the default. The choice is kept in the address as `?theme=dark`, not in browser storage.
- Letterhead for the report, set in step 7: a firm letterhead with name, address, contact line, and logo, or blank space at the top of the cover for pre-printed letterhead paper. The default report still carries no logo.
- Running header, footer, and "Page 2 of 41" numbering in the page margins, in browsers that support CSS page margin boxes.
- A signature block with a signature line, printed name and title, and date line for the lead assessor, the security official, and the executive approver, kept together on one page.
- An unsaved-changes indicator in the top bar, Ctrl or Cmd + S to save, and a skip link.
- A local network transport option for data flows.
- Documentation site at <https://saberguard-llc.github.io/HIPAA-SRA-Tool/docs/>.
- Security policy, issue templates, a pull request template, and a check that builds the documentation the way GitHub Pages does.

### Changed
- The workspace is restyled: flat, no gradients or shadows, two font weights, sentence case throughout, and interface text no smaller than 11 px. Inter is bundled so type renders the same on every machine and in print.
- The sample is now a complete version 4 assessment with a typed inventory, 13 data flows, linked risks, and a verification basis on every row. It prints as Final.
- The report cover stays on one page. A draft cover states how many checks are open and points to Appendix B.
- Completeness marks read "Done" and "Open" in words.
- The Content Security Policy allows fonts from the page's own folder.
- `tests/`, `scripts/`, and the Markdown files at the repository root are no longer published to GitHub Pages.

### Fixed
- The regulation comparison test failed on `main` because the official text had never been retrieved, and its parser did not match the published markup.

## [4.0.0] - 2026-11-02

The state of `main` before this changelog began.

### Added
- File format version 4: an entity profile, typed inventory rows, data flows, risks linked by id, and a verification basis on every catalog row. Earlier files open without loss.
- The ePHI flow map, drawn from the inventory and flows, in the workspace and in section 04 of the report.
- Ward evidence import, formats 1 and 2.
- A hosting seam on `window.SRA`: `snapshot()`, `importAssessment()`, `markSaved()`, and `isDirty()`.
- A catalog of 65 rows with the regulation wording kept separate from SaberGuard's summaries, and a verification log.

[5.0.0]: https://github.com/SaberGuard-LLC/HIPAA-SRA-Tool/compare/e69f1ce...HEAD
[4.2.0]: https://github.com/SaberGuard-LLC/HIPAA-SRA-Tool/compare/5ac4490...e69f1ce
[4.1.0]: https://github.com/SaberGuard-LLC/HIPAA-SRA-Tool/compare/0cbf5e5...5ac4490
[4.0.0]: https://github.com/SaberGuard-LLC/HIPAA-SRA-Tool/commit/0cbf5e5
