---
title: Roadmap
nav_order: 13
description: What is planned for version 5.0.0 and later, what is being considered, and what is deliberately left out.
---

# Roadmap

Nothing here is a commitment or a date. It is the order SaberGuard expects to work in. The work is tracked in [issues labelled 5.0.0](https://github.com/SaberGuard-LLC/HIPAA-SRA-Tool/issues?q=label%3A5.0.0).

## Version 5.0.0, in progress

Version 5.0.0 changes the saved file format to version 5. Files from every earlier version will still open without loss, and a version 4 file marked Final will still print as Final.

### License

Done, pending release: the license changes to the [PolyForm Shield License 1.0.0]({{ '/docs/license/' | relative_url }}). Version 4.2.0 is the last release under the MIT License, published as the `v4.2.0` release so it is easy to find.

### Built on the development branch

The following are built on the `v5-assessor-desk` branch and tested, and are not released yet:

- SHA-256 for every evidence file, recorded with the date added and the source, shown in the catalog and printed in Appendix A.
- An assessment fingerprint on the report cover and in Appendix B, tying a signed PDF to its JSON file.
- Passphrase-protected save with AES-256-GCM and a PBKDF2 key, and save in place in Chrome and Edge.
- A threat, a vulnerability, and the affected properties on every risk, with an advisory check that becomes required in a later release.
- A coverage panel, an interview and document log, and a remediation plan CSV export.
- A redesigned interface: a start screen, an overview, one view per step with its own address, a catalog review laid out as a list beside the selected row with keyboard shortcuts, and a risk register table with a heat map. An automated accessibility check with axe reports no violations in either theme. See [accessibility]({{ '/docs/accessibility/' | relative_url }}).

### Still to do for 5.0.0

- A review with VoiceOver and NVDA, done by a person.
- For hosts: `SRA.configure({ embedded: true })` to hide the start screen and the save controls when a host's own interface owns saving, and `sra:dirty` and `sra:saved` events.
- The remaining performance work in `PERF.md`: holding evidence as bytes until save, font preloading, and size budgets.
- Deployment: one canonical address, aligned security headers, and share images.

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
