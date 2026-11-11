---
title: Data handling
nav_order: 7
description: What the workspace does with what you enter, and what to do with the files it produces.
---

# Data handling

## No network connection, no browser storage

- It makes no network connection. A Content Security Policy in `index.html` sets `connect-src 'none'` and `default-src 'none'`, so the browser itself refuses any request the page might try to make. Scripts, styles, fonts, and images load only from the page's own folder.
- It uses no `localStorage`, `sessionStorage`, IndexedDB, or cookies. Even the theme choice is kept in the address, not in browser storage.
- It has no analytics, no trackers, and no third-party scripts or fonts.
- It has no runtime dependencies. The whole application is `index.html`, the logo image, and the files in `assets/`.

Tests check the policy, that no script contains a network call or touches browser storage, and that the stylesheet loads fonts only from the page's own files.

You can check the first point yourself: open the browser's developer tools, switch to the Network tab, and use the workspace. Every request goes to the page's own origin. After the page has loaded, the only further request is for one of its own font files, the first time a character outside Latin-1 appears, for example in a name.

## Where your work is

Your work is in the tab's memory until you save a JSON file or print. Closing or reloading the tab discards unsaved work. The browser warns you first if there are unsaved changes.

## What you are responsible for

The saved file and the printed report describe an organization's security weaknesses.
{: .warning }

- Store them only in an approved, encrypted location. The workspace does not encrypt the file it saves.
- Do not attach evidence that shows patient identifiers. Redact names, dates of birth, record numbers, and similar identifiers first. The workspace warns at the attach control but cannot inspect what you attach.
- Share the report only with people who need it: leadership, the security and privacy officials, counsel, and those doing the remediation.
- Retain the analysis and its supporting records for at least 6 years (45 CFR 164.316(b)(2)(i)), or longer if state law or a contract requires.

## Size limits for evidence and logos

Attachments are limited to 10 MB per file and 25 MB per assessment. They are embedded in the saved file. "Save file without evidence" writes the same file with the names and sizes of the attachments but not their contents.

A letterhead logo is limited to 512 KB and is also kept in the saved file.

## Hosting your own copy

The workspace is static files. Any web server can host it, and it also runs from a local folder.

- On Vercel, `vercel.json` sends the Content Security Policy and related headers.
- GitHub Pages does not send those headers. The policy in the page's own `<meta>` tag still applies.

A host can keep assessments for its users through three functions on `window.SRA`: `snapshot()` returns the assessment as the object a saved file holds, `importAssessment()` opens one, and `markSaved()` clears the unsaved-changes warning. `setTheme('dark')` sets the theme. The public page uses `snapshot()` and `importAssessment()` only for **Save file** and **Open**, and never calls `markSaved()`. See [file format]({{ '/docs/file-format/' | relative_url }}).

## Reporting a security problem

Use GitHub's private reporting on the repository: **Security**, then **Report a vulnerability**. See the [security policy](https://github.com/SaberGuard-LLC/HIPAA-SRA-Tool/blob/main/SECURITY.md).
