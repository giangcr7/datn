import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthActor } from '../auth/auth-actor';
import { DatabaseService } from '../database/database.service';
import { jsonData, lookupText, normalizeText } from '../database/data-utils';
import { DegreeType, Prisma } from '../generated/prisma/client';
import type { SaveDiplomaTypeDto, SaveProgramDto } from './catalog.dto';

@Injectable()
export class CatalogService {
  constructor(private readonly database: DatabaseService) {}

  private staff(actor: AuthActor) {
    if (
      !actor.institutionId ||
      actor.role !== 'university' ||
      !actor.isHeadquarters ||
      !actor.canApproveDiplomas
    )
      throw new ForbiddenException(
        'Chỉ cán bộ cơ sở chính được quản lý danh mục',
      );
  }

  private activeReader(actor: AuthActor) {
    if (!actor.institutionId || !['admin', 'university'].includes(actor.role))
      throw new ForbiddenException(
        'Không có quyền tra cứu loại văn bằng của nhà trường',
      );
  }

  list(actor: AuthActor) {
    this.staff(actor);
    return this.database.program.findMany({
      where: { institutionId: actor.institutionId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        nameEn: true,
        nationalCode: true,
        active: true,
        aliases: {
          select: { id: true, originalName: true, createdAt: true },
          orderBy: { originalName: 'asc' },
        },
      },
    });
  }

  listDiplomaTypes(actor: AuthActor) {
    this.staff(actor);
    return this.database.diplomaTypeCatalog.findMany({
      where: { institutionId: actor.institutionId },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        nameEn: true,
        active: true,
        note: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  listActiveDiplomaTypes(actor: AuthActor) {
    this.activeReader(actor);
    return this.database.diplomaTypeCatalog.findMany({
      where: { institutionId: actor.institutionId, active: true },
      orderBy: { name: 'asc' },
      select: { id: true, code: true, name: true, nameEn: true },
    });
  }

  async save(body: SaveProgramDto, actor: AuthActor, programId?: string) {
    this.staff(actor);
    const data = {
      code: normalizeText(body.code).toUpperCase(),
      name: normalizeText(body.name),
      nameEn: normalizeText(body.nameEn),
      nationalCode: normalizeText(body.nationalCode) || null,
    };
    const note = normalizeText(body.note);
    if (!data.code || !data.name || !data.nameEn || !note)
      throw new BadRequestException(
        'Cần mã ngành, tên Việt/Anh và lý do cập nhật',
      );
    try {
      return await this.database.$transaction(async (transaction) => {
        const before = programId
          ? await transaction.program.findFirst({
              where: { id: programId, institutionId: actor.institutionId },
            })
          : null;
        if (programId && !before)
          throw new NotFoundException('Không tìm thấy ngành thuộc nhà trường');
        const program = before
          ? await transaction.program.update({ where: { id: before.id }, data })
          : await transaction.program.create({
              data: { ...data, institutionId: actor.institutionId },
            });
        const normalizedName = lookupText(data.name);
        const alias = await transaction.programAlias.findUnique({
          where: {
            institutionId_normalizedName: {
              institutionId: actor.institutionId,
              normalizedName,
            },
          },
        });
        if (alias && alias.programId !== program.id)
          throw new ConflictException(
            'Tên ngành đã được ánh xạ sang ngành khác',
          );
        if (!alias)
          await transaction.programAlias.create({
            data: {
              institutionId: actor.institutionId,
              programId: program.id,
              originalName: data.name,
              normalizedName,
              approvedById: actor.id,
            },
          });
        await transaction.auditLog.create({
          data: {
            institutionId: actor.institutionId,
            actorId: actor.id,
            actorEmail: actor.email,
            action: before ? 'UPDATE_PROGRAM' : 'CREATE_PROGRAM',
            target: program.id,
            result: 'SUCCESS',
            metadata: jsonData({ note, before, after: data }),
          },
        });
        return program;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'Mã ngành, tên ngành hoặc ánh xạ đã tồn tại',
        );
      throw error;
    }
  }

  async saveDiplomaType(
    body: SaveDiplomaTypeDto,
    actor: AuthActor,
    diplomaTypeId?: string,
  ) {
    this.staff(actor);
    const code = normalizeText(body.code).toUpperCase();
    const name = normalizeText(body.name);
    const nameEn = normalizeText(body.nameEn) || null;
    const note = normalizeText(body.note);
    if (
      !Object.values(DegreeType).includes(code as DegreeType) ||
      !name ||
      !note
    )
      throw new BadRequestException(
        'Cần mã loại, tên loại văn bằng và lý do cập nhật',
      );

    try {
      return await this.database.$transaction(async (transaction) => {
        const before = diplomaTypeId
          ? await transaction.diplomaTypeCatalog.findFirst({
              where: {
                id: diplomaTypeId,
                institutionId: actor.institutionId,
              },
            })
          : null;
        if (diplomaTypeId && !before)
          throw new NotFoundException(
            'Không tìm thấy loại văn bằng thuộc nhà trường',
          );
        const active = body.active ?? before?.active ?? true;
        const data = {
          code: code as DegreeType,
          name,
          nameEn,
          active,
          note,
        };
        const diplomaType = before
          ? await transaction.diplomaTypeCatalog.update({
              where: { id: before.id },
              data,
            })
          : await transaction.diplomaTypeCatalog.create({
              data: { ...data, institutionId: actor.institutionId },
            });
        await transaction.auditLog.create({
          data: {
            institutionId: actor.institutionId,
            actorId: actor.id,
            actorEmail: actor.email,
            action: before ? 'UPDATE_DIPLOMA_TYPE' : 'CREATE_DIPLOMA_TYPE',
            target: diplomaType.id,
            result: 'SUCCESS',
            metadata: jsonData({
              note,
              before,
              after: diplomaType,
            }),
          },
        });
        return diplomaType;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'Mã loại văn bằng đã tồn tại trong danh mục nhà trường',
        );
      throw error;
    }
  }
}
