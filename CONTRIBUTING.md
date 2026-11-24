# Contributing

Thank you for helping with SaberGuard SRA Workspace. This page covers how to report a problem, how to propose a change, and the rules a change has to meet.

## Before you start

- Read the [development guide](docs/development.md) for the repository layout, the checks, and how to refresh the regulation text.
- Never include protected health information, a real client's assessment file, or a screenshot of real assessment data in an issue, a pull request, or a test fixture. A made-up file that shows the problem is enough.
- Report security problems privately, as described in [SECURITY.md](SECURITY.md). Do not open a public issue for them.

## Reporting a problem or asking for a change

Open an issue from one of the templates:

- **Bug report**: what you did, what you expected, what happened, and the browser and version.
- **Feature request**: the assessor's problem, not only the solution you have in mind.
- **Regulation or source correction**: the catalog row id, the citation, and the source you are reading. Statements about the regulation are checked against the eCFR text before they change.

## Proposing a change

1. Open an issue first for anything larger than a typo, so the approach can be agreed before you spend time on it.
2. Fork the repository and create a branch from `main`.
3. Make the change, with tests for any behavior you add or change.
4. Run the checks with Node 22 or later:

   ```bash
   npm run check
   ```

5. Open a pull request and fill in the template.

The workspace has no build step. Open `index.html` in a browser, or serve the folder with any static server, to try a change:

```bash
python3 -m http.server 8000
```

## Rules every change must meet

These rules come from the product's promises to the people who use it. A test or the text lint enforces most of them.

### Privacy and security

- No network connections of any kind. The Content Security Policy sets `connect-src 'none'`, and a test checks that no script calls `fetch`, `XMLHttpRequest`, `WebSocket`, or `sendBeacon`.
- No browser storage: no cookies, `localStorage`, `sessionStorage`, or IndexedDB.
- No runtime dependencies, no third-party scripts or fonts, and no build step for the workspace.
- Treat every value read from a file as untrusted. Validate it on open, and escape text before it is shown.

### Regulation text

- The regulation's wording in `assets/catalog.js` is never edited by hand. It is compared by test with the official eCFR text in `tests/fixtures/`.
- Any new statement about the regulation that a reader sees gets a row in `VERIFICATION.md` with its source and the date it was checked.
- Catalog row ids are never reused with a new meaning.

### Saved files

- Files saved by every earlier format version must still open without loss.
- A change to the saved format raises the format version and adds an upgrade test in `tests/format.test.mjs`.
- The hosting seam on `window.SRA` (`snapshot()`, `importAssessment()`, `markSaved()`, `isDirty()`, `setTheme()`) must keep working for hosts that use it.

### Design

- Flat: no gradients, shadows, blur, or glow.
- Two font weights: 400, and 500 for headings and emphasis.
- Sentence case for headings, labels, and buttons.
- Interface text at least 11 px. Report text at least 8.25 pt.
- Colors only from the tokens in `assets/styles.css`, defined for both themes.
- No icon library. Controls are labelled with words.

### Writing and code style

- No em dashes and no emoji anywhere. `npm run lint` checks reader-facing text.
- Plain, specific language. The lint rejects a short list of filler words.
- No code comments explaining what code does; name things clearly instead. Leave existing comments alone unless you rewrite the code around them.
- Match the existing style of the file you are editing.

## Commits and pull requests

- One logical change per commit, with a short imperative subject under 72 characters, for example `Show the evidence hash in the catalog row`. Add a body when the reason is not obvious.
- Update `CHANGELOG.md` when an assessor will notice the change.
- Keep pull requests focused. A refactor and a feature are easier to review apart.
- Every pull request runs the text lint, the tests, the docs site build, CodeQL, Semgrep, a secret scan, workflow lint, and dependency review. All must pass before merge.

## License of contributions

The project is licensed under the [PolyForm Shield License 1.0.0](LICENSE). SaberGuard also offers the software under commercial licenses.

By submitting a contribution, you confirm that you have the right to submit it, and you agree that SaberGuard LLC may distribute your contribution under the PolyForm Shield License 1.0.0, under its commercial licenses, and under any later license it chooses for the project. If you cannot agree to this, say so in the pull request before it is reviewed.

## Questions

Open an [issue](https://github.com/SaberGuard-LLC/HIPAA-SRA-Tool/issues/new/choose), or contact SaberGuard at <https://saberguard.tech/contact>.
