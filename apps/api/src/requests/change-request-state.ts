import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { AuthActor } from '../auth/auth-actor';
import type { RequestStatus } from './change-request.dto';

export function requestScope(actor: AuthActor) {
  if (!actor?.id || !actor.institutionId)
    throw new ForbiddenException('Không có quyền truy cập yêu cầu');
  if (actor.role === 'student' && actor.studentId) return 'student';
  if (
    actor.role === 'university' &&
    actor.campusId &&
    actor.isHeadquarters &&
    actor.canApproveDiplomas
  )
    return 'officer';
  throw new ForbiddenException(
    'Chỉ sinh viên và cán bộ được phân quyền xử lý yêu cầu',
  );
}

export function assertRequestTransition(
  current: string,
  next: RequestStatus,
  student: boolean,
) {
  const transitions: Record<string, readonly string[]> = student
    ? { PENDING: ['CANCELLED'], NEEDS_INFORMATION: ['PENDING', 'CANCELLED'] }
    : {
        PENDING: ['IN_REVIEW', 'REJECTED'],
        IN_REVIEW: ['NEEDS_INFORMATION', 'RESOLVED', 'REJECTED'],
        NEEDS_INFORMATION: ['REJECTED'],
      };
  if (!transitions[current]?.includes(next))
    throw new ConflictException(
      'Yêu cầu không còn ở trạng thái cho phép thao tác này. Vui lòng tải lại.',
    );
}
