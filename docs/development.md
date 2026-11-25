---
title: Development
nav_order: 12
description: Repository layout, checks, refreshing the regulation text, and previewing these pages.
---

# Development

## Repository layout

```
index.html              workspace markup
assets/
  styles.css            design tokens, workspace, report preview, print
  theme.js              light or dark, from the address
  catalog.js            Security Rule catalog, statuses, scales, scenarios, checks
  format.js             the saved file: read any version, write version 5
  integrity.js          SHA-256, the assessment fingerprint, protected files
  ephi-map.js           the flow map
  report.js             metrics and the report renderer
  ward.js               Ward evidence import
  app.js                views, workspace logic, save and open, print
  sample.js             the sample, generated from samples/ (npm run sample)
  logo.png, favicon.png the header logo and the favicon
  fonts/                Inter, weights 400 and 500 (SIL Open Font License)
samples/                a fictitious assessment
tests/                  tests, the regulation text, fixtures
scripts/lint-text.mjs   text lint
scripts/fingerprint.mjs the fingerprint of a saved file
scripts/build-sample.mjs writes assets/sample.js from the sample JSON
scripts/measure-perf.mjs the measurements in PERF.md (needs Playwright)
docs/                   these pages
_config.yml             Jekyll configuration for these pages
.github/workflows/      checks, CodeQL, security scans, Scorecard, release
VERIFICATION.md         every regulatory statement, its source, the date checked
CONTRIBUTING.md         how to propose a change and the rules it must meet
SECURITY.md             how to report a security problem
```

The scripts are plain browser scripts with no build step and no dependencies. `report.js`, `format.js`, `integrity.js`, `ward.js`, and `ephi-map.js` do not touch the page, so the tests run them directly under Node.

## Checks: text lint and tests

```bash
npm run check
```

This command runs both of these, as does every pull request and every push to `main`:

- **Text lint** (`npm run lint`): no em dashes, no emoji, and none of a list of filler phrases in anything a reader sees. Quoted regulation text is exempt.
- **Tests** (`npm test`, Node 22 or later): the regulation comparison, the file format and its upgrades, the completeness checks, the report, the flow map against a golden file, the Ward import, the hosting seam, the stylesheet rules, and a gzip size budget for every script and the stylesheet (`tests/budget.test.mjs`). A change that passes a budget either shrinks the file or raises the budget in a commit that says why, with the measurement in `PERF.md`.

The checks workflow also builds these pages with the same Jekyll setup GitHub Pages uses and confirms the workspace files are published unchanged.

## Security scans

Every pull request and push to `main` also runs:

| Workflow | Jobs |
| --- | --- |
| `codeql.yml` | CodeQL on the JavaScript and on the workflows, `security-extended` queries. |
| `security.yml` | Semgrep (JavaScript, cross-site scripting, secrets, and GitHub Actions rules), gitleaks over the full history, actionlint and zizmor on the workflows, and dependency review on pull requests. |
| `scorecard.yml` | OpenSSF Scorecard, weekly and on push to `main`. |

To run the same scans locally before you push, install the tools and run, from the repository root:

```bash
semgrep scan --metrics=off --config p/javascript --config p/xss --config p/secrets --config p/github-actions --error
```

```bash
gitleaks git --redact .
```

```bash
actionlint && zizmor .github/workflows
```

When you add or change a workflow: pin every action to a full commit SHA with the version after it, start from `permissions: {}` and grant each job only what it needs, set `persist-credentials: false` on checkout, and pass untrusted values to `run` steps through `env`, never as an expression inside the script. The workflow lint job checks for these.

Dependabot opens weekly updates for the actions. The Semgrep container digest, the actionlint image digest, and the gitleaks version and SHA-256 in `security.yml` are not updated by Dependabot and are refreshed by hand.

## Refreshing the regulation text

1. Find the latest issue date for Title 45 at `https://www.ecfr.gov/api/versioner/v1/titles.json`.
2. Download Subpart C for that date. The API needs a compressed response:

   ```bash
   curl --compressed -o tests/fixtures/ecfr-title45-part164-subpartC-YYYY-MM-DD.xml "https://www.ecfr.gov/api/versioner/v1/full/YYYY-MM-DD/title-45.xml?part=164&subpart=C"
   ```

3. Remove the older `.xml` file, and update `tests/fixtures/fixture.json` and `CATALOG_SOURCE.checked` in `assets/catalog.js` to the retrieval date.
4. Run `npm test`. A row whose wording, heading, or type no longer matches fails by id.
5. Record the check in `VERIFICATION.md`.

Do not edit the XML. If the markup changes, adjust `tests/regulation-text.mjs`.

## Changing the catalog

- Ids are never reused with a new meaning. Add a new id and map the old one in `format.js`.
- `regulation` is the regulation's wording, unchanged. `summary` is SaberGuard's. Keep them separate.
- A new regulatory statement anywhere a reader sees it gets a row in `VERIFICATION.md` with its source.

## Design rules

- Flat. No gradients, shadows, blur, or glow.
- Two font weights: 400, and 500 for headings and emphasis.
- Sentence case for headings, labels, and buttons.
- Interface text is at least 11 px and report text at least 8.25 pt. The flow map is an SVG, so its labels scale with its width.
- Colors come from the tokens at the top of `styles.css`, defined once for light and once for dark. The report has its own fixed light tokens.
- No icon library. Controls are labelled with words.
- No browser storage and no network, for any reason.

A test enforces the weights, the absence of gradients and shadows, and the storage and network rules.

## Previewing these pages

The pages use the [just-the-docs](https://just-the-docs.com) theme and are built by GitHub Pages from the repository root. To preview locally with Ruby installed:

```bash
printf 'source "https://rubygems.org"\ngem "github-pages", group: :jekyll_plugins\ngem "webrick"\n' > Gemfile
```

```bash
bundle install
```

```bash
bundle exec jekyll serve --baseurl ""
```

`Gemfile` and `Gemfile.lock` are ignored by Git and excluded from the site.

## Releases and version numbers

Versions follow [semantic versioning](https://semver.org/). The major version tracks the file format version. Record changes in `CHANGELOG.md` under a heading of the form `## [4.2.0] - 2026-11-11`.

To publish a release:

1. Set `version` in `package.json`, and date the version's heading in `CHANGELOG.md`.
2. Merge to `main`.
3. Push a tag of the form `v4.2.0` on that commit, or run the **Release** workflow from the Actions tab with the tag and the commit.

The release workflow checks that the tag matches `package.json`, runs `npm run check`, and publishes a GitHub release whose notes are the version's section of `CHANGELOG.md`. It attaches a zip of the workspace (`index.html`, `assets/`, `samples/`, the logo, and `LICENSE`) and a `SHA256SUMS` file, so an assessor can run a known version offline and check what they downloaded. If the release already exists, for example because it was created by hand, the workflow attaches the two files to it instead, after checking that the tag points at the commit it built:

```bash
sha256sum -c SHA256SUMS
```

Vercel serves <https://sra.saberguard.tech>, the canonical address, and redirects its `/docs` addresses to these pages. GitHub Pages serves the mirror and these pages. The page's canonical link and its share image (`assets/share.png`, 1200 by 630) point at the Vercel address. A change to the Content Security Policy goes in both `index.html` and `vercel.json`; a test checks that they match.
