---
title: The catalog and scoring
nav_order: 4
description: How the 65 catalog rows map to the Security Rule, what each status means, and how scores are calculated.
---

# The catalog and scoring

## What a row is

The catalog has one row per standard, one row per titled implementation specification, and one row for the untitled implementation specifications paragraph at 45 CFR 164.314(b)(2).

| Section | Subject | Rows |
| --- | --- | --- |
| 45 CFR 164.308 | Administrative safeguards | 30 |
| 45 CFR 164.310 | Physical safeguards | 12 |
| 45 CFR 164.312 | Technical safeguards | 12 |
| 45 CFR 164.314 | Organizational requirements | 6 |
| 45 CFR 164.316 | Policies and procedures and documentation requirements | 5 |

That is 65 rows: 22 standards, 21 Required implementation specifications, and 22 Addressable implementation specifications. The regulation itself states no total. The count is SaberGuard's convention, and every count the workspace displays is derived from the catalog.

Two conventions are worth knowing:

- 45 CFR 164.308(b)(1) is counted as a standard because Appendix A to Subpart C lists it as one. Paragraph (b)(2) has no heading and is shown with it.
- 45 CFR 164.314(b)(2) is headed only "Implementation specifications (Required)", so its title in the catalog, "Plan document provisions", is SaberGuard's label and is marked as such.

## Regulation text and summaries

Each row carries two separate texts:

- The regulation's own wording, quoted without change.
- A plain-language summary, labelled as SaberGuard's.

A test compares the regulation wording on every row with the official eCFR text kept in the repository. The same test fails if the regulation gains a standard or a titled specification that the catalog has no row for. See [sources and verification]({{ '/docs/sources/' | relative_url }}).

## Statuses

| Status | Meaning | Needs a note |
| --- | --- | --- |
| Met | In place, operating as intended, and supported by what the assessor reviewed. | No |
| Partially met | In place in part, inconsistently, or without adequate support. | Yes, and a recommendation |
| Not met | Absent or ineffective, with no documented alternative or decision. | Yes, and a recommendation |
| Alternative measure in place | Addressable rows only. Not implemented as written; the documented reason and an equivalent alternative measure were reviewed. | Yes |
| Not implemented, decision documented | Addressable rows only. Not implemented and no alternative; the documented reason why neither is reasonable and appropriate was reviewed. | Yes |
| Not applicable | The provision does not apply to the organization. | Yes, the basis |

## Addressable does not mean optional

For an addressable implementation specification, the regulation requires the organization to assess it and act on the result:

> (3) When a standard adopted in § 164.308, § 164.310, § 164.312, § 164.314, or § 164.316 includes addressable implementation specifications, a covered entity or business associate must—
>
> (i) Assess whether each implementation specification is a reasonable and appropriate safeguard in its environment, when analyzed with reference to the likely contribution to protecting electronic protected health information; and
>
> (ii) As applicable to the covered entity or business associate—
>
> (A) Implement the implementation specification if reasonable and appropriate; or
>
> (B) If implementing the implementation specification is not reasonable and appropriate—
>
> (1) Document why it would not be reasonable and appropriate to implement the implementation specification; and
>
> (2) Implement an equivalent alternative measure if reasonable and appropriate.

That is 45 CFR 164.306(d)(3) as published. The two addressable-only statuses record the two documented outcomes. Both need a note, and the report prints it.

## Verification basis

Every reviewed row records how its status was verified:

- **Observed**: the assessor saw the configuration, setting, or practice.
- **Document reviewed**: the assessor read the policy, record, agreement, or report.
- **Stated by the client**: the assessor was told, and did not confirm independently.

The report prints the basis beside each status, so a reader can tell tested findings from reported ones.

## Risk rating

Likelihood and impact are each rated 1 to 5.

| Rating | Likelihood | Impact |
| --- | --- | --- |
| 1 | Rare | Negligible |
| 2 | Unlikely | Minor |
| 3 | Possible | Moderate |
| 4 | Likely | Major |
| 5 | Almost certain | Severe |

Inherent risk is likelihood multiplied by impact: Low 1 to 7, Medium 8 to 14, High 15 to 25. Residual risk is rated the same way after the planned treatment.

These scales and thresholds are SaberGuard's own. They are not taken from HHS or NIST guidance, and the Security Rule does not define Low, Medium, or High.

## Implementation score

The implementation score is:

```
(met + alternative measure + half of partial) / applicable rows reviewed
```

Rows rated Not applicable or Not implemented, decision documented are left out of the calculation. The score is a progress measure. It is not a compliance score, and the report says so wherever it prints.
