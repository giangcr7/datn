import { IsIn } from 'class-validator';
import { RegisterQueryDto } from '../cert/register-query.dto';

export class ReportExportQueryDto extends RegisterQueryDto {
  @IsIn(['statistics', 'register'])
  kind: 'statistics' | 'register' = 'statistics';

  @IsIn(['xlsx', 'pdf'])
  format: 'xlsx' | 'pdf' = 'xlsx';
}
