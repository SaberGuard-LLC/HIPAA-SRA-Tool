# Regulation fixture

`tests/fixture.test.mjs` compares the regulation text on every catalog row in `assets/catalog.js` with the official text of 45 CFR Part 164, Subpart C. The official text is a US government work and is kept here unchanged.

Expected files:

- One `.xml` file holding the text of 45 CFR Part 164, Subpart C (sections 164.302 to 164.318 and Appendix A to Subpart C), from one of these sources:
  - eCFR versioner API (current text, dated in the URL): `https://www.ecfr.gov/api/versioner/v1/full/YYYY-MM-DD/title-45.xml?part=164&subpart=C`
  - govinfo bulk data (annual edition): the `CFR-YYYY-title45-vol2` package, Part 164 Subpart C
- `fixture.json` with the retrieval details:

```json
{ "retrieved": "YYYY-MM-DD", "url": "https://www.ecfr.gov/api/versioner/v1/full/YYYY-MM-DD/title-45.xml?part=164&subpart=C", "upToDateAsOf": "YYYY-MM-DD" }
```

`CATALOG_SOURCE.checked` in `assets/catalog.js` must equal `retrieved`. When the fixture is refreshed, update both.

The parser in the test reads the eCFR `DIV8` section elements and the govinfo `SECTION` elements. If a source changes its markup, adjust the parser, not the fixture.
