---
title: File format and hosting
nav_order: 8
description: The saved assessment file, how older versions open, and the functions a host can call.
---

# File format and hosting

## The saved file

An assessment is saved as one JSON file, format name `SaberGuard HIPAA SRA`, currently version 4.

| Key | Holds |
| --- | --- |
| `format`, `version` | The format name and version. The name is what **Open** checks. |
| `savedAt`, `exportedAt` | When the file was written. |
| `evidenceIncluded` | `false` when saved without evidence. |
| `meta` | Step 1, step 6, the report status, and the letterhead settings. |
| `assets` | Inventory rows: kind, zone, ePHI held, lifecycle, owner, vendor, business associate agreement, location, encryption at rest, multi-factor authentication. |
| `flows` | Data flows: from, to, direction, ePHI carried, transport, encryption in transit. |
| `controls` | One entry per catalog row id: status, notes, recommendation, verification basis, evidence. |
| `risks` | The risk register, with ids of the linked inventory rows, flows, and catalog rows. |

The file name is built from the organization name and the assessment date, for example `example-health-clinic-hipaa-sra-2026-09-06.json`.

## Opening older files

Files from earlier versions open without loss. Saving writes version 4.

- The three 164.314 rows of version 3 (O01 to O03) move to the current rows O12, O13, and O15.
- Free-text risk links are kept as legacy notes beside the new id lists.
- An answer on a row whose citation or regulation text changed is marked "carried from version 3, review again". It counts as not reviewed until the assessor confirms it.
- Rows added since version 3 open as not reviewed, so a complete version 3 file opens as incomplete.

Letterhead settings were added in 4.1 as optional fields in `meta`. A file without them opens with no letterhead. An older copy of the workspace keeps them untouched when it saves.

## What is validated on open

Values the workspace does not recognize fall back to a safe default: an unknown status becomes not reviewed, an unknown kind or zone becomes unknown, an unknown letterhead becomes none. A letterhead logo is kept only if it is an embedded PNG, JPEG, WebP, or SVG image. Unknown catalog row ids are kept as they are. A risk's link to a row or flow that no longer exists is removed, and fields the workspace does not know on inventory rows, flows, and risks are not kept.

## Catalog row ids

Ids such as `A02`, `P09`, or `T12` are stable. An id is never reused with a new meaning. When the regulation or the catalog convention changes, a new id is added and the old one is mapped on open.

## Hosting seam: functions a host can call

The public page keeps nothing. A host that serves its own copy can keep the assessment for the assessor by calling functions on `window.SRA`:

| Function | Does |
| --- | --- |
| `snapshot(includeEvidence = true)` | Returns the assessment as the object a saved file holds. |
| `importAssessment(file)` | Opens an assessment. `file` is anything with a `name` and an async `text()`. |
| `markSaved(message)` | Clears the unsaved-changes warning once the host has stored the snapshot. |
| `isDirty()` | `true` when there are edits since the last save or open. |
| `setTheme('light' or 'dark')` | Sets the theme. |

SaberGuard's Ward does this behind its own sign-in. The public page uses `snapshot()` and `importAssessment()` only for **Save file** and **Open**, never calls `markSaved()`, and makes no network connection.
