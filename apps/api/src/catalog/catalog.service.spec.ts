import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CatalogService } from './catalog.service';
import type { AuthActor } from '../auth/auth-actor';
import type { DatabaseService } from '../database/database.service';

const actor = {
  id: 'actor-1',
  email: 'staff@example.test',
  role: 'university',
  institutionId: 'institution-1',
  isHeadquarters: true,
  canApproveDiplomas: true,
} as AuthActor;
const body = {
  code: ' it ',
  name: ' Công nghệ thông tin ',
  nameEn: ' Information Technology ',
  note: 'Approved catalog',
};

function setup() {
  const transaction = {
    program: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'program-1' }),
      update: jest.fn().mockResolvedValue({ id: 'program-1' }),
    },
    programAlias: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
    diplomaTypeCatalog: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'diploma-type-1' }),
      update: jest.fn().mockResolvedValue({ id: 'diploma-type-1' }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const database = {
    program: { findMany: jest.fn().mockResolvedValue([]) },
    diplomaTypeCatalog: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest
      .fn()
      .mockImplementation((callback: (value: unknown) => unknown) =>
        callback(transaction),
      ),
  };
  return {
    transaction,
    database,
    service: new CatalogService(database as unknown as DatabaseService),
  };
}

describe('program catalog', () => {
  it.each([
    { role: 'admin' },
    { role: 'student' },
    { isHeadquarters: false },
    { canApproveDiplomas: false },
  ])('rejects non-approvers: %j', (flags) => {
    const { service } = setup();
    expect(() => service.list({ ...actor, ...flags } as AuthActor)).toThrow(
      ForbiddenException,
    );
  });

  it('scopes list and aliases to the current institution', async () => {
    const { database, service } = setup();
    await service.list(actor);
    expect(database.program.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { institutionId: actor.institutionId },
      }),
    );
  });

  it('creates normalized bilingual data, canonical mapping and audit in one transaction', async () => {
    const { transaction, service } = setup();
    await service.save(body, actor);
    expect(transaction.program.create.mock.calls).toMatchObject([
      [
        {
          data: {
            institutionId: actor.institutionId,
            code: 'IT',
            name: 'Công nghệ thông tin',
            nameEn: 'Information Technology',
          },
        },
      ],
    ]);
    expect(transaction.programAlias.create.mock.calls).toMatchObject([
      [
        {
          data: {
            programId: 'program-1',
            normalizedName: 'công nghệ thông tin',
            approvedById: actor.id,
          },
        },
      ],
    ]);
    expect(transaction.auditLog.create.mock.calls).toMatchObject([
      [
        {
          data: {
            institutionId: actor.institutionId,
            action: 'CREATE_PROGRAM',
            target: 'program-1',
          },
        },
      ],
    ]);
  });

  it('requires bilingual names and an audit reason', async () => {
    const { service, database } = setup();
    await expect(
      service.save({ ...body, nameEn: ' ' }, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.save({ ...body, note: ' ' }, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it('cannot update a program from another institution', async () => {
    const { service, transaction } = setup();
    await expect(
      service.save(body, actor, 'other-program'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(transaction.program.findFirst).toHaveBeenCalledWith({
      where: { id: 'other-program', institutionId: actor.institutionId },
    });
    expect(transaction.program.update).not.toHaveBeenCalled();
  });

  it('does not overwrite a name already mapped to another program', async () => {
    const { service, transaction } = setup();
    transaction.programAlias.findUnique.mockResolvedValue({
      programId: 'other-program',
    });
    await expect(service.save(body, actor)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(transaction.programAlias.create).not.toHaveBeenCalled();
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
  });

  it('keeps existing mappings when updating a program', async () => {
    const { service, transaction } = setup();
    transaction.program.findFirst.mockResolvedValue({
      id: 'program-1',
      name: 'Old name',
    });
    transaction.programAlias.findUnique.mockResolvedValue({
      programId: 'program-1',
    });
    await service.save(body, actor, 'program-1');
    expect(transaction.programAlias.create).not.toHaveBeenCalled();
    expect(transaction.auditLog.create.mock.calls).toMatchObject([
      [
        {
          data: { action: 'UPDATE_PROGRAM' },
        },
      ],
    ]);
  });

  it('propagates audit failure so the transaction cannot commit', async () => {
    const { service, transaction } = setup();
    transaction.auditLog.create.mockRejectedValue(
      new Error('audit unavailable'),
    );
    await expect(service.save(body, actor)).rejects.toThrow(
      'audit unavailable',
    );
  });
});

describe('diploma type catalog', () => {
  it('lists types within the current institution', async () => {
    const { database, service } = setup();
    await service.listDiplomaTypes(actor);
    expect(database.diplomaTypeCatalog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { institutionId: actor.institutionId },
      }),
    );
  });

  it('lists only active types for workflow forms', async () => {
    const { database, service } = setup();
    await service.listActiveDiplomaTypes({
      ...actor,
      isHeadquarters: false,
      canApproveDiplomas: false,
    });
    expect(database.diplomaTypeCatalog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { institutionId: actor.institutionId, active: true },
      }),
    );
  });

  it('creates a type and records the reason plus before/after audit data', async () => {
    const { transaction, service } = setup();
    await service.saveDiplomaType(
      {
        code: ' master ' as never,
        name: ' Master degree ',
        nameEn: ' Master ',
        active: true,
        note: 'Approved by the academic council',
      },
      actor,
    );
    expect(transaction.diplomaTypeCatalog.create).toHaveBeenCalledWith({
      data: {
        institutionId: actor.institutionId,
        code: 'MASTER',
        name: 'Master degree',
        nameEn: 'Master',
        active: true,
        note: 'Approved by the academic council',
      },
    });
    expect(transaction.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: 'CREATE_DIPLOMA_TYPE',
      target: 'diploma-type-1',
      metadata: expect.objectContaining({
        note: 'Approved by the academic council',
      }),
    });
  });

  it('updates a type in the same institution and preserves active state when omitted', async () => {
    const { transaction, service } = setup();
    transaction.diplomaTypeCatalog.findFirst.mockResolvedValue({
      id: 'diploma-type-1',
      active: false,
      name: 'Old name',
    });
    await service.saveDiplomaType(
      {
        code: 'OTHER' as never,
        name: 'Loại khác cập nhật',
        note: 'Revised catalog wording',
      },
      actor,
      'diploma-type-1',
    );
    expect(transaction.diplomaTypeCatalog.update).toHaveBeenCalledWith({
      where: { id: 'diploma-type-1' },
      data: {
        code: 'OTHER',
        name: 'Loại khác cập nhật',
        nameEn: null,
        active: false,
        note: 'Revised catalog wording',
      },
    });
    expect(transaction.auditLog.create.mock.calls[0][0].data.action).toBe(
      'UPDATE_DIPLOMA_TYPE',
    );
  });
});
