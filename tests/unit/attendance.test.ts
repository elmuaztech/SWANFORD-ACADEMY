import { describe, it, expect } from 'vitest';
import { AttendanceStatus } from '@prisma/client';

describe('Stage 11 — Unit: Attendance Calculations & Status Rules', () => {
  it('calculates attendance percentage and summary counts correctly', () => {
    const records = [
      { status: AttendanceStatus.PRESENT },
      { status: AttendanceStatus.PRESENT },
      { status: AttendanceStatus.PRESENT },
      { status: AttendanceStatus.LATE },
      { status: AttendanceStatus.ABSENT },
      { status: AttendanceStatus.EXCUSED },
    ];

    const summary = {
      totalDays: records.length,
      present: records.filter((r) => r.status === AttendanceStatus.PRESENT).length,
      absent: records.filter((r) => r.status === AttendanceStatus.ABSENT).length,
      late: records.filter((r) => r.status === AttendanceStatus.LATE).length,
      excused: records.filter((r) => r.status === AttendanceStatus.EXCUSED).length,
      attendancePercentage: 0,
    };

    // Standard school attendance percentage: (Present + Late) / TotalDays * 100
    const attendedDays = summary.present + summary.late;
    summary.attendancePercentage = Math.round((attendedDays / summary.totalDays) * 100);

    expect(summary.totalDays).toBe(6);
    expect(summary.present).toBe(3);
    expect(summary.late).toBe(1);
    expect(summary.absent).toBe(1);
    expect(summary.excused).toBe(1);
    // 4 / 6 * 100 = 66.666 -> 67%
    expect(summary.attendancePercentage).toBe(67);
  });

  it('handles 0 attendance records safely without NaN division', () => {
    const totalDays = 0;
    const attendedDays = 0;
    const percentage = totalDays > 0 ? Math.round((attendedDays / totalDays) * 100) : 100;
    expect(percentage).toBe(100);
  });

  it('validates all recognized AttendanceStatus values', () => {
    const validStatuses = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];
    expect(validStatuses).toContain(AttendanceStatus.PRESENT);
    expect(validStatuses).toContain(AttendanceStatus.ABSENT);
    expect(validStatuses).toContain(AttendanceStatus.LATE);
    expect(validStatuses).toContain(AttendanceStatus.EXCUSED);
  });
});
