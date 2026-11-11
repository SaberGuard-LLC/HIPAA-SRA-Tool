---
title: Roadmap
nav_order: 11
description: What is planned for the workspace, what is being considered, and what is deliberately left out.
---

# Roadmap

Nothing here is a commitment or a date. It is the order SaberGuard expects to work in.

## Planned next

Encrypted save.
: An option to protect the saved file with a passphrase, using the browser's built-in cryptography. The file holds an organization's weaknesses, and today its protection depends entirely on where the assessor stores it.

Save in place.
: Where the browser supports it, save back to the same file instead of downloading a new copy each time. Fewer stray copies of a sensitive file.

Crosswalk to the HHS SRA Tool.
: A table from the HHS tool's questions to the catalog rows, so a practice's HHS answers can be carried in as "stated by the client". It needs checking against the tool's user guide first.

Compare with last year.
: Open a previous assessment beside the current one and list what changed: statuses, new and closed risks, inventory rows added or retired.

Remediation export.
: The roadmap and the findings as CSV, for the tracker the client already uses.

## Under consideration

Readiness view for the proposed rule.
: The January 2025 proposal (90 FR 898) would revise the existing standards and implementation specifications. It is not final. A separate, clearly labelled view could show how an assessment would stand against it without changing the assessment itself.

Per-section threat prompts.
: Suggested threats and vulnerabilities beside each section of the catalog, in addition to the scenario library.

More than one location.
: Scope and inventory split by site for organizations with several.

A single-file build.
: The whole workspace as one HTML file for assessors who work offline or on restricted machines.

An accessibility audit.
: A full review against WCAG 2.2 AA with assistive technology. None has been done yet.

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

Open an [issue](https://github.com/SaberGuard-LLC/HIPAA-SRA-Tool/issues/new/choose). For anything about what the regulation says, include the citation.
