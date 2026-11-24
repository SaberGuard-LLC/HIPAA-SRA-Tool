---
title: File format and hosting
nav_order: 10
description: The saved assessment file, how older versions open, and the functions a host can call.
---

# File format and hosting

## The saved file

An assessment is saved as one JSON file, format name `SaberGuard HIPAA SRA`, currently version 5.

| Key | Holds |
| --- | --- |
| `format`, `version` | The format name and version. The name is what **Open** checks. |
| `savedAt`, `exportedAt` | When the file was written. |
| `evidenceIncluded` | `false` when saved without evidence. |
| `meta` | Step 1, step 6, the report status, and the letterhead settings. |
| `assets` | Inventory rows: kind, zone, ePHI held, lifecycle, owner, vendor, business associate agreement, location, encryption at rest, multi-factor authentication, and `noThreatNote`, why no reasonably anticipated threat applies. |
| `flows` | Data flows: from, to, direction, ePHI carried, transport, encryption in transit. |
| `controls` | One entry per catalog row id: status, notes, recommendation, verification basis, evidence. Each evidence entry has `name`, `type`, `size`, `sha256`, `addedAt`, `source`, and either `data` or `omitted: true`. |
| `risks` | The risk register: statement, `threat`, `vulnerability`, `cia` (any of `confidentiality`, `integrity`, `availability`), rating, treatment, and the ids of the linked inventory rows, flows, and catalog rows. |
| `interviews` | The interview and document log: `participant`, `role`, `date`, `topics`, and `method` (`interview`, `walkthrough`, or `document`). |

The file name is built from the organization name and the assessment date, for example `example-health-clinic-hipaa-sra-2026-09-06.json`.

### Evidence entries

| Key | Holds |
| --- | --- |
| `name`, `type`, `size` | The file's name, media type, and size in bytes. |
| `sha256` | The SHA-256 of the file's bytes, lowercase hex, recorded when the file was attached. Kept when the assessment is saved without evidence. |
| `addedAt` | The date the file was attached, `YYYY-MM-DD`. |
| `source` | `upload` for a file attached in the workspace, `ward` for a file attached from a Ward evidence file. |
| `data` | The file as a base64 data URL. Absent, with `omitted: true`, when the file was saved without evidence. |

When a file is opened, the workspace hashes every embedded evidence file. An entry from an older file gets its `sha256` then. An entry whose recorded hash does not match its embedded bytes is shown as not matching, in the workspace and in Appendix A of the report. A file that was not embedded and has no recorded hash shows "Not recorded".

## Assessment file fingerprint

The report prints a SHA-256 fingerprint of the assessment: the first 16 characters on the cover and in section 01, and the full value in Appendix B. Step 7 of the workspace shows the fingerprint of the open assessment. A saved file whose fingerprint matches a signed report holds exactly what the report was printed from.

The fingerprint is computed from the saved file object:

1. Remove the top-level keys `savedAt`, `exportedAt`, and `evidenceIncluded`.
2. In every evidence entry, remove `data` and `omitted`. The `sha256` of each file stays.
3. Serialize as JSON with the keys of every object sorted, no whitespace, and arrays in their original order.
4. Take the SHA-256 of the UTF-8 bytes, as lowercase hex.

A file saved with or without evidence has the same fingerprint. To check a saved file from the command line:

```bash
node scripts/fingerprint.mjs example-health-clinic-hipaa-sra-2026-09-06.json
```

## Passphrase-protected files

**Save protected file** writes the whole assessment, evidence included, encrypted with a passphrase of at least 12 characters. The file name ends in `.sra.json`, and the file is a JSON wrapper:

```json
{
  "format": "SaberGuard HIPAA SRA (protected)",
  "version": 1,
  "kdf": { "name": "PBKDF2", "hash": "SHA-256", "iterations": 600000, "salt": "<base64, 16 bytes>" },
  "cipher": { "name": "AES-GCM", "iv": "<base64, 12 bytes>" },
  "data": "<base64 ciphertext>"
}
```

The key is a 256-bit AES-GCM key derived from the passphrase with PBKDF2-SHA-256, 600,000 iterations, and a random salt. Each save uses a new salt and a new 12-byte IV. The ciphertext is the saved file's JSON. AES-GCM authenticates it, so a wrong passphrase and a changed byte fail the same way, and nothing is opened.

**Open** recognizes the wrapper and asks for the passphrase. A lost passphrase cannot be recovered. The encryption uses the browser's built-in Web Crypto. It was checked in Chromium from both a web server and a local `file://` page. Where a browser does not offer Web Crypto to the page, the button is disabled and the page says why.

