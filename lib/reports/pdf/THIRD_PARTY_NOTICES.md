# P8A PDF third-party notices

P8A keeps executable JavaScript runtime dependencies under the repository's normal npm package authority. Exact production dependency versions are declared in `package.json`, resolved with integrity metadata in `package-lock.json`, installed through `npm ci`, and covered by the exact-head dependency audit. No executable third-party bundle is stored under `lib/reports/pdf/vendor/`.

The report route performs no request-time font, CDN, operating-system-font, self-HTTP, or package-registry lookup. Its repository-owned font files are statically resolved and included in the built route trace.

## Noto Sans and Noto Sans Arabic

- Assets: Noto Sans Regular/Bold and Noto Sans Arabic Regular/Bold TrueType files
- Upstream family: Google Noto Fonts
- License: SIL Open Font License 1.1
- Repository copy of the license text: `assets/NOTO-LICENSE.txt`
- P8A usage: repository-local TTF assets are embedded and subset into generated PDFs.
- SHA-256:
  - `NotoSans-Regular.ttf`: `89c3c497f618fdaa0b2d1e98fef93582f28c71debd2c4a8cdf41f190ced2909d`
  - `NotoSans-Bold.ttf`: `e83493c945848ecd4a9ad0f6d19164541a0d3e23a9c952304a00a46e00272ac5`
  - `NotoSansArabic-Regular.ttf`: `504d7407d86875acf7d04dfaa0fd7524d0b8797723bc4aa18022f29db25b0b6e`
  - `NotoSansArabic-Bold.ttf`: `ded6fc7359ca36d15d7aab9ef0c066e21ce48b26a069994d6602fa2cb9a1b952`

## @pdf-lib/fontkit

- Package-managed runtime dependency: `@pdf-lib/fontkit@1.1.1`
- License: MIT
- P8A usage: registered with the existing `pdf-lib` authority for custom-font embedding and OpenType shaping.
- Integrity authority: exact version and resolved package integrity are recorded in `package-lock.json`.

## bidi-js

- Package-managed runtime dependency: `bidi-js@1.0.3`
- Upstream: `lojjic/bidi-js`
- License: MIT
- Repository copy of the license notice: `assets/BIDI-LICENSE.txt`
- P8A usage: Unicode bidirectional embedding levels, visual run order, and mirrored punctuation. Arabic characters are not manually reversed.
- Integrity authority: exact version and resolved package integrity are recorded in `package-lock.json`.
