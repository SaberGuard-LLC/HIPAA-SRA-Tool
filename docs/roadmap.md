---
title: Roadmap
nav_order: 12
description: What is planned for version 5.0.0 and later, what is being considered, and what is deliberately left out.
---

# Roadmap

Nothing here is a commitment or a date. It is the order SaberGuard expects to work in. The work is tracked in [issues labelled 5.0.0](https://github.com/SaberGuard-LLC/HIPAA-SRA-Tool/issues?q=label%3A5.0.0).

## Version 5.0.0, in progress

Version 5.0.0 changes the saved file format to version 5. Files from every earlier version will still open without loss, and a version 4 file marked Final will still print as Final.

### License

Done on the development branch: the license changes to the [PolyForm Shield License 1.0.0]({{ '/docs/license/' | relative_url }}). Version 4.2.0 is the last release under the MIT License, published as the `v4.2.0` release so it is easy to find.

### Evidence integrity and file protection

SHA-256 for every evidence file.
: Each attachment records its SHA-256 hash, the date it was added, and whether it came from an upload or from Ward. The catalog row shows a shortened hash and the report's evidence index prints the full value. Files saved by older versions get a hash when they are opened, if the file's contents are embedded.

Assessment fingerprint.
: A SHA-256 over the assessment's contents, printed on the report cover and in an appendix, ties a signed PDF to the JSON file it came from.

Passphrase-protected save.
: Save a file encrypted with AES-256-GCM, with a key derived from a passphrase of at least 12 characters. A lost passphrase cannot be recovered. Opening the file asks for the passphrase; a wrong one gives a clear error and loads nothing.

Save in place.
: Where the browser supports it, later saves write back to the same file instead of downloading a new copy.

### Risk analysis

Threat and vulnerability on every risk.
: Each risk names its threat source and event, the vulnerability, and which of confidentiality, integrity, and availability it affects. The scenario library fills them in. A new completeness check for them is advisory in 5.0.0 and will become required in a later release.

Coverage.
: A panel in the risk register shows which inventory rows, flagged rows and flows, and catalog gaps are linked to a risk, and which risks have an owner and a target date. An inventory row can instead record why no reasonably anticipated threat applies.

Interview and document log.
: A table in step 1 of participants, roles, dates, topics, and method (interview, walkthrough, or document review), printed in the report's methodology section.

Remediation plan export.
: The risk register's treatment plan as a CSV file for the tracker the client already uses.

### Interface

- One view per step, with a start screen, an overview of readiness and progress, and a step rail that shows each step's status in words.
- A catalog review laid out as a list beside the selected row, with search, filters with counts, and keyboard shortcuts.
- A risk register table with a heat map and the coverage panel.
- A full accessibility review against WCAG 2.2 AA, with axe, keyboard-only use, VoiceOver, and NVDA. Findings will be recorded in these pages.

### For hosts

- `SRA.configure({ embedded: true })` to hide the start screen and the save controls when a host's own interface owns saving.
- `sra:dirty` and `sra:saved` events, and `SRA.navigate(step)`.

### Performance

Each change will be measured before and after, and kept only if it helps: a smaller logo, less work while typing, rendering only the current step, faster saves with large evidence, and size budgets enforced by test.

## Planned after 5.0.0

Crosswalk to the HHS SRA Tool.
: A table from the HHS tool's questions to the catalog rows, so a practice's HHS answers can be carried in as "stated by the client". It needs checking against the tool's user guide first.

Compare with last year.
: Open a previous assessment beside the current one and list what changed: statuses, new and closed risks, inventory rows added or retired.

## Under consideration

Readiness view for the proposed rule.
: The January 2025 proposal (90 FR 898) would revise the existing standards and implementation specifications. It is not final. A separate, clearly labelled view could show how an assessment would stand against it without changing the assessment itself.

Per-section threat prompts.
: Suggested threats and vulnerabilities beside each section of the catalog, in addition to the scenario library.

More than one location.
: Scope and inventory split by site for organizations with several.

A single-file build.
: The whole workspace as one HTML file for assessors who work offline or on restricted machines. Until then, each release includes a zip of the workspace that runs from a folder.

## Deliberately left out

Accounts, a server, or cloud storage in this repository.
: The public page keeps nothing and talks to nothing. A host that wants storage can add it through the [hosting seam]({{ '/docs/file-format/' | relative_url }}).

Automatic scoring of compliance.
: The workspace records an assessor's judgment. It does not issue one.

Scanning or testing.
: Evidence from scanners and configuration collectors is attached, not gathered here.

Electronic signatures.
: The report is signed by hand.

Analytics.
: Of any kind.

## Suggesting a change

Open an [issue](https://github.com/SaberGuard-LLC/HIPAA-SRA-Tool/issues/new/choose). For anything about what the regulation says, include the citation. See [CONTRIBUTING.md](https://github.com/SaberGuard-LLC/HIPAA-SRA-Tool/blob/main/CONTRIBUTING.md) before opening a pull request.
