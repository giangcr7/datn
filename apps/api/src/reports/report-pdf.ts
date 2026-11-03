import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { EmbeddedFont, PDFPage } from '@libpdf/core';
import {
  registerPdfTables,
  reportTime,
  type ReportDocument,
  type ReportCell,
} from './report-document';

function wrap(
  value: ReportCell,
  font: EmbeddedFont,
  size: number,
  width: number,
) {
  const lines: string[] = [];
  const text = String(value ?? '')
    .normalize('NFC')
    .replace(/\p{Cc}/gu, (character) => (character === '\n' ? '\n' : ' '));
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      if (line && font.widthOfTextAtSize(line + ' ' + word, size) <= width) {
        line += ' ' + word;
        continue;
      }
      if (line) {
        lines.push(line);
        line = '';
      }
      for (const character of word) {
        if (line && font.widthOfTextAtSize(line + character, size) > width) {
          lines.push(line);
          line = '';
        }
        line += character;
      }
    }
    lines.push(line);
  }
  return lines;
}

export async function exportReportPdf(
  document: ReportDocument,
  register: boolean,
) {
  const { PDF, rgb } = await import('@libpdf/core');
  const pdf = PDF.create();
  pdf.setTitle(document.title);
  pdf.setAuthor(document.institutionName);
  const fonts = await Promise.all(
    ['Regular', 'Bold'].map((style) =>
      readFile(
        resolve(__dirname, '../../assets/fonts/Tinos-' + style + '.ttf'),
      ),
    ),
  );
  const regular = pdf.embedFont(fonts[0]);
  const bold = pdf.embedFont(fonts[1]);
  const ink = rgb(0.09, 0.19, 0.3);
  const gray = rgb(0.34, 0.39, 0.44);
  const white = rgb(1, 1, 1);
  const pages: PDFPage[] = [];
  const pageWidth = register ? 841.89 : 595.28;
  const pageHeight = register ? 595.28 : 841.89;
  const margin = 32,
    width = pageWidth - margin * 2,
    bottom = 38,
    size = 9,
    leading = 11;
  let page: PDFPage,
    cursor = 0;
  const text = (
    value: string,
    positionX: number,
    positionY: number,
    fontSize = size,
    font = regular,
    color = ink,
  ) => {
    page.drawText(value, {
      x: positionX,
      y: positionY,
      size: fontSize,
      font,
      color,
    });
  };
  const paragraph = (value: string, fontSize: number, font: EmbeddedFont) => {
    for (const line of wrap(value, font, fontSize, width)) {
      text(line, margin, cursor, fontSize, font);
      cursor -= fontSize + 3;
    }
  };
  for (const table of register
    ? registerPdfTables(document)
    : document.tables) {
    const totalWidth = table.widths.reduce(
      (total, column) => total + column,
      0,
    );
    const widths = table.widths.map((column) => (width * column) / totalWidth);
    const headerLines = table.headers.map((header, index) =>
      wrap(header, bold, size, widths[index] - 10),
    );
    const headerHeight =
      Math.max(...headerLines.map((lines) => lines.length)) * leading + 12;
    let pageRowCapacity = 0;
    const tableHeader = () => {
      paragraph(table.title, 12, bold);
      cursor -= 4;
      page.drawRectangle({
        x: margin,
        y: cursor - headerHeight,
        width,
        height: headerHeight,
        color: ink,
      });
      let positionX = margin;
      headerLines.forEach((lines, index) => {
        lines.forEach((line, lineIndex) =>
          text(
            line,
            positionX + 5,
            cursor - 12 - lineIndex * leading,
            size,
            bold,
            white,
          ),
        );
        positionX += widths[index];
      });
      cursor -= headerHeight;
    };
    const nextPage = () => {
      page = pdf.addPage({ width: pageWidth, height: pageHeight });
      pages.push(page);
      cursor = pageHeight - margin;
      paragraph(document.institutionName, 11, bold);
      paragraph(document.title, 14, bold);
      paragraph(
        'Thời điểm xuất: ' +
          reportTime(document.generatedAt) +
          ' (giờ Việt Nam)',
        9,
        regular,
      );
      paragraph('Điều kiện lọc: ' + document.filters, 9, regular);
      paragraph('Tổng số văn bằng: ' + document.total, 9, regular);
      cursor -= 6;
      tableHeader();
      pageRowCapacity = cursor - bottom;
    };
    if (register || !pages.length || cursor - bottom < headerHeight + 70)
      nextPage();
    else {
      cursor -= 18;
      tableHeader();
    }
    if (!table.rows.length) {
      cursor -= 20;
      paragraph('Không có dữ liệu', 10, regular);
    }
    table.rows.forEach((row, rowIndex) => {
      const cells = row.map((cell, index) =>
        wrap(cell, regular, size, widths[index] - 10),
      );
      const lineCount = Math.max(...cells.map((lines) => lines.length));
      const rowHeight = lineCount * leading + 12;
      if (rowHeight > cursor - bottom && rowHeight <= pageRowCapacity)
        nextPage();
      let offset = 0;
      while (offset < lineCount) {
        if (cursor - bottom < leading + 12) nextPage();
        const count = Math.min(
          lineCount - offset,
          Math.floor((cursor - bottom - 12) / leading),
        );
        const height = count * leading + 12;
        if (rowIndex % 2 === 0)
          page.drawRectangle({
            x: margin,
            y: cursor - height,
            width,
            height,
            color: rgb(0.94, 0.96, 0.98),
          });
        let positionX = margin;
        cells.forEach((lines, column) => {
          lines
            .slice(offset, offset + count)
            .forEach((line, index) =>
              text(line, positionX + 5, cursor - 13 - index * leading),
            );
          positionX += widths[column];
        });
        cursor -= height;
        offset += count;
        if (offset < lineCount) nextPage();
      }
    });
  }
  pages.forEach((target, index) => {
    page = target;
    text(
      'Trang ' + (index + 1) + ' / ' + pages.length,
      margin,
      20,
      8,
      regular,
      gray,
    );
  });
  return Buffer.from(await pdf.save({ subsetFonts: true }));
}
