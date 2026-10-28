import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import QRCode from 'qrcode';
import type {
  EmbeddedFont,
  PDF as PdfDocument,
  PDFPage,
  SignatureField,
} from '@libpdf/core';
import {
  CLASSIFICATION_ENGLISH,
  DEGREE_TITLES,
  latinName,
  type PrintedDiploma,
} from '../database/diploma-print-data';
import { parseDateOnly } from '../database/data-utils';

const assets = resolve(__dirname, '../../assets');
const signatureBoxes = [
  { page: 0, x: 158, y: 116, width: 225, height: 55 },
  { page: 0, x: 516, y: 116, width: 246, height: 55 },
];

async function fonts(pdf: PdfDocument) {
  const bytes = await Promise.all(
    ['Regular', 'Bold', 'Italic'].map((style) =>
      readFile(resolve(assets, 'fonts/Tinos-' + style + '.ttf')),
    ),
  );
  return {
    regular: pdf.embedFont(bytes[0]),
    bold: pdf.embedFont(bytes[1]),
    italic: pdf.embedFont(bytes[2]),
  };
}

function fitText(
  font: EmbeddedFont,
  value: string,
  preferred: number,
  width: number,
) {
  const measured = font.widthOfTextAtSize(value, preferred);
  return measured > width ? (preferred * width) / measured : preferred;
}

function display(value: unknown, _english = false) {
  return typeof value === 'string' && value.trim() ? value.trim() : '-';
}

export function diplomaDate(value: unknown, english = false) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return display(null, english);
  const date = parseDateOnly(value);
  if (!date) return display(null, english);
  return english
    ? new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      }).format(date)
    : value.slice(8, 10) + '/' + value.slice(5, 7) + '/' + value.slice(0, 4);
}

function polygon(points: { x: number; y: number }[]) {
  return (
    points
      .map(
        (point, index) =>
          (index ? 'L' : 'M') + point.x.toFixed(3) + ' ' + point.y.toFixed(3),
      )
      .join(' ') + ' Z'
  );
}

async function ornament(
  page: PDFPage,
  left: number,
  bottom: number,
  width: number,
  height: number,
) {
  const { rgb } = await import('@libpdf/core');
  const gold = rgb(0.72, 0.59, 0.29);
  page.drawRectangle({
    x: left,
    y: bottom,
    width,
    height,
    borderColor: gold,
    borderWidth: 0.7,
    borderOpacity: 0.65,
  });
  page.drawRectangle({
    x: left + 4,
    y: bottom + 4,
    width: width - 8,
    height: height - 8,
    borderColor: gold,
    borderWidth: 0.4,
    borderOpacity: 0.5,
  });
  const leaf = (
    centerX: number,
    centerY: number,
    angle: number,
    scale: number,
  ) => {
    const transform = (pointX: number, pointY: number) => ({
      x:
        centerX + scale * (pointX * Math.cos(angle) - pointY * Math.sin(angle)),
      y:
        centerY + scale * (pointX * Math.sin(angle) + pointY * Math.cos(angle)),
    });
    const curve = (pointX: number, pointY: number) => {
      const point = transform(pointX, pointY);
      return point.x.toFixed(2) + ' ' + point.y.toFixed(2);
    };
    const path =
      'M' +
      curve(-10, 0) +
      ' C' +
      curve(-4, 13) +
      ' ' +
      curve(7, 12) +
      ' ' +
      curve(10, 0) +
      ' C' +
      curve(0, 5) +
      ' ' +
      curve(-2, -5) +
      ' ' +
      curve(-10, 0);
    page.drawSvgPath(path, {
      flipY: false,
      borderColor: gold,
      borderWidth: 0.65,
      borderOpacity: 0.7,
    });
  };
  for (let offset = 18; offset < width - 12; offset += 23) {
    leaf(left + offset, bottom + 2, 0, 0.85);
    leaf(left + offset, bottom + height - 2, Math.PI, 0.85);
  }
  for (let offset = 18; offset < height - 12; offset += 27) {
    leaf(left + 2, bottom + offset, Math.PI / 2, 0.9);
    leaf(left + width - 2, bottom + offset, -Math.PI / 2, 0.9);
  }
  for (const centerX of [left + 2, left + width - 2])
    for (const centerY of [bottom + 2, bottom + height - 2]) {
      for (let petal = 0; petal < 8; petal++)
        leaf(centerX, centerY, (petal * Math.PI) / 4, 0.65);
    }
}

