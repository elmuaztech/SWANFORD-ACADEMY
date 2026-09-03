import { describe, it, expect } from 'vitest';
import {
  validateGradingBands,
  CreateGradingScaleSchema,
} from '@/lib/academic/grading_service';
import { AuthorizationError } from '@/lib/auth/authorization';

describe('Unit Tests: Grading Foundation & Band Range Validation', () => {
  const validBands = [
    { grade: 'A', minScore: 70, maxScore: 100, remark: 'Distinction', isPass: true, displayOrder: 1 },
    { grade: 'B', minScore: 60, maxScore: 69.99, remark: 'Very Good', isPass: true, displayOrder: 2 },
    { grade: 'C', minScore: 50, maxScore: 59.99, remark: 'Credit', isPass: true, displayOrder: 3 },
    { grade: 'D', minScore: 40, maxScore: 49.99, remark: 'Pass', isPass: true, displayOrder: 4 },
    { grade: 'F', minScore: 0, maxScore: 39.99, remark: 'Fail', isPass: false, displayOrder: 5 },
  ];

  it('accepts valid, non-overlapping grade bands', () => {
    expect(() => validateGradingBands(validBands, 100)).not.toThrow();
  });

  it('rejects grade band where minScore >= maxScore', () => {
    const invalid = [
      { grade: 'A', minScore: 80, maxScore: 70, remark: 'Invalid', isPass: true, displayOrder: 1 },
    ];

    expect(() => validateGradingBands(invalid, 100)).toThrow(AuthorizationError);
    expect(() => validateGradingBands(invalid, 100)).toThrow(/must be less than maximum score/);
  });

  it('rejects grade band that exceeds scale maxScore', () => {
    const invalid = [
      { grade: 'A', minScore: 90, maxScore: 105, remark: 'Out of bounds', isPass: true, displayOrder: 1 },
    ];

    expect(() => validateGradingBands(invalid, 100)).toThrow(AuthorizationError);
    expect(() => validateGradingBands(invalid, 100)).toThrow(/cannot exceed scale max score/);
  });

  it('rejects duplicate grade codes in the same scale', () => {
    const duplicate = [
      { grade: 'A', minScore: 80, maxScore: 100, remark: 'Top', isPass: true, displayOrder: 1 },
      { grade: 'a', minScore: 70, maxScore: 79.99, remark: 'Lower top', isPass: true, displayOrder: 2 },
    ];

    expect(() => validateGradingBands(duplicate, 100)).toThrow(AuthorizationError);
    expect(() => validateGradingBands(duplicate, 100)).toThrow(/Duplicate grade code/);
  });

  it('detects and rejects overlapping score intervals', () => {
    const overlapping = [
      { grade: 'A', minScore: 70, maxScore: 100, remark: 'Distinction', isPass: true, displayOrder: 1 },
      { grade: 'B', minScore: 65, maxScore: 75, remark: 'Overlap', isPass: true, displayOrder: 2 }, // Overlaps 70-75
      { grade: 'F', minScore: 0, maxScore: 64.99, remark: 'Fail', isPass: false, displayOrder: 3 },
    ];

    expect(() => validateGradingBands(overlapping, 100)).toThrow(AuthorizationError);
    expect(() => validateGradingBands(overlapping, 100)).toThrow(/Overlapping grade ranges detected/);
  });

  it('validates scale input schema rejecting pass mark higher than max score', () => {
    const invalidScale = {
      code: 'INVALID_SCALE',
      name: 'Invalid Scale',
      passMark: 120, // Cannot exceed 100
      maxScore: 100,
      bands: validBands,
    };

    expect(() => CreateGradingScaleSchema.parse(invalidScale)).toThrow();
  });
});
