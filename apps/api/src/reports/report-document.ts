import type { RegisterQueryDto } from '../cert/register-query.dto';
import type { diplomaProjection } from '../database/diploma-projection';
import type { ReportGroup, ReportStatistics } from './reports-query';

export const reportStatuses: Record<string, string> = {
  ON_CHAIN: 'Đang hiệu lực',
  REVOKED: 'Đã thu hồi',
  REPLACED: 'Đã thay thế',
};
export type ReportCell = string | number;
export interface ReportTable {
  name: string;
  title: string;
  headers: string[];
  widths: number[];
  rows: ReportCell[][];
}
export interface ReportDocument {
  title: string;
  institutionName: string;
  generatedAt: string;
  filters: string;
  total: number;
  tables: ReportTable[];
}
export interface ReportOverview extends ReportStatistics {
  institutionName: string;
  generatedAt: string;
  filters: string;
}
export function reportDate(value?: string | null) {
  return value?.replace(/^(\d{4})-(\d{2})-(\d{2}).*$/, '$3/$2/$1') || '';
}
export function reportTime(value: string) {
  return new Date(value).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
  });
}
export function reportFilters(query: RegisterQueryDto) {
  return (
    [
      query.search && 'Tìm kiếm: ' + query.search,
      query.year && 'Năm tốt nghiệp: ' + query.year,
      query.major && 'Ngành: ' + query.major,
      query.grade && 'Xếp loại: ' + query.grade,
      query.decision && 'Quyết định: ' + query.decision,
      query.status && 'Trạng thái: ' + reportStatuses[query.status],
      query.issuedFrom && 'Ngày cấp từ: ' + reportDate(query.issuedFrom),
      query.issuedTo && 'Ngày cấp đến: ' + reportDate(query.issuedTo),
    ]
      .filter(Boolean)
      .join('; ') || 'Tất cả văn bằng đã phát hành'
  );
}

export function statisticsDocument(overview: ReportOverview): ReportDocument {
  const table = (
    name: string,
    title: string,
    rows: ReportGroup[],
  ): ReportTable => ({
    name,
    title,
    headers: ['Nhóm', 'Tổng', 'Đang hiệu lực', 'Đã thu hồi', 'Đã thay thế'],
    widths: [54, 12, 18, 16, 18],
    rows: rows.map((row) => [
      reportStatuses[row.name] || row.name,
      row.total,
      row.active,
      row.revoked,
      row.replaced,
    ]),
  });
  return {
    title: 'BÁO CÁO THỐNG KÊ VĂN BẰNG',
    ...overview,
    total: overview.summary.total,
    tables: [
      table('TongHop', 'Tổng hợp', [
        { name: 'Toàn bộ kết quả lọc', ...overview.summary },
      ]),
      table('TheoNam', 'Theo năm tốt nghiệp', overview.byYear),
      table('TheoNganh', 'Theo ngành đào tạo', overview.byMajor),
      table('TheoXepLoai', 'Theo xếp loại', overview.byGrade),
      table('TheoTrangThai', 'Theo trạng thái', overview.byStatus),
    ],
  };
}