async function drum(
  page: PDFPage,
  centerX: number,
  centerY: number,
  radius: number,
) {
  const { rgb } = await import('@libpdf/core');
  const gold = rgb(0.74, 0.62, 0.36);
  const point = (distance: number, angle: number) => ({
    x: centerX + distance * Math.cos(angle),
    y: centerY + distance * Math.sin(angle),
  });
  for (const fraction of [
    1, 0.98, 0.93, 0.89, 0.85, 0.79, 0.7, 0.66, 0.53, 0.49, 0.42, 0.37,
  ])
    page.drawCircle({
      x: centerX,
      y: centerY,
      radius: radius * fraction,
      borderColor: gold,
      borderWidth: 0.65,
      borderOpacity: 0.27,
    });
  for (let tick = 0; tick < 144; tick++) {
    const angle = (tick * Math.PI * 2) / 144;
    page.drawLine({
      start: point(radius * 0.94, angle),
      end: point(radius * 0.98, angle),
      color: gold,
      opacity: 0.25,
      thickness: 0.6,
    });
  }
  for (let triangle = 0; triangle < 72; triangle++) {
    const angle = (triangle * Math.PI * 2) / 72;
    page.drawSvgPath(
      polygon([
        point(radius * 0.79, angle - 0.035),
        point(radius * 0.87, angle),
        point(radius * 0.79, angle + 0.035),
      ]),
      {
        flipY: false,
        borderColor: gold,
        borderWidth: 0.55,
        borderOpacity: 0.25,
      },
    );
  }
  const star = Array.from({ length: 32 }, (_, index) =>
    point(radius * (index % 2 ? 0.14 : 0.38), (index * Math.PI) / 16),
  );
  page.drawSvgPath(polygon(star), { flipY: false, color: gold, opacity: 0.18 });
  for (let bird = 0; bird < 12; bird++) {
    const angle = (bird * Math.PI) / 6;
    const origin = point(radius * 0.59, angle);
    const vertices = [
      [-12, -1],
      [0, 4],
      [11, -2],
      [2, 1],
      [6, -7],
      [-1, -1],
    ].map(([offsetX, offsetY]) => ({
      x: origin.x + offsetX * Math.cos(angle) - offsetY * Math.sin(angle),
      y: origin.y + offsetX * Math.sin(angle) + offsetY * Math.cos(angle),
    }));
    page.drawSvgPath(polygon(vertices), {
      flipY: false,
      color: gold,
      opacity: 0.22,
    });
  }
}

async function signatureAppearance(
  pdf: PdfDocument,
  width: number,
  height: number,
  lines: string[],
  signed: boolean,
) {
  const { PDF, rgb } = await import('@libpdf/core');
  const source = PDF.create();
  const page = source.addPage({ width, height });
  page.drawRectangle({
    x: 0,
    y: 0,
    width,
    height,
    color: rgb(1, 1, 1),
    opacity: 1,
    borderColor: signed ? rgb(0.19, 0.36, 0.28) : rgb(0.7, 0.65, 0.52),
    borderWidth: 0.6,
  });
  const lineHeight = height / (lines.length + 1);
  const sourceFonts = lines.length ? await fonts(source) : null;
  lines.forEach((line, index) => {
    const font = index === 0 ? sourceFonts!.bold : sourceFonts!.regular;
    page.drawText(line, {
      x: 7,
      y: height - lineHeight * (index + 1) - 2,
      size: fitText(font, line, index === 0 ? 9 : 8.5, width - 14),
      font,
      color: rgb(0.15, 0.25, 0.2),
    });
  });
  const finalized = await PDF.load(await source.save({ subsetFonts: true }));
  return pdf.embedPage(finalized, 0);
}

