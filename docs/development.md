---
title: Development
nav_order: 10
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
  format.js             the saved file: read any version, write version 4
  ephi-map.js           the flow map
  report.js             metrics and the report renderer
  ward.js               Ward evidence import
  app.js                workspace logic, save and open, print
  fonts/                Inter, weights 400 and 500 (SIL Open Font License)
samples/                a fictitious assessment
tests/                  tests, the regulation text, fixtures
scripts/lint-text.mjs   text lint
docs/                   these pages
_config.yml             Jekyll configuration for these pages
VERIFICATION.md         every regulatory statement, its source, the date checked
```

The scripts are plain browser scripts with no build step and no dependencies. `report.js`, `format.js`, `ward.js`, and `ephi-map.js` do not touch the page, so the tests run them directly under Node.

## Checks: text lint and tests

```bash
npm run check
```

This command runs both of these, as does every pull request and every push to `main`:

- **Text lint** (`npm run lint`): no em dashes, no emoji, and none of a list of filler phrases in anything a reader sees. Quoted regulation text is exempt.
- **Tests** (`npm test`, Node 22 or later): the regulation comparison, the file format and its upgrades, the completeness checks, the report, the flow map against a golden file, the Ward import, the hosting seam, and the stylesheet rules.

CodeQL scans the JavaScript. The checks workflow also builds these pages with the same Jekyll setup GitHub Pages uses and confirms the workspace files are published unchanged. Dependabot opens weekly updates for the GitHub Actions the workflows use.

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

Versions follow [semantic versioning](https://semver.org/). The major version tracks the file format version. Record changes in `CHANGELOG.md`.
