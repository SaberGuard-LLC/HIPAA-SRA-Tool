---
title: Accessibility
nav_order: 9
description: What has been checked for accessibility, how, what was fixed, and what is still to do.
---

# Accessibility

The workspace aims to meet WCAG 2.2 at level AA. This page records what has been checked, how, and what is still open. It is updated with each release.

Last checked: November 24, 2026, on the 5.0.0 development branch, in Chromium.

## Automated check with axe

[axe-core](https://github.com/dequelabs/axe-core) 4 was run against every view, in the light and the dark theme, with the WCAG 2.0, 2.1, and 2.2 A and AA rules and the best-practice rules: the start screen, the overview, each of the seven steps with the sample assessment open, the File menu open, a risk open for editing, and the report preview.

Result: no violations in any view, in either theme.

Found and fixed during the check:

| Finding | Fix |
| --- | --- |
| The step links in the rail had names that did not include their visible text (WCAG 2.5.3). | The names now come from the visible step number, name, and status. |
| The heat map used `role="img"` on a `figure`, which axe does not allow. | The heat map is a `div` with `role="img"` and a name that lists every risk's cell. |
| Small labels in the report's heat map had a contrast of 3.7 to 3.9 (WCAG 1.4.3). | Darkened to pass 4.5:1. |
| A finding title in the report skipped a heading level. | The finding titles are level 3 headings under their section. |

Tests in `tests/ui.test.mjs` check the token colors for contrast in both themes: text and status pills at 4.5:1 or more, and the dark theme's fills at 3:1 or more against the surface. The light theme's partial fill (`#d99a12`, 2.5:1 against white) is the agreed brand value; in the overview's bars and the heat map it always carries a count in text and appears in a text legend, so color is not the only way to read it.

## Keyboard

A scripted walkthrough with the keyboard alone, in Chromium:

- The skip link is the first stop, and every control is reached with Tab in reading order.
- **Start a new assessment** moves focus to the organization name.
- The File menu opens with Enter, Space, or the down arrow, moves with the arrow keys, Home, and End, jumps by first letter, and closes with Escape, returning focus to the button.
- The status and verification basis choices are radio groups: one Tab stop each, and the arrow keys choose.
- J, K, 1 to 6, slash, and the question mark work in the catalog and do nothing while typing in a field. The shortcuts dialog opens and closes with the keyboard.
- The passphrase dialog takes focus, keeps it inside the dialog, closes with Escape, and returns focus to the button that opened it.
- A focused control has a visible 2 px outline, and `scroll-padding-top` keeps it clear of the sticky header (WCAG 2.4.11).

## Other design rules that support accessibility

- Status is always written in words: in the list, in the rail ("65 of 65, 11 gaps"), on the overview, and in the report. No colored dot is the only signal.
- Interface text is at least 11 px and report text at least 8.25 pt.
- Header buttons are at least 36 px tall, status choices at least 40 px, and nothing interactive is smaller than 24 px (WCAG 2.5.8).
- The flow map has a text alternative, and the list under it describes every flagged row and flow.
- The theme follows the address (`?theme=dark`), not browser storage.

## Still to do

- A review with VoiceOver on Safari and NVDA on Firefox, of the catalog review and the risk register. This needs a person with those tools and has not been done.
- The same automated and keyboard checks in Firefox and Safari.
- Zoom to 400 percent and text spacing checks (WCAG 1.4.10 and 1.4.12).

Report an accessibility problem as an [issue](https://github.com/SaberGuard-LLC/HIPAA-SRA-Tool/issues/new/choose).
