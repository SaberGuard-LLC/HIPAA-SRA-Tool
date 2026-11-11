---
title: The HHS SRA Tool
nav_order: 6
description: How SaberGuard SRA Workspace relates to the HHS Security Risk Assessment Tool, and when to use which.
---

# How this relates to the HHS SRA Tool

SaberGuard SRA Workspace is not the HHS Security Risk Assessment (SRA) Tool. It is not affiliated with or endorsed by HHS, OCR, or ONC, and it does not replace the HHS tool.

## The HHS tool, as its own page describes it

The [Security Risk Assessment Tool](https://www.healthit.gov/topic/privacy-security-and-hipaa/security-risk-assessment-tool) was developed by the Office of the National Coordinator for Health IT (ONC) in collaboration with the HHS Office for Civil Rights (OCR). As its page read on November 11, 2026:

- The current release is version 3.7, a Windows application, with an Excel workbook that presents the same content.
- It guides users "through multiple-choice questions, threat and vulnerability assessments, and asset and vendor management".
- Its target audience is medium and small providers, and it "may not be appropriate for larger organizations".
- Its disclaimer says: "Use of this tool is neither required by nor guarantees compliance with federal, state or local laws."

The disclaimer applies to this workspace as well. No tool makes a risk analysis complete.

## Where the two overlap

The HHS page names three things its tool takes a user through. The workspace has a counterpart to each.

| HHS SRA Tool, per its page | SaberGuard SRA Workspace |
| --- | --- |
| Multiple-choice questions | The catalog review: one row per standard and implementation specification |
| Threat and vulnerability assessments | The risk register |
| Asset and vendor management | The ePHI inventory, which records vendors and business associate agreements on each row |

The workspace's method is organized around the nine elements listed under "Elements of a Risk Analysis" in OCR's [Guidance on Risk Analysis](https://www.hhs.gov/hipaa/for-professionals/security/guidance/guidance-risk-analysis/index.html): scope, data collection, threats and vulnerabilities, current security measures, likelihood, impact, level of risk, documentation, and periodic review.

SaberGuard could not re-read the OCR guidance page on November 11, 2026, so the list of nine elements is carried from notes dated September 30, 2026 and is marked unconfirmed in the [verification log]({{ '/docs/sources/' | relative_url }}).
{: .warning }

## Where they differ

The table compares how each tool runs, how it is organized, and who it is for.

| | HHS SRA Tool | SaberGuard SRA Workspace |
| --- | --- | --- |
| Runs as | A Windows application, or an Excel workbook | A web page, in any current browser |
| Organized by | Multiple-choice questions | The regulation's own standards and implementation specifications, one row each, shown with the regulation text |
| Audience | Medium and small providers | An assessor working for a covered entity or business associate of any size |

The workspace also reflects how SaberGuard works with clients:

- Every status records how it was verified: observed, document reviewed, or stated by the client.
- People, devices, systems, outside parties, and backups are inventoried together with the flows between them, and drawn as a map.
- Each risk is a written statement linked to the inventory rows, flows, and catalog rows it affects, with a treatment decision, an owner, a target date, and a residual rating.
- The report is laid out for signature and prints on a letterhead.
- The assessment is one JSON file that you keep.

For what the HHS tool offers in the five areas listed above, see its page and user guide. This page describes the HHS tool only as far as its own page was read on November 11, 2026.

## When to use the HHS tool, and when to use this workspace

Use the HHS tool when a practice is assessing itself and wants to work through the HHS tool's questions.

Use this workspace when an assessor is doing the work for a client, needs to show the regulation text beside each finding, wants each status tied to how it was verified, and has to deliver a signed report.

The two tools are not exclusive. A practice can complete the HHS tool's questions and an assessor can use those answers as one input here, recorded with the basis "stated by the client".

## No crosswalk to the HHS tool's questions yet

A row-by-row crosswalk between the HHS tool's questions and this catalog is on the [roadmap]({{ '/docs/roadmap/' | relative_url }}). It needs checking against the tool's own user guide first.
