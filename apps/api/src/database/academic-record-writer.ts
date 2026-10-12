import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  Gender,
  DegreeType,
  Classification,
  Prisma,
} from '../generated/prisma/client';
import { lookupText, parseDateOnly } from './data-utils';

export interface AcademicInput {
  studentCode: string;
  fullName: string;
  programId: string;
  graduationYear: number;
  dateOfBirth?: string | null;
  birthPlace?: string | null;
  gender?: Gender | null;
  ethnicity?: string | null;
  nationality?: string | null;
  classCode?: string | null;
  cohortCode?: string | null;
  gpa?: number | null;
  gpaScale?: number;
  classification?: Classification | null;
  degreeType?: DegreeType | null;
  specialization?: string | null;
  decisionNumber?: string | null;
  decisionDate?: string | null;
  signerName?: string | null;
}

export async function writeAcademicRecord(
  transaction: Prisma.TransactionClient,
  scope: { institutionId: string; campusId: string },
  input: AcademicInput,
  sourceRowId?: string,
  sourceDocumentId?: string,
) {
  const program = await transaction.program.findFirst({
    where: { id: input.programId, institutionId: scope.institutionId },
  });
  if (!program)
    throw new BadRequestException('Ngành đào tạo không thuộc trường');
  const dob = parseDateOnly(input.dateOfBirth);
  let student = await transaction.student.findUnique({
    where: {
      institutionId_studentCode: {
        institutionId: scope.institutionId,
        studentCode: input.studentCode,
      },
    },
  });
  if (!student)
    student = await transaction.student.create({
      data: {
        institutionId: scope.institutionId,
        studentCode: input.studentCode,
        fullName: input.fullName,
        dateOfBirth: dob,
        birthPlace: input.birthPlace,
        gender: input.gender,
        ethnicity: input.ethnicity,
        nationality: input.nationality,
      },
    });
  await transaction.$queryRaw`SELECT id FROM students WHERE id = ${student.id}::uuid FOR UPDATE`;
  if (
    lookupText(student.fullName) !== lookupText(input.fullName) ||
    (student.dateOfBirth &&
      dob &&
      student.dateOfBirth.getTime() !== dob.getTime())
  )
    throw new ConflictException(
      'MSSV trùng nhưng thông tin định danh khác; cần đối soát',
    );
  if (!student.dateOfBirth && dob)
    await transaction.student.update({
      where: { id: student.id },
      data: { dateOfBirth: dob },
    });
  const academicClass = input.classCode
    ? await transaction.academicClass.upsert({
        where: {
          campusId_code: { campusId: scope.campusId, code: input.classCode },
        },
        update: {},
        create: {
          campusId: scope.campusId,
          code: input.classCode,
          cohortCode: input.cohortCode,
        },
      })
    : null;
  let enrollment = await transaction.enrollment.findFirst({
    where: {
      studentId: student.id,
      programId: program.id,
      campusId: scope.campusId,
      classId: academicClass?.id || null,
    },
  });
  if (!enrollment)
    enrollment = await transaction.enrollment.create({
      data: {
        studentId: student.id,
        programId: program.id,
        campusId: scope.campusId,
        classId: academicClass?.id,
        cohortCode: input.cohortCode,
      },
    });
  let decisionId: string | undefined;
  if (input.decisionNumber) {
    const decisionYear =
      parseDateOnly(input.decisionDate)?.getUTCFullYear() ||
      input.graduationYear;
    const decision = await transaction.graduationDecision.upsert({
      where: {
        institutionId_documentNumber_decisionYear: {
          institutionId: scope.institutionId,
          documentNumber: input.decisionNumber,
          decisionYear,
        },
      },
      update: {},
      create: {
        institutionId: scope.institutionId,
        documentNumber: input.decisionNumber,
        decisionYear,
        signedOn: parseDateOnly(input.decisionDate),
        signerName: input.signerName,
        sourceDocumentId,
      },
    });
    const signedOn = parseDateOnly(input.decisionDate);
    if (
      decision.signedOn &&
      signedOn &&
      decision.signedOn.getTime() !== signedOn.getTime()
    )
      throw new ConflictException('Cùng quyết định nhưng ngày ký khác nhau');
    decisionId = decision.id;
  }
  const existing = await transaction.graduationRecord.findFirst({
    where: {
      studentId: student.id,
      programId: program.id,
      graduationYear: input.graduationYear,
    },
  });
  if (existing) {
    if (
      existing.enrollmentId !== enrollment.id ||
      (decisionId && existing.decisionId !== decisionId) ||
      existing.gpaScale !== (input.gpaScale || 4)
    )
      throw new ConflictException(
        'Hồ sơ cùng sinh viên/ngành/năm nhưng khác quá trình học, quyết định hoặc thang điểm; cần đối soát',
      );
    if (sourceRowId && existing.sourceRowId !== sourceRowId)
      throw new ConflictException('Hồ sơ tốt nghiệp đã tồn tại từ nguồn khác');
    if (
      existing.classification !== (input.classification || null) ||
      (existing.gpa === null ? null : Number(existing.gpa)) !==
        (input.gpa ?? null)
    )
      throw new ConflictException(
        'Kết quả tốt nghiệp mâu thuẫn với hồ sơ đã lưu',
      );
    return existing;
  }
  return transaction.graduationRecord.create({
    data: {
      institutionId: scope.institutionId,
      studentId: student.id,
      programId: program.id,
      enrollmentId: enrollment.id,
      decisionId,
      sourceRowId,
      graduationYear: input.graduationYear,
      gpa: input.gpa ?? null,
      gpaScale: input.gpaScale || 4,
      classification: input.classification,
      degreeType: input.degreeType,
      specialization: input.specialization,
    },
  });
}
