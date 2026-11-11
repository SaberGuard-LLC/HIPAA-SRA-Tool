---
title: Sources and verification
nav_order: 9
description: What every regulatory statement in the workspace rests on, and when it was last checked against the primary source.
---

# Sources and verification

Every regulatory statement that ships in the workspace, the report, or these pages is listed in [`VERIFICATION.md`](https://github.com/SaberGuard-LLC/HIPAA-SRA-Tool/blob/main/VERIFICATION.md) with its source and the date it was checked. This page is the summary.

Last full check: November 11, 2026.

## The regulation text

| Item | Detail |
| --- | --- |
| Source | [eCFR, 45 CFR Part 164, Subpart C](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-C) |
| Issue retrieved | November 5, 2026 (eCFR current through November 9, 2026) |
| Last amendment to Subpart C | November 24, 2020, to 164.314. The other sections are unchanged since eCFR's history begins. |
| Kept in the repository | `tests/fixtures/ecfr-title45-part164-subpartC-2026-11-05.xml`, unchanged from the eCFR versioner API |

A test compares the regulation wording, the heading, and the Required or Addressable marker on all 65 catalog rows with that file. It also checks that:

- every standard and every titled implementation specification in 164.308 to 164.316 has a catalog row;
- the section headings match the catalog's category labels;
- Appendix A to Subpart C lists the business associate standard at 164.308(b)(1);
- Subpart C names no fixed interval and does not mention multi-factor authentication;
- the sentences the workspace relies on in 164.306(d)(2), 164.306(d)(3), 164.306(e), 164.316(b)(2)(i), and 164.316(b)(2)(iii) are present.

The report prints the comparison date in Appendix B.

## The proposed changes to the Security Rule

HHS published a proposed rule on January 6, 2025: "HIPAA Security Rule To Strengthen the Cybersecurity of Electronic Protected Health Information", [90 FR 898](https://www.federalregister.gov/documents/2025/01/06/2024-30983/hipaa-security-rule-to-strengthen-the-cybersecurity-of-electronic-protected-health-information), RIN 0945-AA22.

It is a proposal. As of November 11, 2026, the Federal Register lists no final rule under that RIN and no final rule amending 45 CFR Part 164 since it was published, and the eCFR text of Subpart C is unchanged. The workspace reflects the rule in force. The distinction between Required and Addressable implementation specifications still applies.

If a final rule is published, the fixture test is how the change will show: refresh the fixture, and every row whose text, heading, or type moved will fail by name.

## Definitions outside Subpart C

Read on eCFR, issue of November 5, 2026:

- Electronic protected health information is the part of protected health information that is transmitted by or maintained in electronic media (45 CFR 160.103). Paper records are outside it.
- A business associate, and a subcontractor, are as defined in 45 CFR 160.103. The duty to obtain satisfactory assurances at 45 CFR 164.308(b) runs to business associates.

## HHS guidance

| Statement | Source | Status |
| --- | --- | --- |
| The HHS product is the Security Risk Assessment (SRA) Tool, developed by ONC with OCR, and "Use of this tool is neither required by nor guarantees compliance with federal, state or local laws." | [HHS SRA Tool page](https://www.healthit.gov/topic/privacy-security-and-hipaa/security-risk-assessment-tool) | Read November 11, 2026. Page last updated September 18, 2026. |
| The Security Rule does not specify how frequently to perform risk analysis. | [OCR Guidance on Risk Analysis](https://www.hhs.gov/hipaa/for-professionals/security/guidance/guidance-risk-analysis/index.html) | Supported by the regulation text itself, which the fixture test checks. The OCR sentence was seen in a search index excerpt, not read on the page. |
| OCR's guidance lists nine elements of a risk analysis, and HHS does not endorse or recommend any particular risk analysis or risk management model. | Same page | Not confirmed on November 11, 2026. |

hhs.gov refused automated requests on the date of the check, so the two OCR guidance statements could not be read directly. They are carried from the reference notes of September 30, 2026 and are marked unconfirmed in the log until someone reads the page in a browser.
{: .warning }

## What the workspace does not claim

- It does not attribute its rating scales or thresholds to HHS or NIST. They are SaberGuard's.
- It does not state how often a risk analysis must be done. The rule sets no interval.
- It does not say that multi-factor authentication or patching is required by the current rule. The risk scenario library offers them as risks an assessor may record.
- It does not call the implementation score a compliance score.

## Checking it yourself

```bash
npm test
```

runs the comparison. To refresh the regulation text, see [development]({{ '/docs/development/' | relative_url }}).
