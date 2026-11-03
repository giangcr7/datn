import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthActor } from '../auth/auth-actor';
import { DatabaseService } from '../database/database.service';
import {
  diplomaInclude,
  diplomaProjection,
} from '../database/diploma-projection';
import { registerQuery } from '../cert/diploma-register';
import type { RegisterQueryDto } from '../cert/register-query.dto';
import { statisticsQuery, type ReportStatistics } from './reports-query';
import {
  reportFilters,
  registerDocument,
  statisticsDocument,
  type ReportOverview,
} from './report-document';
import type { ReportExportQueryDto } from './report-query.dto';
import { exportReportXlsx } from './report-xlsx';
import { exportReportPdf } from './report-pdf';

@Injectable()
export class ReportsService {
  constructor(private readonly database: DatabaseService) {}

  private authorize(actor: AuthActor, query: RegisterQueryDto) {
    if (
      !actor?.institutionId ||
      !(
        actor.role === 'admin' ||
        (actor.role === 'university' &&
          actor.isHeadquarters &&
          actor.canApproveDiplomas &&
          actor.campusId)
      )
    )
      throw new ForbiddenException('Không có quyền xem báo cáo nhà trường');
    if (query.issuedFrom && query.issuedTo && query.issuedFrom > query.issuedTo)
      throw new BadRequestException(
        'Ngày cấp từ phải trước hoặc bằng ngày cấp đến',
      );
  }

  async overview(
    query: RegisterQueryDto,
    actor: AuthActor,
  ): Promise<ReportOverview> {
    this.authorize(actor, query);
    return this.database.$transaction(
      async (transaction) => {
        const institution = await transaction.institution.findUniqueOrThrow({
          where: { id: actor.institutionId },
          select: { name: true },
        });
        const [statistics] = await transaction.$queryRaw<ReportStatistics[]>(
          statisticsQuery(actor.institutionId, query),
        );
        return {
          ...statistics,
          institutionName: institution.name,
          generatedAt: new Date().toISOString(),
          filters: reportFilters(query),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async export(query: ReportExportQueryDto, actor: AuthActor) {
    this.authorize(actor, query);
    const document =
      query.kind === 'statistics'
        ? statisticsDocument(await this.overview(query, actor))
        : await this.database.$transaction(
            async (transaction) => {
              const maximum = query.format === 'pdf' ? 1000 : 10000;
              const [result] = await transaction.$queryRaw<
                { total: number; ids: string[] }[]
              >(
                registerQuery(actor.institutionId, {
                  ...query,
                  page: 1,
                  limit: maximum,
                }),
              );
              if (result.total > maximum)
                throw new BadRequestException(
                  'Kết quả vượt ' +
                    maximum +
                    ' văn bằng cho định dạng này. Anh lọc theo năm, ngành hoặc ngày cấp để xuất từng phần.',
                );
              const institution =
                await transaction.institution.findUniqueOrThrow({
                  where: { id: actor.institutionId },
                  select: { name: true },
                });
              const entries = result.ids.length
                ? await transaction.diploma.findMany({
                    where: {
                      institutionId: actor.institutionId,
                      id: { in: result.ids },
                    },
                    include: diplomaInclude,
                    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                  })
                : [];
              if (entries.length !== result.total)
                throw new BadRequestException(
                  'Không đọc đủ dữ liệu sổ phát hành; vui lòng thử lại.',
                );
              return registerDocument(
                {
                  institutionName: institution.name,
                  generatedAt: new Date().toISOString(),
                  filters: reportFilters(query),
                },
                entries.map((entry) => diplomaProjection(entry, true)),
              );
            },
            { isolationLevel: 'RepeatableRead', timeout: 30000 },
          );
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(document.generatedAt));
    return {
      filename:
        (query.kind === 'register' ? 'SoPhatHanh_' : 'BaoCaoVanBang_') +
        date +
        '.' +
        query.format,
      contentType:
        query.format === 'xlsx'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'application/pdf',
      data:
        query.format === 'xlsx'
          ? await exportReportXlsx(document)
          : await exportReportPdf(document, query.kind === 'register'),
    };
  }
}
