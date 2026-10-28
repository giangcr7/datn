import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { writeAcademicRecord } from './academic-record-writer';

describe('academic record student creation policy', () => {
  it('does not create a missing student in the certificate request flow', async () => {
    const create = jest.fn();
    const transaction = {
      program: { findFirst: jest.fn().mockResolvedValue({ id: 'program1' }) },
      student: { findUnique: jest.fn().mockResolvedValue(null), create },
    } as unknown as Prisma.TransactionClient;
    await expect(
      writeAcademicRecord(
        transaction,
        { institutionId: 'institution1', campusId: 'campus1' },
        {
          studentCode: '0012345678',
          fullName: 'Nguyen An',
          programId: 'program1',
          graduationYear: 2025,
        },
        undefined,
        undefined,
        { createStudent: false },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });
});
