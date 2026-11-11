---
title: Using the workspace
nav_order: 3
description: The seven steps of an assessment, from scope to the printed report.
---

# Using the workspace

Work stays in the tab's memory. Save a file with **Save file**, or Ctrl + S (Cmd + S on a Mac), before closing the tab. See [data handling]({{ '/docs/data-handling/' | relative_url }}).
{: .warning }

## Step 1: organization and scope

Record who is being assessed and what is in scope. These fields fill the report cover, the document control block, and the scope section.

The entity profile changes which rows apply:

| Answer | Effect |
| --- | --- |
| Entity type: covered entity | 45 CFR 164.314(a)(2)(iii), contracts between a business associate and its subcontractors, is marked Not applicable. |
| Health care clearinghouse within a larger organization: No | 45 CFR 164.308(a)(4)(ii)(A) is marked Not applicable. |
| Group health plan: No | 45 CFR 164.314(b)(1) and (b)(2) are marked Not applicable. |

Rows marked this way are locked, and the report prints the basis.

"Next planned review" is the organization's own planned date. The Security Rule sets no fixed interval for a risk analysis.

## Step 2: ePHI inventory and data flows

Add one row for every person, device, system, outside party, and backup that stores, receives, maintains, or transmits ePHI. Record electronic PHI only. Paper records are not ePHI.

Each row records the kind, the zone, the ePHI held, the lifecycle stages, the owner, the vendor, whether a business associate agreement is on file, the location, encryption at rest, and multi-factor authentication.

Then add one data flow for every connection that carries ePHI between two rows: what is carried, the transport, and whether it is encrypted in transit.

Unknown is a recorded gap, not a no. A row left unclassified fails the inventory check. A row or flow whose business associate agreement, encryption, or multi-factor authentication is missing or not checked is flagged on the map, and the report stays in draft until a risk that is not closed is linked to it or the row is corrected.
{: .note }

## Step 3: ePHI flow map

<p align="center">
  <img src="{{ '/docs/assets/screenshots/flow-map-light.png' | relative_url }}" width="760" alt="The ePHI flow map with three columns, risk tags on nodes, and one flow marked not encrypted">
</p>

The workspace draws the map from the inventory and flows. There is nothing to arrange.

- Three columns: people and devices in the practice, the systems that hold ePHI with their backups listed inside, and outside parties.
- A line carries a label only when the flow is not encrypted or not checked.
- A tag on a node or flow is a risk register reference. The list under the map is the key, highest rated first.
- Direct-entry flows (a person typing into a device) are not drawn.

The layout is deterministic. The same file always produces the same drawing, and the same map prints in section 04 of the report.

## Step 4: catalog review

<p align="center">
  <img src="{{ '/docs/assets/screenshots/catalog-dark.png' | relative_url }}" width="760" alt="The catalog review in the dark theme, showing a row with its regulation text, status buttons and verification basis">
</p>

Each row shows its citation, whether it is a standard, a Required specification or an Addressable one, the regulation's own wording, SaberGuard's plain-language summary, and a prompt for the assessor.

For each row:

1. Choose a status. See [the catalog and scoring]({{ '/docs/catalog/' | relative_url }}) for what each one means.
2. Choose the verification basis: observed, document reviewed, or stated by the client.
3. Open the notes to record what was verified, a recommendation for any gap, and supporting evidence.

Evidence must not show patient identifiers. Redact names, dates of birth, record numbers, and similar identifiers before attaching a file.
{: .warning }

The filters narrow the list to one section of the rule, to gaps, or to rows not yet reviewed.

### Ward evidence

**Attach Ward evidence** reads an evidence file from SaberGuard Ward, a configuration collector. Each safeguard in the file is attached as a JSON file to the catalog row with the same citation. Rows with no notes get one line naming the collections, the rule outcome, and the facts. The import never sets a status or a verification basis. Attaching the same file twice adds nothing.

## Step 5: risk register

Write each risk as a statement of a threat, the vulnerability it could exploit, and the ePHI or process affected. Link it to the inventory rows, data flows, and catalog rows involved. Rate likelihood and impact, choose a treatment decision, name an owner and a target date, write the remediation plan, and rate the expected residual risk.

The risk scenario library holds 18 scenarios that can start an entry. They are risks an assessor may record, not requirements of the Security Rule.

## Step 6: summary and attestation

Write the executive summary, or leave it blank and the report generates a factual summary from the results. Name the executive approver and edit the management statement. Approval is recorded by signature and date on the printed report, not by a field in the workspace.

## Step 7: report and checks

The completeness checks test whether fields are filled in. They do not test whether the analysis is accurate or thorough.

| Check | What it needs |
| --- | --- |
| Profile | Organization, assessment date, lead assessor, scope statement, and entity profile. |
| Inventory | At least one row, and every row has a name, the ePHI held, a kind, a zone, and a lifecycle stage. |
| Flows | Every data flow names two different inventory rows. |
| Linked risks | Every row or flow flagged for a missing or unconfirmed business associate agreement, encryption, or multi-factor authentication is linked to a risk. |
| Reviewed | Every catalog row has a status. An answer carried from a version 3 file counts only once it is confirmed. |
| Basis | Every reviewed row has a verification basis. Rows marked Not applicable by the entity profile do not need one. |
| Notes | Every row rated Partially met, Not met, Not applicable, Alternative measure in place, or Not implemented, decision documented has a note. |
| Recommendations | Every row rated Partially met or Not met has a recommendation. |
| Risks recorded | At least one risk is in the register. |
| Risks complete | Every risk has a description, likelihood, impact, owner, target date, and treatment plan. |
| Approval | The management approver is named. |

When every check passes, set the report status to Final. Then choose a letterhead and print. See [report and printing]({{ '/docs/report/' | relative_url }}).
