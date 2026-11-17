import {
  aggregateRisk,
  makeCandidate,
  severityForScore,
} from './anomaly-engine';

describe('anomaly engine', () => {
  it('maps scores to explainable severity levels', () => {
    expect(severityForScore(0)).toBe('LOW');
    expect(severityForScore(40)).toBe('MEDIUM');
    expect(severityForScore(70)).toBe('HIGH');
    expect(severityForScore(90)).toBe('CRITICAL');
    expect(makeCandidate({
      diplomaId: 'diploma-1',
      type: 'TEST',
      riskScore: 140,
      source: 'AI_RULES',
      evidence: {},
    }).riskScore).toBe(100);
  });

  it('aggregates signals without hiding their evidence', () => {
    const aggregate = aggregateRisk('diploma-1', [
      makeCandidate({
        diplomaId: 'diploma-1',
        type: 'ANCHOR_PENDING_TOO_LONG',
        riskScore: 60,
        source: 'AI_RULES',
        evidence: { pendingHours: 48 },
      }),
      makeCandidate({
        diplomaId: 'diploma-1',
        type: 'VERSION_CHURN',
        riskScore: 25,
        source: 'AI_RULES',
        evidence: { currentVersion: 4 },
      }),
    ]);
    expect(aggregate).toMatchObject({
      type: 'ANOMALY_RISK',
      riskScore: 85,
      severity: 'HIGH',
    });
    expect(aggregate?.evidence).toMatchObject({ signalCount: 2 });
  });
});
