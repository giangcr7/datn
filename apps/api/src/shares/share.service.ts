import {
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import {
  diplomaInclude,
  diplomaProjection,
} from '../database/diploma-projection';
import { AuditAction, AuditService } from '../audit/audit.service';
import { NotifyService } from '../notify/notify.service';
import { publicVerification } from '../verify/public-verification';
import { VerifyService } from '../verify/verify.service';
import type { AuthActor } from '../auth/auth-actor';

@Injectable()
export class ShareService {
  constructor(
    private readonly database: DatabaseService,
    private readonly notify: NotifyService,
    private readonly verifyService: VerifyService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private tokenHash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private assertStudent(actor: AuthActor) {
    if (actor.role !== 'student' || !actor.studentId)
      throw new ForbiddenException('Chỉ sinh viên mới được chia sẻ văn bằng');
  }

  async create(
    diplomaId: string,
    recipientEmail: string,
    expiresInHours: number,
    actor: AuthActor,
    ip?: string,
  ) {
    this.assertStudent(actor);
    const studentId = actor.studentId as string;
    const diploma = await this.database.diploma.findFirst({
      where: {
        id: diplomaId,
        institutionId: actor.institutionId,
        status: 'ACTIVE',
        workflowStatus: 'APPROVED',
        graduation: { studentId },
      },
      include: diplomaInclude,
    });
    if (!diploma || diplomaProjection(diploma).status !== 'ON_CHAIN')
      throw new NotFoundException(
        'Không tìm thấy văn bằng đã phát hành của bạn',
      );

    const normalizedEmail = recipientEmail.trim().toLowerCase();
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
    await this.database.diplomaShare.create({
      data: {
        diplomaId,
        ownerId: actor.id,
        recipientEmail: normalizedEmail,
        tokenHash: this.tokenHash(token),
        expiresAt,
      },
    });

    const baseUrl = (
      this.config.get<string>('WEB_URL') || 'http://localhost:3000'
    ).replace(/\/$/, '');
    const shareUrl = `${baseUrl}/verify?share=${token}`;
    let emailSent = true;
    try {
      await this.notify.sendDiplomaShare(
        normalizedEmail,
        diploma.graduation.student.fullName,
        shareUrl,
        expiresAt,
      );
    } catch {
      emailSent = false;
    }

    await this.audit.log({
      userId: actor.id,
      institutionId: actor.institutionId,
      userEmail: actor.email,
      action: AuditAction.SHARE_DIPLOMA,
      target: diplomaId,
      ip,
      metadata: { recipientEmail: normalizedEmail, expiresAt, emailSent },
    });

    return {
      success: true,
      emailSent,
      shareUrl,
      expiresAt,
      message: emailSent
        ? 'Đã gửi liên kết xác thực tới email người nhận'
        : 'Không gửi được email; hãy sao chép liên kết để gửi thủ công',
    };
  }

  async revoke(id: string, actor: AuthActor) {
    this.assertStudent(actor);
    const changed = await this.database.diplomaShare.updateMany({
      where: { id, ownerId: actor.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!changed.count)
      throw new NotFoundException('Không tìm thấy liên kết chia sẻ');
    return { success: true, message: 'Đã thu hồi liên kết chia sẻ' };
  }

  async verify(token: string) {
    const share = await this.database.diplomaShare.findUnique({
      where: { tokenHash: this.tokenHash(token.trim()) },
    });
    if (!share || share.revokedAt)
      throw new GoneException('Liên kết chia sẻ không còn hiệu lực');
    if (share.expiresAt <= new Date())
      throw new GoneException('Liên kết chia sẻ đã hết hạn');

    const now = new Date();
    await this.database.diplomaShare.update({
      where: { id: share.id },
      data: {
        firstAccessedAt: share.firstAccessedAt || now,
        lastAccessedAt: now,
      },
    });
    return publicVerification(
      await this.verifyService.verify({ uuid: share.diplomaId }),
    );
  }
}
