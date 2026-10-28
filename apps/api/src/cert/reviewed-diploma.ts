import {
  diplomaProjection,
  DiplomaWithRelations,
} from '../database/diploma-projection';

export function reviewedDiplomaErrors(diploma: DiplomaWithRelations): string[] {
  const errors: string[] = [];
  const graduation = diploma.graduation;
  const birthDate = graduation.student.dateOfBirth;
  const now = new Date();
  if (!diploma.issuedOn)
    errors.push('Cần xác nhận ngày cấp trước khi gửi yêu cầu');
  if (graduation.sourceRow?.status !== 'IMPORTED')
    errors.push('Hồ sơ chưa hoàn tất rà soát và lưu từ sổ gốc');
  if (!diploma.certificateNo?.trim() || !diploma.registryNo?.trim())
    errors.push('Thiếu số hiệu hoặc số vào sổ');
  if (!graduation.classification) errors.push('Thiếu xếp loại đã xác nhận');
  if (
    !birthDate ||
    birthDate > now ||
    birthDate.getUTCFullYear() >= graduation.graduationYear
  )
    errors.push(
      'Ngày sinh chưa được xác nhận hoặc không phù hợp năm tốt nghiệp',
    );
  if (
    diploma.issuedOn &&
    (diploma.issuedOn > now ||
      (birthDate && diploma.issuedOn < birthDate) ||
      diploma.issuedOn.getUTCFullYear() < graduation.graduationYear)
  )
    errors.push('Ngày cấp không phù hợp hồ sơ tốt nghiệp');
  if (diploma.printTemplate)
    errors.push(
      ...diplomaProjection(diploma).printWarnings.filter(
        (warning) => warning !== 'Nguồn chưa ghi ngày cấp trên bằng',
      ),
    );
  return errors;
}
