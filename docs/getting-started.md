---
title: Getting started
nav_order: 2
description: Open the workspace, load the sample, and save your work.
---

# Getting started

## Open the workspace

Use the hosted copy at <https://sra.saberguard.tech>. The copy at <https://saberguard-llc.github.io/HIPAA-SRA-Tool/> is a mirror of the same files. To work offline, run it from a folder:

```bash
git clone https://github.com/SaberGuard-LLC/HIPAA-SRA-Tool.git
```

```bash
cd HIPAA-SRA-Tool
```

Then open `index.html` in a browser. There is nothing to install and no account. Use a current browser. The workspace is tested in Chromium, the engine of Chrome and Edge, and uses only standard browser features. Chrome and Edge print page numbers; see [report and printing]({{ '/docs/report/' | relative_url }}).

## The start screen

<p align="center">
  <img src="{{ '/docs/assets/screenshots/start-light.png' | relative_url }}" width="760" alt="The start screen: three buttons to start a new assessment, open a saved file, or explore the sample clinic, the seven steps, and what the workspace promises">
</p>

When nothing is open, the workspace shows a start screen with three choices: **Start a new assessment**, **Open a saved file**, or **Explore the sample clinic**. It also lists the seven steps and what each produces.

## Load the sample assessment

Press **Explore the sample clinic** on the start screen. You can also download the [sample assessment]({{ '/samples/example-health-clinic-hipaa-sra-2026-09-06.json' | relative_url }}) (it is also in `samples/` in the repository) and open it with **File**, then **Open**. It is a fictitious outpatient clinic with a full inventory, 13 data flows, all 65 catalog rows reviewed, and 9 risks. Press **Preview report** to see the report it produces, then **Print / PDF** to print it.

## Save your work

Nothing is saved for you. The workspace keeps the assessment in the tab's memory and warns you before you close the tab with unsaved changes. The top bar shows "Unsaved changes" when there are edits since the last save, and "Saved 5 minutes ago" after a save.

Every file action is in the **File** menu in the top bar: Open, Save, Save protected file, Save without evidence, and Export remediation plan (CSV). The menu works with the arrow keys, Home, End, and Escape.

- **Save** (or Ctrl + S, Cmd + S on a Mac) writes the assessment as a JSON file, with attached evidence embedded.
- **Save protected file** writes the same file encrypted with a passphrase you choose. It opens only with that passphrase, and a lost passphrase cannot be recovered.
- In Chrome and Edge, the first save asks where to put the file and later saves write to the same file. Other browsers download a new copy each time.
- **Save without evidence** writes the same file with the names and sizes of attachments but not the files. Use it to share the assessment without the evidence.
- **Open** reads a saved file back in, and asks for the passphrase if the file is protected. Files from earlier versions open without loss; see [file format]({{ '/docs/file-format/' | relative_url }}).

A saved file describes an organization's security weaknesses. Store it only in an approved, encrypted location.
{: .warning }

## Light and dark themes

The workspace opens in the light theme. Press **Dark theme** in the top bar to switch; press it again to go back. The choice is written into the address as `?theme=dark`, so a reload or a bookmark keeps it. It is not stored in the browser, because the workspace stores nothing there.

The report preview and the printed report are always on white.

## Work through the seven steps

Each step is its own view, with its own address (`#profile`, `#inventory`, `#map`, `#catalog`, `#risks`, `#attestation`, `#report`), so the browser's Back and Forward buttons move between them. The overview (`#overview`) shows the steps in a wide rail with each one's status in words, for example "12 rows, 13 flows" or "65 of 65, 11 gaps". On the other views the rail narrows to the step numbers. You can work in any order. The report stays a draft, with a watermark, until every check passes and you set the report status to Final.

The overview shows what is still open, the implementation score, catalog gaps, high risks, and evidence files, the catalog status by safeguard, the open risks by target date, and the three highest risks.

Continue with [using the workspace]({{ '/docs/workflow/' | relative_url }}).