export async function showDigitalSignature(
  pdf: PdfDocument,
  field: SignatureField,
  order: number,
  actorName: string,
  signedAt: Date,
) {
  if (
    field.isSigned() ||
    !pdf.getMetadata().keywords?.includes('tlu-bilingual-v1')
  )
    return;
  const singleApprover = pdf
    .getMetadata()
    .keywords?.includes('single-campus-one-approver-v1');
  const box = singleApprover
    ? signatureBoxes[1]
    : order === 1 &&
        !pdf.getMetadata().keywords?.includes('diploma-clean-layout-v2')
      ? { page: 1, x: 48, y: 56, width: 352, height: 70 }
      : signatureBoxes[order - 1];
  const signedTime = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(signedAt);
  const appearance = await signatureAppearance(
    pdf,
    box.width,
    box.height,
    [
      singleApprover
        ? 'ĐÃ KÝ SỐ'
        : order === 1
          ? 'ĐÃ KÝ SỐ - CƠ SỞ TP. HỒ CHÍ MINH'
          : 'ĐÃ KÝ SỐ - TRỤ SỞ HÀ NỘI',
      actorName,
      signedTime,
    ],
    true,
  );
  const page = pdf.getPage(box.page);
  if (!page) throw new Error('Missing digital signature page');
  page.drawPage(appearance, {
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
  });
}