type RegisterRecord = ReturnType<typeof diplomaProjection>;
export function registerDocument(
  metadata: Pick<ReportDocument, 'institutionName' | 'generatedAt' | 'filters'>,
  entries: RegisterRecord[],
): ReportDocument {
  return {
    ...metadata,
    title: 'SỔ PHÁT HÀNH VĂN BẰNG',
    total: entries.length,
    tables: [
      {
        name: 'SoPhatHanh',
        title: 'Sổ phát hành',
        headers: [
          'STT',
          'Họ và tên',
          'MSSV',
          'Ngày sinh',
          'Ngành đào tạo',
          'Lớp',
          'GPA',
          'Xếp loại',
          'Năm tốt nghiệp',
          'Số hiệu văn bằng',
          'Số vào sổ',
          'Ngày cấp',
          'Số quyết định tốt nghiệp',
          'Ngày quyết định',
          'Trạng thái',
          'Ngày thu hồi',
          'Lý do thu hồi',
        ],
        widths: [
          7, 28, 18, 14, 40, 18, 10, 20, 18, 24, 26, 14, 30, 18, 20, 24, 45,
        ],
        rows: entries.map((entry, index) => [
          index + 1,
          entry.fullName || '',
          entry.mssv == null ? '' : String(entry.mssv),
          reportDate(entry.dob),
          entry.major || '',
          entry.className || '',
          entry.gpa ?? '',
          entry.grade || '',
          entry.namTotNghiep ?? '',
          entry.soHieu || '',
          entry.soVaoSo || '',
          reportDate(entry.issueDate),
          entry.decisionNo || '',
          reportDate(entry.decisionDate),
          reportStatuses[entry.status] || entry.status,
          entry.revokedAt
            ? reportTime(new Date(entry.revokedAt).toISOString())
            : '',
          entry.revokedReason || '',
        ]),
      },
      {
        name: 'DoiChieuBlockchain',
        title: 'Thông tin đối chiếu blockchain',
        headers: [
          'STT',
          'Số hiệu văn bằng',
          'Số vào sổ',
          'Phiên bản',
          'Hash dữ liệu',
          'Hash PDF đã ký',
          'Mã giao dịch phát hành',
        ],
        widths: [7, 24, 26, 12, 68, 68, 68],
        rows: entries.map((entry, index) => [
          index + 1,
          entry.soHieu || '',
          entry.soVaoSo || '',
          entry.version ?? '',
          entry.certHash || '',
          entry.signedPdfHash || '',
          entry.txId || '',
        ]),
      },
    ],
  };
}

export function registerPdfTables(document: ReportDocument): ReportTable[] {
  const main = document.tables[0];
  return [
    {
      ...main,
      headers: [
        'STT',
        'Họ tên / MSSV',
        'Ngày sinh',
        'Ngành / Lớp',
        'Xếp loại / Năm TN',
        'Số hiệu',
        'Số vào sổ',
        'Quyết định',
        'Ngày cấp',
        'Trạng thái',
      ],
      widths: [26, 104, 52, 130, 67, 78, 80, 82, 54, 73],
      rows: main.rows.map((row) => [
        row[0],
        row[1] + '\n' + row[2],
        row[3],
        row[4] + '\n' + row[5],
        row[7] + '\n' + row[8] + (row[6] === '' ? '' : '\nGPA: ' + row[6]),
        row[9],
        row[10],
        row[12] + '\n' + row[13],
        row[11],
        row[14] + (row[15] ? '\n' + row[15] : ''),
      ]),
    },
    {
      ...document.tables[1],
      headers: [
        'STT',
        'Số hiệu / Số vào sổ / Phiên bản',
        'Hash dữ liệu / Hash PDF đã ký',
        'Mã giao dịch phát hành',
      ],
      widths: [30, 150, 330, 306],
      rows: document.tables[1].rows.map((row) => [
        row[0],
        row[1] + '\n' + row[2] + '\nPhiên bản: ' + row[3],
        row[4] + '\n' + (row[5] || 'Chưa ghi nhận hash PDF'),
        row[6] || 'Chưa ghi nhận mã giao dịch',
      ]),
    },
    ...(main.rows.some((row) => row[16])
      ? [
          {
            name: 'ThuHoi',
            title: 'Chi tiết thu hồi',
            headers: [
              'STT',
              'Số hiệu / Họ tên',
              'Ngày thu hồi',
              'Lý do thu hồi',
            ],
            widths: [30, 180, 110, 496],
            rows: main.rows
              .filter((row) => row[16])
              .map((row) => [row[0], row[9] + '\n' + row[1], row[15], row[16]]),
          },
        ]
      : []),
  ];
}
