# Security policy

## Reporting a problem privately

Report a security problem through GitHub's private reporting: **Security**, then **Report a vulnerability**, on this repository. Do not open a public issue.

Include what you found, how to reproduce it, the browser and version, and whether you used the hosted copy or your own.

Never include protected health information or a real client's assessment file in a report. A made-up file that shows the problem is enough.

## What is covered

- The workspace: `index.html` and everything in `assets/`.
- The hosted copy at <https://saberguard-llc.github.io/HIPAA-SRA-Tool/>.
- The GitHub Actions workflows and the script in `scripts/`.

Problems of particular interest:

- anything that makes the page send data anywhere, or keep it in the browser after the tab closes;
- a saved file, Ward evidence file, or letterhead image that runs script or changes the page when opened;
- a way around the Content Security Policy;
- report output that misstates what the assessor recorded.

SaberGuard Ward is a separate product and is not in this repository.

## Supported versions

| Version | Supported |
| --- | --- |
| 4.x | Yes |
| 3.x and earlier | No. Files saved by them still open in 4.x. |

## How the project keeps itself safe

- The page makes no network connection. A Content Security Policy in `index.html` sets `default-src 'none'` and `connect-src 'none'`, and allows scripts, fonts, and stylesheets only from the page's own origin. Images may also be embedded in the page as data, and styles may be inline.
- It uses no cookies, `localStorage`, `sessionStorage`, or IndexedDB.
- It has no runtime dependencies and no build step. What is in the repository is what runs.
- Values read from a file are validated on open, and text from a file is escaped before it is shown. A letterhead logo is accepted only as an embedded PNG, JPEG, WebP, or SVG image.
- Every pull request and every push to `main` runs the text lint, the tests, and CodeQL. The tests check the policy, that the scripts make no network call and touch no browser storage, and that fonts load only from the page's own files.
- Dependabot opens weekly updates for the GitHub Actions the workflows use.

## Saved files and PDFs are not encrypted

The saved JSON file is not encrypted, and neither is a PDF of the report. Their protection is where you store them. Keep them in an approved, encrypted location.
