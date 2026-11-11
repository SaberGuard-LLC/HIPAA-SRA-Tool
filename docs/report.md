---
title: Report and printing
nav_order: 5
description: What the report contains, how to put it on letterhead, how to print it, and how it is signed.
---

# Report and printing

<table class="screens">
  <tr>
    <td><img src="{{ '/docs/assets/screenshots/report-cover.png' | relative_url }}" alt="Report cover with a firm letterhead, the title, the organization and the document details"></td>
    <td><img src="{{ '/docs/assets/screenshots/report-signatures.png' | relative_url }}" alt="Section 09 with the assessor's statement, the management statement and three signature boxes"></td>
  </tr>
</table>

## What the report contains

| Section | Contents |
| --- | --- |
| Cover | Title, organization, classification, dates, preparer, security official, approver. |
| 01 Document control | Version, status, classification, next planned review, retention, contents, handling. |
| 02 Executive summary | Narrative, implementation score, status by section of the rule, priority gaps, highest-rated risks. |
| 03 Scope, environment and method | Profile, scope statement, method, status definitions, rating scales. |
| 04 ePHI inventory | The flow map, what needs attention, the inventory, and the data flows. |
| 05 Catalog review | Every row with its regulation text, status, verification basis, and notes. |
| 06 Findings and recommendations | Each row rated Partially met or Not met, with the recommendation. |
| 07 Risk register and analysis | Heat map, register, and treatment plans. |
| 08 Remediation roadmap | Open and in-progress risks in priority order. |
| 09 Management review and attestation | Assessor's statement, management statement, signatures. |
| Appendix A | Evidence index. |
| Appendix B | Completeness checks and how the report was produced. |

## Draft and Final

The report prints with a Draft watermark until every completeness check passes and the report status in step 7 is set to Final. A draft cover says how many checks are open and that the report is not ready for signature.

## Letterhead

Set this in step 7 under "Letterhead and signatures". The report prints with no letterhead unless you choose one.

<p align="center">
  <img src="{{ '/docs/assets/screenshots/letterhead-settings.png' | relative_url }}" width="760" alt="The letterhead settings in step 7: letterhead type, firm name, address, contact line and logo">
</p>

| Choice | What prints |
| --- | --- |
| None | A plain cover. The report names the assessor but no firm. |
| Firm letterhead, printed by the report | The firm name, address, contact line, and logo across the top of the cover. The firm is named under "Prepared by", in the page footer, and beside the assessor's signature line. |
| Pre-printed letterhead paper, leave space | 1.5, 2, or 2.5 inches left blank at the top of the cover for your letterhead stock. Load one sheet of letterhead for page 1 and plain paper for the rest. |

For the logo, choose the SaberGuard logo or an image file from your computer (PNG, JPEG, WebP, or SVG, up to 512 KB). A chosen image is kept inside the saved assessment file, so it travels with it.

The SaberGuard name and logo are for reports prepared by SaberGuard LLC. They are not covered by the MIT license.
{: .note }

The letterhead settings are saved in the assessment file. Appendix B always states that SaberGuard publishes the workspace and did not review the report unless named as the assessor.

## Printing

1. Press **Print / PDF**, or Ctrl + P (Cmd + P on a Mac).
2. Choose your printer, or **Save as PDF**.
3. Paper size **Letter**, margins **Default**.
4. Turn off **Headers and footers**, so the browser's own URL and timestamp do not print.

The report's styles force background colors on and set the page size and margins.

| Browser | Running header and footer | Page numbers |
| --- | --- | --- |
| Recent Chrome and Edge | In the page margins | "Page 2 of 41" |
| A browser without CSS page margin boxes | At the top and bottom of the content | Not printed |

The workspace detects which case applies. For a signed deliverable, print from Chrome or Edge so every page is numbered against the total.

The header carries the document title, the organization, the classification, and the version. The footer carries the preparer and the page number. The cover has neither.

## Signing

Section 09 has three signature boxes, kept together on one page:

- **Lead assessor**, with the firm name when a firm letterhead is set.
- **HIPAA security official**, the person identified under 45 CFR 164.308(a)(2).
- **Executive approver**, who signs the management statement.

Each box has a signature line, the printed name and title, and a date line. Signatures are made by hand on the printed report. The workspace does not apply electronic signatures and does not record an approval date for anyone.

## Keeping it

The Security Rule requires documentation to be retained for 6 years from the date of its creation or the date when it last was in effect, whichever is later (45 CFR 164.316(b)(2)(i)). State law or contracts may require longer. Keep the signed report, the saved JSON file, and the evidence together, in an approved encrypted location.
