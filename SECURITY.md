# Security policy

## Reporting a problem privately

Report a security problem through GitHub's private reporting: **Security**, then **Report a vulnerability**, on this repository. Do not open a public issue.

If you cannot use GitHub, email info@saberguard.tech with "Security" in the subject.

Include what you found, how to reproduce it, the browser and version, and which copy you used: <https://sra.saberguard.tech>, the GitHub Pages mirror, or your own.

Never include protected health information or a real client's assessment file in a report. A made-up file that shows the problem is enough.

## What to expect

- SaberGuard aims to acknowledge a report within 5 business days and to give an initial assessment within 10 business days.
- We will keep you informed while we work on a fix, and agree a disclosure date with you.
- With your permission, we will credit you in the release notes and the advisory.

Please give us a reasonable time to fix a problem before you disclose it, and do not access or change data that is not yours while testing.

## What is covered

- The workspace: `index.html` and everything in `assets/`.
- The hosted copy at <https://sra.saberguard.tech> and the mirror at <https://saberguard-llc.github.io/HIPAA-SRA-Tool/>.
- The documentation site, the GitHub Actions workflows, and the scripts in `scripts/`.

Problems of particular interest:

- anything that makes the page send data anywhere, or keep it in the browser after the tab closes;
- a saved file, Ward evidence file, or letterhead image that runs script or changes the page when opened;
- a way around the Content Security Policy;
- report output that misstates what the assessor recorded;
- a workflow that could leak a token or run untrusted code with write access.

SaberGuard Ward is a separate product and is not in this repository.

## Supported versions

| Version | Supported |
| --- | --- |
| 4.x | Yes |
| 3.x and earlier | No. Files saved by them still open in 4.x. |

Fixes are released in the latest version. Version 5.0.0 is in development and will replace 4.x as the supported version when it ships.

## How the project keeps itself safe

### In the browser

- The page makes no network connection. A Content Security Policy in `index.html` sets `default-src 'none'` and `connect-src 'none'`, and allows scripts, fonts, and stylesheets only from the page's own origin. Images may also be embedded in the page as data, and styles may be inline.
- The hosted copy also sends the same Content Security Policy as a header, with `frame-ancestors 'none'` added, and `Cross-Origin-Opener-Policy: same-origin`, `Strict-Transport-Security`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, and a `Permissions-Policy` that turns off the camera, microphone, geolocation, and payment.
- It uses no cookies, `localStorage`, `sessionStorage`, or IndexedDB.
- It has no runtime dependencies and no build step. What is in the repository is what runs.
- Values read from a file are validated on open, and text from a file is escaped before it is shown. A letterhead logo is accepted only as an embedded PNG, JPEG, WebP, or SVG image.

### In the repository

Every pull request and every push to `main` runs:

| Check | What it looks for |
| --- | --- |
| Tests | The Content Security Policy, that no script makes a network call or touches browser storage, that fonts load only from the page's own files, and the behavior of the workspace. |
| CodeQL | Security problems in the JavaScript and in the workflows, with the `security-extended` queries. |
| Semgrep | JavaScript, cross-site scripting, secrets, and GitHub Actions rules. A blocking finding fails the check. |
| gitleaks | Secrets anywhere in the Git history. |
| actionlint and zizmor | Mistakes and security problems in the workflows, such as template injection or excessive permissions. |
| Dependency review | Pull requests that add a dependency or action with a known vulnerability. |

OpenSSF Scorecard runs weekly and on every push to `main`. CodeQL and the security workflow also run on a weekly schedule. Results are uploaded to the repository's code scanning alerts.

Every action in the workflows is pinned to a full commit SHA, every job starts with no permissions and asks only for what it needs, and checkouts do not keep credentials. Dependabot opens weekly updates for the actions.

## Saved files and PDFs

**Save file** writes plain JSON. **Save protected file** encrypts the assessment with AES-256-GCM, using a key derived from a passphrase with PBKDF2-SHA-256 and 600,000 iterations; a lost passphrase cannot be recovered. A PDF of the report is not encrypted by the workspace. Keep every copy in an approved, encrypted location.