## Saving to the same file

Where the browser offers the File System Access API (Chrome and Edge), the first **Save** asks where to save, and later saves in the same tab write to that file. A protected save keeps its own file the same way. The location is held in memory only and is forgotten when the tab closes or another assessment is opened. Other browsers download a new copy on each save.

## Opening older files

Files from earlier versions open without loss. Saving writes version 5.

- The three 164.314 rows of version 3 (O01 to O03) move to the current rows O12, O13, and O15.
- Free-text risk links are kept as legacy notes beside the new id lists.
- An answer on a row whose citation or regulation text changed is marked "carried from version 3, review again". It counts as not reviewed until the assessor confirms it.
- Rows added since version 3 open as not reviewed, so a complete version 3 file opens as incomplete.

Letterhead settings were added in 4.1 as optional fields in `meta`. A file without them opens with no letterhead. An older copy of the workspace keeps them untouched when it saves.

## What is validated on open

Values the workspace does not recognize fall back to a safe default. An evidence `sha256` that is not 64 hex characters, an `addedAt` that is not a date, and a `source` other than `upload` or `ward` are dropped. an unknown status becomes not reviewed, an unknown kind or zone becomes unknown, an unknown letterhead becomes none. A letterhead logo is kept only if it is an embedded PNG, JPEG, WebP, or SVG image. Unknown catalog row ids are kept as they are. A risk's link to a row or flow that no longer exists is removed, and fields the workspace does not know on inventory rows, flows, and risks are not kept.

## Catalog row ids

Ids such as `A02`, `P09`, or `T12` are stable. An id is never reused with a new meaning. When the regulation or the catalog convention changes, a new id is added and the old one is mapped on open.

## Hosting seam: functions a host can call

The public page keeps nothing. A host that serves its own copy can keep the assessment for the assessor by calling functions on `window.SRA`:

| Function | Does |
| --- | --- |
| `snapshot(includeEvidence = true)` | Returns the assessment as the object a saved file holds. |
| `importAssessment(file)` | Opens an assessment. `file` is anything with a `name` and an async `text()`. |
| `markSaved(message)` | Clears the unsaved-changes warning once the host has stored the snapshot. |
| `saveFile()`, `saveProtected()` | The workspace's own save and protected save, as the buttons run them. |
| `isDirty()` | `true` when there are edits since the last save or open. |
| `navigate(step)` | Shows a step: `overview`, `profile`, `inventory`, `map`, `catalog`, `risks`, `attestation`, or `report`. `navigate('catalog', 'A05')` selects a catalog row. |
| `loadSample()` | Opens the sample assessment. |
| `setTheme('light' or 'dark')` | Sets the theme. |
| `configure({ embedded: true })` | Embeds the workspace in a host that owns opening and saving. See below. Returns the current settings. `configure({ embedded: false })` undoes it. |

### Embedding

After `configure({ embedded: true })`:

- The start screen is never shown. A page on the start screen moves to the overview.
- The File menu keeps only **Export remediation plan (CSV)**. Open, Save, Save protected file, and Save without evidence are hidden, as are the save buttons in step 7.
- The footer is hidden.
- Ctrl + S (Cmd + S on a Mac) saves nothing and fires `sra:save-requested` instead, so the host can save.

Everything else stays: the steps, the report preview, printing, the theme, Ward evidence, and the CSV export. A page that never calls `configure` behaves exactly as before.

### Events

The page fires these on `document`, so a host can react without polling `isDirty()`:

| Event | Fired when | `detail` |
| --- | --- | --- |
| `sra:dirty` | The first edit after an open or a save. It fires once, not on every keystroke. | `{ dirty: true }` |
| `sra:saved` | A save completes: the workspace wrote a file, or the host called `markSaved()`. | `{ how, savedAt }`, where `how` is `download`, `in-place`, `protected`, or `host` |
| `sra:save-requested` | Ctrl or Cmd + S is pressed while embedded. | `{}` |

A host that stores the assessment would:

```js
document.addEventListener('sra:dirty', () => showUnsaved());
document.addEventListener('sra:save-requested', () => store());
async function store() {
  await upload(window.SRA.snapshot());
  window.SRA.markSaved('Saved');
}
```

Opening a file with `importAssessment()` clears the unsaved state without firing `sra:saved`.

SaberGuard's Ward does this behind its own sign-in. The public page uses `snapshot()` and `importAssessment()` only for **Save** and **Open**, never calls `markSaved()` or `configure()`, and makes no network connection.
