---
title: Getting started
nav_order: 2
description: Open the workspace, load the sample, and save your work.
---

# Getting started

## Open it

Use the hosted copy at <https://saberguard-llc.github.io/HIPAA-SRA-Tool/>, or run it from a folder:

```bash
git clone https://github.com/SaberGuard-LLC/HIPAA-SRA-Tool.git
```

```bash
cd HIPAA-SRA-Tool
```

Then open `index.html` in a browser. There is nothing to install and no account. A current version of Chrome, Edge, Firefox, or Safari works. Chrome and Edge print page numbers; see [report and printing]({{ '/docs/report/' | relative_url }}).

## Look at the sample

Press **Open** and choose `samples/example-health-clinic-hipaa-sra-2026-09-06.json` from the repository. It is a fictitious outpatient clinic with a full inventory, 13 data flows, all 65 catalog rows reviewed, and 9 risks. Press **Preview report** to see the report it produces.

## Save your work

Nothing is saved for you. The workspace keeps the assessment in the tab's memory and warns you before you close the tab with unsaved changes. The top bar shows "Unsaved changes" when there are edits since the last save.

- **Save file** (or Ctrl + S, Cmd + S on a Mac) downloads the assessment as a JSON file, with attached evidence embedded.
- **Save file without evidence**, in step 7, writes the same file with the names and sizes of attachments but not the files. Use it to share the assessment without the evidence.
- **Open** reads a saved file back in. Files from earlier versions open without loss; see [file format]({{ '/docs/file-format/' | relative_url }}).

A saved file describes an organization's security weaknesses. Store it only in an approved, encrypted location.
{: .warning }

## Light and dark themes

The workspace opens in the light theme. Press **Dark mode** in the top bar to switch. The choice is written into the address as `?theme=dark`, so a reload or a bookmark keeps it. It is not stored in the browser, because the workspace stores nothing there.

The report preview and the printed report are always on white.

## Work through the steps

The sidebar lists the seven steps. A dot beside each step turns amber when it is in progress and green when its completeness checks pass. You can work in any order. The report stays a draft, with a watermark, until every check passes and you set the report status to Final.

Continue with [using the workspace]({{ '/docs/workflow/' | relative_url }}).
