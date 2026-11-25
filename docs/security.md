---
title: Security
nav_order: 8
description: How the workspace protects what you enter, the checks every change passes, and how to report a problem.
---

# Security

## In the browser

The workspace is built so that what an assessor enters cannot leave the page.

- A Content Security Policy in `index.html` sets `default-src 'none'` and `connect-src 'none'`. The browser refuses any request the page might try to make, and loads scripts, styles, and fonts only from the page's own origin.
- Nothing is kept in the browser: no cookies, `localStorage`, `sessionStorage`, or IndexedDB.
- There are no runtime dependencies, no third-party scripts or fonts, no analytics, and no build step. The files in the repository are the files that run.
- Every value read from a saved file or a Ward evidence file is validated on open, and text from a file is escaped before it is shown. A letterhead logo is accepted only as an embedded PNG, JPEG, WebP, or SVG image.

The hosted copy at <https://sra.saberguard.tech> also sends security headers: the same Content Security Policy as the page, with `frame-ancestors 'none'` added, `Cross-Origin-Opener-Policy: same-origin`, `Strict-Transport-Security`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, and a `Permissions-Policy` that turns off the camera, microphone, geolocation, and payment.

What the workspace cannot do for you is described in [data handling]({{ '/docs/data-handling/' | relative_url }}): a saved file is plain JSON unless you use Save protected file, a printed PDF is never encrypted, and their protection is where you keep them.

## In the repository

Every pull request and every push to `main` runs these checks.

| Check | What it looks for |
| --- | --- |
| Tests | The Content Security Policy, that no script makes a network call or touches browser storage, that fonts load only from the page's own files, the regulation text, the file format, and the report. |
| Text lint | Em dashes, emoji, and filler phrases in anything a reader sees. |
| Docs site build | That the pages build the way GitHub Pages builds them, and the workspace is published unchanged. |
| CodeQL | Security problems in the JavaScript and in the GitHub Actions workflows, with the `security-extended` queries. |
| Semgrep | JavaScript, cross-site scripting, secrets, and GitHub Actions rules. A blocking finding fails the check. |
| gitleaks | Secrets anywhere in the Git history. |
| actionlint and zizmor | Mistakes and security problems in the workflows, such as template injection or excessive permissions. |
| Dependency review | A pull request that adds a dependency or action with a known vulnerability. |

OpenSSF Scorecard rates the repository's practices every week and on every push to `main`. Its results are public on the [Scorecard viewer](https://scorecard.dev/viewer/?uri=github.com/SaberGuard-LLC/HIPAA-SRA-Tool). CodeQL and the security workflow also run weekly, so a newly published rule is applied to code that has not changed. On the first of each month, a workflow checks that the pinned Semgrep, gitleaks, and actionlint versions are current. Findings appear in the repository's code scanning alerts.

The workflows follow the same rules they check:

- Every action is pinned to a full commit SHA. Dependabot proposes updates weekly.
- Every job starts with no permissions and asks only for what it needs.
- Checkouts do not keep the token, so later steps cannot use it.

## Reporting a problem

Report a security problem privately through GitHub: **Security**, then **Report a vulnerability**, on the repository. If you cannot use GitHub, email info@saberguard.tech. Do not open a public issue, and never include protected health information or a real client's file.

The [security policy](https://github.com/SaberGuard-LLC/HIPAA-SRA-Tool/blob/main/SECURITY.md) lists what is covered, the supported versions, and what to expect after you report.
