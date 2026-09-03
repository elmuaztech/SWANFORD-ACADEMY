import { describe, it, expect } from "vitest";
import {
  SWANFORD_TIMEZONE,
  LAGOS_UTC_OFFSET_HOURS,
  createLagosInstant,
  evaluateAdmissionWindow,
  isProgrammeAvailableForApplication,
  formatLagosDate,
} from "../../src/lib/admission_window";
import { AdmissionCycleStatus, ProgrammeAvailabilityStatus } from "@prisma/client";

describe("Admission Window & Canonical Africa/Lagos Timezone Engine", () => {
  it("verifies canonical timezone constants", () => {
    expect(SWANFORD_TIMEZONE).toBe("Africa/Lagos");
    expect(LAGOS_UTC_OFFSET_HOURS).toBe(1);
  });

  // 14. Timezone boundary behavior
  it("creates exact UTC instants for Lagos school opening and closing times", () => {
    // 08:00:00 Lagos (UTC+1) must equal 07:00:00.000Z UTC
    const schoolOpen = createLagosInstant("2026-08-01", "school_open");
    expect(schoolOpen.toISOString()).toBe("2026-08-01T07:00:00.000Z");

    // 23:59:59.999 Lagos (UTC+1) must equal 22:59:59.999Z UTC
    const dayEnd = createLagosInstant("2026-09-30", "end_of_day");
    expect(dayEnd.toISOString()).toBe("2026-09-30T22:59:59.999Z");

    // Specific custom time: 14:30:00 Lagos -> 13:30:00Z UTC
    const customTime = createLagosInstant("2026-08-15", "14:30:00");
    expect(customTime.toISOString()).toBe("2026-08-15T13:30:00.000Z");
  });

  // 1. Admission cycle before opening
  it("evaluates admission cycle before opening boundary as closed", () => {
    const cycle = {
      name: "2026/2027 Main Admission",
      startDate: createLagosInstant("2026-08-01", "school_open"), // 01-Aug-2026 08:00 WAT
      endDate: createLagosInstant("2026-09-30", "end_of_day"),     // 30-Sep-2026 23:59:59 WAT
      status: AdmissionCycleStatus.OPEN,
    };

    // Evaluated at 31-July-2026 23:00 WAT
    const beforeDate = new Date("2026-07-31T22:00:00.000Z");
    const result = evaluateAdmissionWindow(cycle, beforeDate);

    expect(result.isOpen).toBe(false);
    expect(result.canAcceptDrafts).toBe(false);
    expect(result.canAcceptSubmissions).toBe(false);
    expect(result.canAcceptPayments).toBe(false);
    expect(result.reason).toBe("BEFORE_WINDOW");
  });

  // 2. Admission cycle during open window
  it("evaluates admission cycle during open window as active and open", () => {
    const cycle = {
      name: "2026/2027 Main Admission",
      startDate: createLagosInstant("2026-08-01", "school_open"),
      endDate: createLagosInstant("2026-09-30", "end_of_day"),
      status: AdmissionCycleStatus.OPEN,
    };

    // Evaluated at 15-August-2026 12:00 WAT
    const duringDate = new Date("2026-08-15T11:00:00.000Z");
    const result = evaluateAdmissionWindow(cycle, duringDate);

    expect(result.isOpen).toBe(true);
    expect(result.canAcceptDrafts).toBe(true);
    expect(result.canAcceptSubmissions).toBe(true);
    expect(result.canAcceptPayments).toBe(true);
  });

  // 3. Admission cycle after closing
  it("evaluates admission cycle after closing boundary as closed", () => {
    const cycle = {
      name: "2026/2027 Main Admission",
      startDate: createLagosInstant("2026-08-01", "school_open"),
      endDate: createLagosInstant("2026-09-30", "end_of_day"),
      status: AdmissionCycleStatus.OPEN,
    };

    // Evaluated at 01-October-2026 00:01 WAT (23:01 UTC)
    const afterDate = new Date("2026-09-30T23:01:00.000Z");
    const result = evaluateAdmissionWindow(cycle, afterDate);

    expect(result.isOpen).toBe(false);
    expect(result.canAcceptDrafts).toBe(false);
    expect(result.canAcceptSubmissions).toBe(false);
    expect(result.canAcceptPayments).toBe(false);
    expect(result.reason).toBe("AFTER_WINDOW");
  });

  // 4. Programme-specific OPEN/CLOSED/FULL
  it("correctly evaluates programme availability states", () => {
    expect(isProgrammeAvailableForApplication({ status: ProgrammeAvailabilityStatus.OPEN }).isAvailable).toBe(true);
    
    const closedProg = isProgrammeAvailableForApplication({ status: ProgrammeAvailabilityStatus.CLOSED });
    expect(closedProg.isAvailable).toBe(false);
    expect(closedProg.reason).toBe("CLOSED");

    const fullProg = isProgrammeAvailableForApplication({ status: ProgrammeAvailabilityStatus.FULL });
    expect(fullProg.isAvailable).toBe(false);
    expect(fullProg.reason).toBe("FULL");

    const unlistedProg = isProgrammeAvailableForApplication(undefined);
    expect(unlistedProg.isAvailable).toBe(false);
    expect(unlistedProg.reason).toBe("CLOSED");
  });

  it("formats dates consistently in Africa/Lagos (WAT)", () => {
    const utcInstant = new Date("2026-08-01T07:00:00.000Z");
    const formatted = formatLagosDate(utcInstant, true);
    // Should display 08:00:00 am in Lagos
    expect(formatted).toContain("01 Aug 2026");
    expect(formatted).toContain("08:00:00");
  });
});
