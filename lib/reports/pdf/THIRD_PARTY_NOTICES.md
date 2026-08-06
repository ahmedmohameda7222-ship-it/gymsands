# P8A PDF third-party notices

P8A vendors exact, reviewable runtime artifacts and font files inside `lib/reports/pdf/`. The report route reads only these repository-local files; it performs no request-time font, CDN, operating-system-font, or package-registry lookup. `package.json` and `package-lock.json` are unchanged.

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

- Vendored runtime: `@pdf-lib/fontkit@1.1.1` UMD distribution (`vendor/fontkit.cjs`)
- License: MIT
- P8A usage: registered with the existing `pdf-lib` authority for custom-font embedding and OpenType shaping.

## bidi-js

- Vendored runtime: `bidi-js@1.0.3` CommonJS distribution (`vendor/bidi.cjs`)
- Upstream: `lojjic/bidi-js`
- License: MIT
- Repository copy of notice: `assets/BIDI-LICENSE.txt`
- P8A usage: Unicode bidirectional embedding levels, visual run order, and mirrored punctuation. Arabic characters are not manually reversed.

Vendored JavaScript artifact checksums are recorded in `vendor/ARTIFACTS.md` when the exact pinned npm distributions are materialized. Compatibility is verified by exact-head install, typecheck, focused font/bidi/PDF tests, rendered PDF inspection, and the repository validation authorities.
