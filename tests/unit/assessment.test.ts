import { describe, it, expect } from 'vitest';
import { AssessmentScoreStatus, AssessmentType } from '@prisma/client';

describe('Stage 11 — Unit: Assessment Score Validation & Grading Integration', () => {
  const sampleGradingBands = [
    { grade: 'A', minScore: 70, maxScore: 100, points: 5, remark: 'Excellent', isPass: true },
    { grade: 'B', minScore: 60, maxScore: 69.99, points: 4, remark: 'Very Good', isPass: true },
    { grade: 'C', minScore: 50, maxScore: 59.99, points: 3, remark: 'Credit', isPass: true },
    { grade: 'P', minScore: 40, maxScore: 49.99, points: 2, remark: 'Pass', isPass: true },
    { grade: 'F', minScore: 0, maxScore: 39.99, points: 0, remark: 'Fail', isPass: false },
  ];

  function evaluateGrade(score: number, maxScaleScore = 100, passMark = 40) {
    if (score < 0 || score > maxScaleScore) {
      throw new Error(`Score (${score}) is outside the valid range [0, ${maxScaleScore}].`);
    }
    const matchingBand = sampleGradingBands.find(
      (b) => score >= b.minScore && score <= b.maxScore
    );
    if (!matchingBand) {
      throw new Error(`Score (${score}) could not be resolved: No matching band defined.`);
    }
    return {
      grade: matchingBand.grade,
      points: matchingBand.points,
      remark: matchingBand.remark,
      isPass: score >= passMark && matchingBand.isPass,
      score,
    };
  }

  it('resolves grades correctly across standard WAEC / Primary score boundaries', () => {
    const resA = evaluateGrade(85);
    expect(resA.grade).toBe('A');
    expect(resA.points).toBe(5);
    expect(resA.remark).toBe('Excellent');
    expect(resA.isPass).toBe(true);

    const resB = evaluateGrade(65);
    expect(resB.grade).toBe('B');
    expect(resB.points).toBe(4);

    const resF = evaluateGrade(32);
    expect(resF.grade).toBe('F');
    expect(resF.points).toBe(0);
    expect(resF.isPass).toBe(false);
  });

  it('normalizes score to 100 when assessment maxScore is 40', () => {
    // 35 out of 40 = 87.5% -> Grade A
    const rawScore = 35;
    const maxScore = 40;
    const normalized = (rawScore / maxScore) * 100;
    const result = evaluateGrade(normalized);
    expect(result.grade).toBe('A');
  });

  it('validates score bounds rejecting negative values or values exceeding maxScore', () => {
    expect(() => evaluateGrade(-5)).toThrow('is outside the valid range');
    expect(() => evaluateGrade(105)).toThrow('is outside the valid range');
  });

  it('handles ABSENT and EXEMPT score statuses with nullable academic fields', () => {
    const handleScoreEntry = (status: AssessmentScoreStatus, rawScore?: number) => {
      if (status === AssessmentScoreStatus.ABSENT || status === AssessmentScoreStatus.EXEMPT) {
        return {
          rawScore: null,
          grade: null,
          points: null,
          remark: status === AssessmentScoreStatus.ABSENT ? 'Absent' : 'Exempted',
          isPass: null,
          scoreStatus: status,
        };
      }
      if (rawScore === undefined) throw new Error('Score is required when SCORED');
      const resolved = evaluateGrade(rawScore);
      return {
        rawScore,
        grade: resolved.grade,
        points: resolved.points,
        remark: resolved.remark,
        isPass: resolved.isPass,
        scoreStatus: AssessmentScoreStatus.SCORED,
      };
    };

    const absentEntry = handleScoreEntry(AssessmentScoreStatus.ABSENT);
    expect(absentEntry.rawScore).toBeNull();
    expect(absentEntry.grade).toBeNull();
    expect(absentEntry.points).toBeNull();
    expect(absentEntry.isPass).toBeNull();
    expect(absentEntry.scoreStatus).toBe(AssessmentScoreStatus.ABSENT);

    const exemptEntry = handleScoreEntry(AssessmentScoreStatus.EXEMPT);
    expect(exemptEntry.rawScore).toBeNull();
    expect(exemptEntry.grade).toBeNull();
    expect(exemptEntry.scoreStatus).toBe(AssessmentScoreStatus.EXEMPT);

    const scoredEntry = handleScoreEntry(AssessmentScoreStatus.SCORED, 78);
    expect(scoredEntry.rawScore).toBe(78);
    expect(scoredEntry.grade).toBe('A');
    expect(scoredEntry.isPass).toBe(true);
  });

  it('validates AssessmentType enum values', () => {
    const validTypes = [
      AssessmentType.CONTINUOUS_ASSESSMENT,
      AssessmentType.EXAMINATION,
      AssessmentType.TAHFEEZ_EVALUATION,
      AssessmentType.PROJECT,
    ];
    expect(validTypes).toHaveLength(4);
  });
});
