import {
  diplomaProjection,
  publicDiplomaProjection,
  type DiplomaWithRelations,
} from './diploma-projection';

const record = () =>
  ({
    id: '00000000-0000-0000-0000-000000000001',
    status: 'ACTIVE',
    workflowStatus: 'APPROVED',
    certificateNo: 'CERT1',
    registryNo: 'REG1',
    issuedOn: new Date('2025-01-01'),
    campus: { code: 'ORG2' },
    graduation: {
      student: {
        studentCode: '0012345678',
        fullName: 'Current name',
        dateOfBirth: new Date('2001-01-01'),
      },
      program: { name: 'Current program' },
      programId: 'program1',
      graduationYear: 2025,
      gpa: null,
      gpaScale: 4,
      classification: 'GOOD',
      enrollment: null,
      decision: null,
    },
    versions: [
      {
        version: 1,
        schemaVersion: 'diploma-v1',
        payloadHash: 'a'.repeat(64),
        payload: {
          fullName: 'Approved name',
          gpa: '2.50',
          major: 'Approved program',
        },
        anchors: [
          { eventType: 'ISSUE', status: 'COMMITTED', transactionId: 'tx1' },
        ],
      },
    ],
  }) as unknown as DiplomaWithRelations;

describe('diploma projections', () => {
  it('uses approved immutable snapshot values instead of changed master data', () => {
    const view = diplomaProjection(record(), true);
    expect(view.fullName).toBe('Approved name');
    expect(view.major).toBe('Approved program');
    expect(view.gpa).toBe(2.5);
    expect(view.status).toBe('ON_CHAIN');
  });
  it('does not expose DOB, GPA, proof, actors or hash in directory projection', () => {
    const view = publicDiplomaProjection(record());
    expect(view.isVerifiable).toBe(true);
    for (const key of [
      'dob',
      'gpa',
      'proof',
      'requestedBy',
      'approvedBy',
      'certHash',
      'soVaoSo',
    ])
      expect(view).not.toHaveProperty(key);
  });
  it('never marks a pending anchor as on-chain', () => {
    const diploma = record();
    diploma.versions[0].anchors = [];
    expect(diplomaProjection(diploma).status).toBe('ANCHOR_PENDING');
    expect(publicDiplomaProjection(diploma).isVerifiable).toBe(false);
  });
});
