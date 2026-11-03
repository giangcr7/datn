import ExcelJS from 'exceljs';
import { reportTime, type ReportDocument } from './report-document';

export async function exportReportXlsx(document: ReportDocument) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = document.institutionName;
  workbook.created = new Date(document.generatedAt);
  for (const table of document.tables) {
    const sheet = workbook.addWorksheet(table.name, {
      views: [{ state: 'frozen', ySplit: 7 }],
      pageSetup: {
        paperSize: 9,
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        printTitlesRow: '7:7',
      },
    });
    sheet.columns = table.widths.map((width) => ({ width }));
    sheet.addRows([
      [document.institutionName],
      [document.title + ' - ' + table.title],
      ['Thời điểm xuất', reportTime(document.generatedAt) + ' (giờ Việt Nam)'],
      ['Điều kiện lọc', document.filters],
      ['Tổng số văn bằng', document.total],
      [],
      table.headers,
      ...table.rows,
    ]);
    for (const rowIndex of [1, 2]) {
      sheet.mergeCells(rowIndex, 1, rowIndex, table.headers.length);
      sheet.getRow(rowIndex).font = {
        name: 'Arial',
        size: rowIndex === 2 ? 14 : 12,
        bold: true,
        color: { argb: 'FF17395C' },
      };
      sheet.getRow(rowIndex).height = 30;
    }
    sheet.mergeCells(4, 2, 4, table.headers.length);
    sheet.getRow(4).height = Math.max(
      32,
      Math.ceil(document.filters.length / 110) * 16,
    );
    sheet.autoFilter = {
      from: { row: 7, column: 1 },
      to: { row: Math.max(7, sheet.rowCount), column: table.headers.length },
    };
    sheet.eachRow((row, rowIndex) => {
      if (rowIndex > 2) row.font = { name: 'Arial', size: 11 };
      row.alignment = { vertical: 'middle', wrapText: true };
      if (rowIndex === 7) {
        row.font = {
          name: 'Arial',
          size: 11,
          bold: true,
          color: { argb: 'FFFFFFFF' },
        };
        row.height = 36;
        row.eachCell((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF17395C' },
          };
        });
      } else if (rowIndex > 7) {
        row.height = Math.min(
          409,
          Math.max(
            34,
            ...table.widths.map(
              (width, index) =>
                Math.ceil(
                  String(table.rows[rowIndex - 8][index] ?? '').length /
                    Math.max(1, width - 2),
                ) * 17,
            ),
          ),
        );
        row.eachCell((cell) => {
          if (rowIndex % 2 === 0)
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF0F5FA' },
            };
          if (typeof cell.value === 'string') cell.numFmt = '@';
        });
      }
    });
    sheet.headerFooter.oddFooter = '&L' + table.title + '&RTrang &P / &N';
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
