import {
  diplomaProjection,
  type DiplomaWithRelations,
} from '../database/diploma-projection';
import { reviewedDiplomaErrors } from './reviewed-diploma';
import { diplomaPayload, payloadHash } from '../database/diploma-hash';

export function issuanceReviewToken(record: DiplomaWithRelations) {
  return payloadHash({
    payload: diplomaPayload(record),
    batchId: record.issuanceBatchId,
    originType: record.originType,
    programActive: record.graduation.program.active,
    sourceStatus: record.graduation.sourceRow?.status ?? null,
  });
}

export const BATCH_STATES = [
  'DRAFT',
  'PENDING',
  'REJECTED',
  'ANCHOR_PENDING',
  'ANCHOR_FAILED',
  'ON_CHAIN',
  'REVOKED',
  'REPLACED',
] as const;
export type BatchState = (typeof BATCH_STATES)[number];

export function emptyBatchSummary() {
  return {
    total: 0,
    ...Object.fromEntries(BATCH_STATES.map((state) => [state, 0])),
  } as Record<BatchState | 'total', number>;
}

export function issuanceBatchRow(
  record: DiplomaWithRelations & { events?: { eventType: string }[] },
) {
  const view = diplomaProjection(record);
  const state: BatchState =
    view.status === 'ANCHOR_PENDING' && view.anchorStatus === 'FAILED'
      ? 'ANCHOR_FAILED'
      : (view.status as BatchState);
  const errors: string[] = [];
  if (['DRAFT', 'PENDING'].includes(state)) {
    if (record.graduation.sourceRow)
      errors.push(...reviewedDiplomaErrors(record));
    errors.push(...view.printWarnings);
    if (!record.printTemplate) errors.push('Chưa xác nhận mẫu in văn bằng');
    if (!record.graduation.program.active)
      errors.push('Ngành đào tạo đã ngừng sử dụng');
    if (!record.graduation.classification)
      errors.push('Chưa xác nhận xếp loại');
    if (!record.graduation.decision?.signedOn)
      errors.push('Quyết định chưa ghi ngày ký');
    const birthDate = record.graduation.student.dateOfBirth;
    const now = new Date();
    if (
      !birthDate ||
      birthDate > now ||
      birthDate.getUTCFullYear() >= record.graduation.graduationYear
    )
      errors.push('Ngày sinh chưa hợp lệ với năm tốt nghiệp');
    if (
      !record.issuedOn ||
      record.issuedOn > now ||
      (birthDate && record.issuedOn < birthDate) ||
      record.issuedOn.getUTCFullYear() < record.graduation.graduationYear
    )
      errors.push('Ngày cấp chưa hợp lệ với hồ sơ tốt nghiệp');
    if (record.graduation.graduationYear > now.getUTCFullYear())
      errors.push('Năm tốt nghiệp ở tương lai');
    if (
      record.events?.some((event) => event.eventType === 'REOPENED') &&
      state === 'DRAFT'
    )
      errors.push(
        'Hồ sơ đang bổ sung sau từ chối; cần trình duyệt lại tại mục Bị từ chối / Đang bổ sung',
      );
    if (record.signedDocuments.length || record.versions.length)
      errors.push(
        'Hồ sơ đã có chữ ký hoặc phiên bản bất biến; cần kiểm tra trạng thái',
      );
  }
  return {
    ...view,
    reviewToken: issuanceReviewToken(record),
    batchState: state,
    checkErrors: [...new Set(errors)],
    ready: ['DRAFT', 'PENDING'].includes(state) && errors.length === 0,
    removable:
      state === 'DRAFT' &&
      !record.signedDocuments.length &&
      !record.versions.length,
  };
}
