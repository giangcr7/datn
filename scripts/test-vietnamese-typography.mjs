import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createWebLoader } from "./lib/web-component-loader.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
let checks = 0;
function check(label, value) {
  assert(value, label);
  checks++;
}
function fontTable(bytes, wanted) {
  for (let index = 0; index < bytes.readUInt16BE(4); index++) {
    const record = 12 + index * 16;
    if (bytes.toString("ascii", record, record + 4) === wanted) {
      const offset = bytes.readUInt32BE(record + 8);
      return bytes.subarray(offset, offset + bytes.readUInt32BE(record + 12));
    }
  }
  throw new Error("Missing OpenType table: " + wanted);
}
function glyphIndex(cmap, codePoint) {
  for (let index = 0; index < cmap.readUInt16BE(2); index++) {
    const offset = cmap.readUInt32BE(8 + index * 8);
    const format = cmap.readUInt16BE(offset);
    if (format === 12) {
      for (let group = 0; group < cmap.readUInt32BE(offset + 12); group++) {
        const position = offset + 16 + group * 12;
        const start = cmap.readUInt32BE(position);
        const end = cmap.readUInt32BE(position + 4);
        if (codePoint >= start && codePoint <= end)
          return cmap.readUInt32BE(position + 8) + codePoint - start;
      }
    } else if (format === 4 && codePoint <= 65535) {
      const count = cmap.readUInt16BE(offset + 6) / 2;
      const endCodes = offset + 14;
      const startCodes = endCodes + count * 2 + 2;
      const deltas = startCodes + count * 2;
      const ranges = deltas + count * 2;
      for (let segment = 0; segment < count; segment++) {
        const start = cmap.readUInt16BE(startCodes + segment * 2);
        const end = cmap.readUInt16BE(endCodes + segment * 2);
        if (codePoint < start || codePoint > end) continue;
        const delta = cmap.readInt16BE(deltas + segment * 2);
        const rangeOffset = cmap.readUInt16BE(ranges + segment * 2);
        if (!rangeOffset) return (codePoint + delta) & 65535;
        const glyph = cmap.readUInt16BE(
          ranges + segment * 2 + rangeOffset + (codePoint - start) * 2,
        );
        if (glyph) return (glyph + delta) & 65535;
      }
    }
  }
  return 0;
}
function featureTags(table) {
  const list = table.readUInt16BE(6);
  return Array.from({ length: table.readUInt16BE(list) }, (_, index) =>
    table.toString("ascii", list + 2 + index * 6, list + 6 + index * 6),
  );
}
const vietnamese =
  "ÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐàáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ";
const sample =
  "Bằng cấp · Ở đâu · Đỗ Thị Mỹ · TRƯỜNG ĐẠI HỌC THỦY LỢI · XÁC THỰC VĂN BẰNG";
const characters = new Set(
  vietnamese + sample + "\u0300\u0301\u0303\u0309\u0323",
);
for (const [file, hash] of [
  [
    "Roboto-Regular-VF.ttf",
    "d7598e12c5dbef095ff8272cfc55da0250bd07fbdecbac8a530b9b277872a134",
  ],
  [
    "Roboto-Italic-VF.ttf",
    "9725a847af6b460ffca162ae66d20dad48b01876137947180b42d7dcd7887182",
  ],
]) {
  const bytes = await readFile(
    new URL("apps/web/src/fonts/roboto/" + file, root),
  );
  check(
    "unchanged official font: " + file,
    createHash("sha256").update(bytes).digest("hex") === hash,
  );
  const cmap = fontTable(bytes, "cmap");
  for (const character of characters)
    check(
      "Vietnamese glyph " + character + " in " + file,
      glyphIndex(cmap, character.codePointAt(0)) > 0,
    );
  const positioning = featureTags(fontTable(bytes, "GPOS"));
  check(
    "combining marks positioned relative to letters",
    positioning.includes("mark"),
  );
  check(
    "stacked Vietnamese accents positioned relative to each other",
    positioning.includes("mkmk"),
  );
  check(
    "canonical glyph composition available",
    featureTags(fontTable(bytes, "GSUB")).includes("ccmp"),
  );
  const axes = fontTable(bytes, "fvar");
  const offset = axes.readUInt16BE(4);
  const count = axes.readUInt16BE(8);
  const size = axes.readUInt16BE(10);
  const weight = Array.from(
    { length: count },
    (_, index) => offset + index * size,
  ).find(
    (position) => axes.toString("ascii", position, position + 4) === "wght",
  );
  check(
    "real weights cover 100-900",
    weight !== undefined &&
      axes.readInt32BE(weight + 4) / 65536 === 100 &&
      axes.readInt32BE(weight + 12) / 65536 === 900,
  );
}
check(
  "font license retained",
  (await read("apps/web/src/fonts/roboto/OFL.txt")).includes(
    "SIL OPEN FONT LICENSE Version 1.1",
  ),
);
const layout = await read("apps/web/src/app/layout.tsx");
check(
  "font hosted locally, not downloaded at build time",
  layout.includes('from "next/font/local"') &&
    !layout.includes("next/font/google"),
);
check(
  "both font styles registered with variable weight",
  layout.includes("Roboto-Regular-VF.ttf") &&
    layout.includes("Roboto-Italic-VF.ttf") &&
    (layout.match(/weight: "100 900"/g) || []).length === 2,
);
check(
  "font variable inherited by body and overlay portals",
  layout.includes('variable: "--font-roboto"') &&
    layout.includes("className={roboto.variable}"),
);
check("document declares Vietnamese", layout.includes('lang="vi"'));
const styles = [
  "apps/web/src/app/globals.css",
  "apps/web/src/styles/university-portal.module.css",
  "apps/web/src/styles/workspace.module.css",
  "apps/web/src/styles/public-pages.module.css",
  "apps/web/src/app/(public)/search/page.module.css",
];
for (const path of styles) {
  const css = await read(path);
  check(
    "uses shared Roboto family: " + path,
    css.includes("font-family: var(--school-font)"),
  );
  check(
    "no mixed system or serif fonts: " + path,
    !/Segoe UI|Georgia|Times New Roman/.test(css),
  );
}
const globalCss = await read(styles[0]);
check(
  "one global font stack",
  globalCss.includes('--school-font: var(--font-roboto), "Roboto", sans-serif'),
);
check(
  "no synthesized weights or italic accents",
  globalCss.includes("font-synthesis: none"),
);
check(
  "native controls inherit the same font",
  /button,\s*input,\s*select,\s*textarea\s*\{\s*font-family: inherit/.test(
    globalCss,
  ),
);
check(
  "headings leave room for stacked accents",
  /line-height: 1.5/.test(globalCss),
);
const searchCss = await read(styles[4]);
check(
  "lookup controls no longer squeeze accented text into a fixed box",
  /min-height: 44px/.test(searchCss) &&
    /font-size: 14px;\s*line-height: 1.6/.test(searchCss),
);
const theme = createWebLoader()("lib/school-theme.ts").schoolTheme;
check(
  "Ant Design uses Roboto too",
  theme.token.fontFamily === 'var(--font-roboto), "Roboto", sans-serif',
);
console.log(
  "Vietnamese typography checks passed: " +
    checks +
    ". Full glyph coverage and OpenType accent positioning; no database writes or temporary files.",
);
