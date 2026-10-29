# Roboto web fonts

Unmodified variable TrueType fonts from the Google Fonts repository:

- Source: https://github.com/google/fonts/tree/1c627bfa375fc51cf86fabeca4f6e08a95f0aa5c/ofl/roboto
- License: SIL Open Font License 1.1; see `OFL.txt`.
- `Roboto-Regular-VF.ttf` is upstream `Roboto[wdth,wght].ttf`.
- `Roboto-Italic-VF.ttf` is upstream `Roboto-Italic[wdth,wght].ttf`.
- SHA-256 (regular): `d7598e12c5dbef095ff8272cfc55da0250bd07fbdecbac8a530b9b277872a134`.
- SHA-256 (italic): `9725a847af6b460ffca162ae66d20dad48b01876137947180b42d7dcd7887182`.

Both files retain the full upstream character map, Vietnamese precomposed
letters, combining marks, and OpenType shaping tables. The weight axis spans
100-900; the width axis stays at its default. Do not replace these files with
Latin-only subsets. Next.js serves them locally through `next/font/local`;
visitors do not need Google Fonts network access.

Run `node scripts/test-vietnamese-typography.mjs` to check font integrity,
Vietnamese glyph coverage, shaping features, and shared web typography.
