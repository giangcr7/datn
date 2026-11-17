export const ANOMALY_RULE_VERSION = 'rules-v1';

export type AnomalySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type AnomalyCandidate = {
  diplomaId: string;
  type: string;
  riskScore: number;
  severity: AnomalySeverity;
  ruleVersion: string;
  source: 'AI_RULES' | 'INTEGRITY';
  evidence: Record<string, unknown>;
  databaseHash?: string;
  fabricHash?: string | null;
};

export type BurstRecord = {
  id: string;
  diplomaId: string;
  actorId?: string | null;
  createdAt: Date;
};

export function severityForScore(score: number): AnomalySeverity {
  if (score >= 90) return 'CRITICAL';
  if (score >= 70) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  return 'LOW';
}

export function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function makeCandidate(
  candidate: Omit<AnomalyCandidate, 'riskScore' | 'severity' | 'ruleVersion'> & {
    riskScore: number;
    ruleVersion?: string;
  },
): AnomalyCandidate {
  const riskScore = clampScore(candidate.riskScore);
  return {
    ...candidate,
    riskScore,
    severity: severityForScore(riskScore),
    ruleVersion: candidate.ruleVersion || ANOMALY_RULE_VERSION,
  };
}

export function findBurstWindow(
  records: BurstRecord[],
  threshold: number,
  windowMs: number,
) {
  const sorted = [...records].sort(
    (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
  );
  let start = 0;
  for (let end = 0; end < sorted.length; end++) {
    while (
      start < end &&
      sorted[end].createdAt.getTime() - sorted[start].createdAt.getTime() >
        windowMs
    ) {
      start++;
    }
    if (end - start + 1 >= threshold) return sorted.slice(start, end + 1);
  }
  return null;
}

export function aggregateRisk(
  diplomaId: string,
  signals: AnomalyCandidate[],
): AnomalyCandidate | null {
  if (!signals.length) return null;
  const riskScore = clampScore(
    signals.reduce((total, signal) => total + signal.riskScore, 0),
  );
  return makeCandidate({
    diplomaId,
    type: 'ANOMALY_RISK',
    riskScore,
    source: 'AI_RULES',
    evidence: {
      signalCount: signals.length,
      signals: signals.map((signal) => ({
        type: signal.type,
        riskScore: signal.riskScore,
        severity: signal.severity,
        evidence: signal.evidence,
      })),
    },
  });
}
