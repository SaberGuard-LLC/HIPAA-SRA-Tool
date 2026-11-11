---
title: The HHS SRA Tool
nav_order: 6
description: How SaberGuard SRA Workspace relates to the HHS Security Risk Assessment Tool, and when to use which.
---

# How this relates to the HHS SRA Tool

SaberGuard SRA Workspace is not the HHS Security Risk Assessment (SRA) Tool. It is not affiliated with or endorsed by HHS, OCR, or ONC, and it does not replace the HHS tool.

## The HHS tool

The [Security Risk Assessment Tool](https://www.healthit.gov/topic/privacy-security-and-hipaa/security-risk-assessment-tool) was developed by the Office of the National Coordinator for Health IT (ONC) in collaboration with the HHS Office for Civil Rights (OCR). As its page read on November 11, 2026:

- The current release is version 3.7, a Windows application, with an Excel workbook that presents the same content.
- It guides users "through multiple-choice questions, threat and vulnerability assessments, and asset and vendor management".
- Its target audience is medium and small providers, and it "may not be appropriate for larger organizations".
- Its disclaimer says: "Use of this tool is neither required by nor guarantees compliance with federal, state or local laws."

That last sentence applies to this workspace as well. No tool makes a risk analysis complete.

## What is the same

Both exist to help an organization meet the same requirement, the risk analysis at 45 CFR 164.308(a)(1)(ii)(A), and both cover the same ground:

- where ePHI is, in assets and with vendors;
- the safeguards in 45 CFR 164.308, 164.310, 164.312, 164.314, and 164.316;
- threats and vulnerabilities, rated by likelihood and impact;
- a report at the end.

The workspace's method is organized around the nine elements listed under "Elements of a Risk Analysis" in OCR's [Guidance on Risk Analysis](https://www.hhs.gov/hipaa/for-professionals/security/guidance/guidance-risk-analysis/index.html): scope, data collection, threats and vulnerabilities, current security measures, likelihood, impact, level of risk, documentation, and periodic review.

## What is different

| | HHS SRA Tool | SaberGuard SRA Workspace |
| --- | --- | --- |
| Runs as | A Windows application, or an Excel workbook | A web page, in any current browser |
| Organized by | Multiple-choice questions | The regulation's own standards and implementation specifications, one row each, shown with the regulation text |
| Audience | Medium and small providers | An assessor working for a covered entity or business associate of any size |

The workspace also does some things because of how SaberGuard works with clients:

- Every status records how it was verified: observed, document reviewed, or stated by the client.
- People, devices, systems, outside parties, and backups are inventoried together with the flows between them, and drawn as a map.
- Each risk is a written statement linked to the inventory rows, flows, and catalog rows it affects, with a treatment decision, an owner, a target date, and a residual rating.
- The report is laid out for signature and prints on a letterhead.
- The assessment is one JSON file that you keep.

For what the HHS tool offers in each of these areas, see its page and user guide. This page describes the HHS tool only as far as its own page was read on the date above.

## Which to use

Use the HHS tool when a practice is assessing itself and wants the government's own questions.

Use this workspace when an assessor is doing the work for a client, needs to show the regulation text beside each finding, wants each status tied to how it was verified, and has to deliver a signed report.

They are not exclusive. A practice can complete the HHS tool's questions and an assessor can use those answers as one input here, recorded with the basis "stated by the client".

## What is not here yet

A row-by-row crosswalk between the HHS tool's questions and this catalog is on the [roadmap]({{ '/docs/roadmap/' | relative_url }}). It will be added once it has been checked against the tool's own user guide.
