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
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const database = {
    program: { findMany: jest.fn().mockResolvedValue([]) },
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