export async function renderBilingualDiploma(
  payload: Record<string, unknown>,
  verifyUrl: string,
  demo: boolean,
  preview = false,
  singleApprover = false,
) {
  const { PDF, rgb } = await import('@libpdf/core');
  const pdf = PDF.create();
  const typefaces = await fonts(pdf);
  const printed = payload.printedDiploma as PrintedDiploma | undefined;
  const degreeType = String(printed?.degreeType || payload.degreeType || '');
  const degree = DEGREE_TITLES[degreeType as keyof typeof DEGREE_TITLES] || {
    vi: 'VĂN BẰNG',
    en: 'DIPLOMA',
  };
  const page = pdf.addPage({ size: 'a4', orientation: 'landscape' });
  const black = rgb(0.08, 0.07, 0.06);
  const red = rgb(0.63, 0.12, 0.11);
  const text = (
    target: PDFPage,
    value: unknown,
    positionX: number,
    positionY: number,
    size: number,
    width: number,
    font = typefaces.regular,
    centered = false,
    color = black,
  ) => {
    const content = String(value ?? '');
    const fontSize = fitText(font, content, size, width);
    target.drawText(content, {
      x: centered
        ? positionX - font.widthOfTextAtSize(content, fontSize) / 2
        : positionX,
      y: positionY,
      size: fontSize,
      font,
      color,
    });
  };
  const center = (
    value: unknown,
    positionX: number,
    positionY: number,
    size = 14,
    width = 355,
    font = typefaces.bold,
    color = black,
  ) => text(page, value, positionX, positionY, size, width, font, true, color);
  await ornament(page, 20, 22, 389, 550);
  await ornament(page, 433, 22, 389, 550);
  await drum(page, 215, 292, 115);
  const emblem = pdf.embedPng(
    await readFile(resolve(assets, 'diploma/national-emblem-gold.png')),
  );
  page.drawImage(emblem, {
    x: 523,
    y: 201,
    width: 213,
    height: 217,
    opacity: 0.43,
  });
  center('THE SOCIALIST REPUBLIC OF VIETNAM', 215, 546, 13.7);
  center('Independence - Freedom - Happiness', 215, 532, 12.8);
  center('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', 628, 546, 13.1);
  center('Độc lập - Tự do - Hạnh phúc', 628, 532, 13.8);
  center('THE PRESIDENT OF', 215, 501, 14.2);
  center(
    display(printed?.institutionNameEn, true).toUpperCase(),
    215,
    484,
    14.2,
  );
  center('HIỆU TRƯỞNG', 628, 501, 15);
  center(
    display(
      printed?.institutionName || 'Trường Đại học Thủy lợi',
    ).toUpperCase(),
    628,
    484,
    14.6,
  );
  center('Confers', 215, 451, 14.5);
  center('Cấp', 628, 451, 15);
  center(degree.en, 215, 419, 20.5, 352, typefaces.bold, red);
  center(degree.vi, 628, 419, 22, 352, typefaces.bold, red);
  center(
    printed?.majorNameEn ? 'In ' + printed.majorNameEn : display(null, true),
    215,
    359,
    16.5,
  );
  center(display(payload.major), 628, 359, 17);
  text(page, 'Upon:', 65, 312, 14, 80);
  text(
    page,
    printed?.fullNameLatin || latinName(String(payload.fullName || '')),
    160,
    312,
    16,
    215,
    typefaces.bold,
  );
  text(page, 'Cho:', 484, 312, 15, 70);
  text(page, display(payload.fullName), 545, 312, 16.5, 240, typefaces.bold);
  text(page, 'Date of birth:', 65, 286, 14, 125);
  text(page, diplomaDate(payload.dob, true), 185, 286, 15, 188, typefaces.bold);
  text(page, 'Ngày sinh:', 484, 286, 15, 110);
  text(page, diplomaDate(payload.dob), 583, 286, 16, 190, typefaces.bold);
  text(page, 'Degree classification:', 65, 260, 13.8, 190);
  text(
    page,
    CLASSIFICATION_ENGLISH[String(payload.grade)] || display(null, true),
    257,
    260,
    15,
    126,
    typefaces.bold,
  );
  text(page, 'Hạng tốt nghiệp:', 484, 260, 14.5, 155);
  text(page, display(payload.grade), 638, 260, 16, 140, typefaces.bold);
  const issueDate =
    typeof payload.issueDate === 'string' ? payload.issueDate : null;
  const issueLine = issueDate
    ? (printed?.issuePlace ? printed.issuePlace + ', ' : '') +
      'ngày ' +
      Number(issueDate.slice(8, 10)) +
      ' tháng ' +
      Number(issueDate.slice(5, 7)) +
      ' năm ' +
      issueDate.slice(0, 4)
    : 'Ngày cấp: -';
  center(issueLine, 638, 201, 12.5, 337, typefaces.italic);
  center(
    demo
      ? 'XÁC NHẬN CHỮ KÝ SỐ'
      : printed?.diplomaSignerTitle || 'XÁC NHẬN CHỮ KÝ SỐ',
    638,
    181,
    14.5,
    315,
  );
  if (!demo && printed?.diplomaSignerName)
    center(printed.diplomaSignerName, 638, 102, 13.2, 315);
  text(page, 'Serial number:', 42, 66, 10.8, 90);
  text(
    page,
    display(payload.soHieu),
    134,
    66,
    13.8,
    250,
    typefaces.bold,
    false,
    red,
  );
  text(page, 'Reference number:', 42, 44, 10, 104);
  text(page, display(payload.soVaoSo), 150, 44, 11.2, 236, typefaces.bold);
  text(page, 'Số hiệu:', 453, 66, 11.6, 70);
  text(
    page,
    display(payload.soHieu),
    513,
    66,
    14,
    278,
    typefaces.bold,
    false,
    red,
  );
  text(page, 'Số vào sổ gốc cấp văn bằng:', 453, 44, 10.5, 180);
  text(page, display(payload.soVaoSo), 629, 44, 11, 173, typefaces.bold);
  if (!singleApprover) center('CAMPUS CONFIRMATION', 270, 181, 11.5, 225);
  const qr = pdf.embedPng(
    await QRCode.toBuffer(verifyUrl, {
      width: 256,
      margin: 2,
      errorCorrectionLevel: 'M',
    }),
  );
  page.drawImage(qr, { x: 64, y: 116, width: 58, height: 58 });
  center('Verify diploma', 93, 103, 8, 90, typefaces.regular);
  if (preview)
    text(
      page,
      'BẢN XEM TRƯỚC - CHƯA KÝ SỐ',
      page.width / 2,
      8,
      8.5,
      790,
      typefaces.bold,
      true,
      red,
    );
  pdf.setMetadata({
    title: 'Văn bằng - ' + display(payload.fullName),
    subject: 'Văn bằng song ngữ ký số - ' + String(payload.uuid),
    creator: 'DiplomaChain',
    keywords: [
      'tlu-bilingual-v1',
      'diploma-clean-layout-v2',
      ...(singleApprover ? ['single-campus-one-approver-v1'] : []),
      preview ? 'DIPLOMA_PREVIEW' : 'SIGNED_DIPLOMA',
    ],
  });
  const form = pdf.getOrCreateForm();
  form.createSignatureField('CampusApproval');
  if (!singleApprover) form.createSignatureField('HeadquartersIssue');
  return Buffer.from(await pdf.save({ subsetFonts: true }));
}
