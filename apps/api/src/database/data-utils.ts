import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';

export const CLASSIFICATION_LABELS = {
  EXCELLENT: 'Xuất sắc',
  VERY_GOOD: 'Giỏi',
  GOOD: 'Khá',
  AVERAGE_GOOD: 'Trung bình khá',
  AVERAGE: 'Trung bình',
} as const;

export function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ');
}

export function lookupText(value: unknown): string {
  return normalizeText(value).toLocaleLowerCase('vi-VN');
}

export function classificationFrom(value: unknown) {
  const normalized = lookupText(value);
  const match = Object.entries(CLASSIFICATION_LABELS).find(
    ([code, label]) =>
      normalized === lookupText(label) || normalized === code.toLowerCase(),
  );
  return match ? (match[0] as keyof typeof CLASSIFICATION_LABELS) : null;
}

export function jsonData(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value));
}

export function dateOnly(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export function parseDateOnly(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }
  const normalized = normalizeText(value).toLowerCase();
  const iso = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const local = normalized.match(
    /(?:ngày\s*)?(\d{1,2})(?:\s+tháng\s+|\/|-)(\d{1,2})(?:\s+năm\s+|\/|-)(\d{4})$/,
  );
  if (!iso && !local) return null;
  const year = Number(iso ? iso[1] : local![3]);
  const month = Number(iso ? iso[2] : local![2]);
  const day = Number(iso ? iso[3] : local![1]);
  const result = new Date(Date.UTC(year, month - 1, day));
  return result.getUTCFullYear() === year &&
    result.getUTCMonth() === month - 1 &&
    result.getUTCDate() === day
    ? result
    : null;
}

export function pagination(page = 1, limit = 20) {
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    throw new BadRequestException(
      'Trang phải >= 1, kích thước trang từ 1 đến 100',
    );
  }
  return { skip: (page - 1) * limit, take: limit };
}
