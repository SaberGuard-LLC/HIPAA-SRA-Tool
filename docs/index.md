---
title: Home
nav_order: 1
description: SaberGuard SRA Workspace is a browser workspace for documenting a HIPAA Security Rule risk analysis.
---

<p align="center">
  <img class="plain" src="{{ '/SaberGuard_1.png' | relative_url }}" width="300" alt="SaberGuard logo">
</p>

# SaberGuard SRA Workspace
{: .text-center }

Document a HIPAA Security Rule risk analysis in the browser, then print a report laid out for signature.
{: .fs-6 .fw-300 .text-center }

[Open the workspace]({{ '/' | relative_url }}){: .btn .btn-primary .mr-2 }
[Get started]({{ '/docs/getting-started/' | relative_url }}){: .btn }
{: .text-center }

---

<p align="center">
  <img src="{{ '/docs/assets/screenshots/workspace-light.png' | relative_url }}" width="760" alt="The workspace in the light theme, showing the overview and the first step">
</p>

This is not the HHS Security Risk Assessment (SRA) Tool. It is published by SaberGuard LLC, is not affiliated with or endorsed by HHS, OCR, or ONC, and does not replace the HHS tool. See [how it relates to the HHS SRA Tool]({{ '/docs/hhs-sra-tool/' | relative_url }}).
{: .note }

## What the workspace records and prints

Record the scope.
: The organization, the review period, the entity profile (covered entity, business associate, clearinghouse, group health plan), the method, and who took part.

Inventory where ePHI lives and moves.
: Every person, device, system, outside party, and backup that stores, receives, maintains, or transmits ePHI, and the data flows between them. The workspace draws the flow map from those rows.

Review the Security Rule.
: 65 catalog rows covering the standards and implementation specifications in 45 CFR 164.308, 164.310, 164.312, 164.314, and 164.316. Each row shows the regulation's own wording, compared by test with the official eCFR text.

Rate and treat risks.
: A risk register with likelihood and impact from 1 to 5, a treatment decision, an owner, a target date, and the expected residual rating. Each risk links to the inventory rows, flows, and catalog rows it affects.

Print the report.
: A report with a cover, document control, executive summary, findings, risk register, remediation roadmap, and a signature page. It prints on your letterhead or on pre-printed letterhead paper, with page numbers.

## What it does not do

It does not scan or test systems and it does not decide anything. It records the assessor's work and judgment. Using it does not by itself make a risk analysis complete, and it does not establish compliance with the HIPAA Security Rule. It is not legal advice.

## Where your data goes

Nowhere. The page makes no network connection, sets no cookies, and uses no browser storage. Work stays in the tab's memory until you save a JSON file or print. See [data handling]({{ '/docs/data-handling/' | relative_url }}).

## Where to go next

- [Getting started]({{ '/docs/getting-started/' | relative_url }}): open it, load the sample, save your work.
- [Using the workspace]({{ '/docs/workflow/' | relative_url }}): the seven steps.
- [The catalog and scoring]({{ '/docs/catalog/' | relative_url }}): rows, statuses, addressable specifications, and the scales.
- [Report and printing]({{ '/docs/report/' | relative_url }}): letterhead, page setup, and signing.
- [Sources and verification]({{ '/docs/sources/' | relative_url }}): what every regulatory statement rests on and when it was last checked.
- [Roadmap]({{ '/docs/roadmap/' | relative_url }}): what is planned and what is deliberately left out.
