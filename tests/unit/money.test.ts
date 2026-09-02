import { describe, it, expect } from "vitest";
import {
  nairaToKobo,
  koboToNaira,
  formatNaira,
  sumKobo,
  computeOutstandingBalance,
  isValidKoboAmount,
} from "@/lib/money";

describe("Financial Precision Engine (Kobo Minor Units)", () => {
  describe("nairaToKobo conversion", () => {
    it("correctly converts whole Naira amounts to integer Kobo", () => {
      expect(nairaToKobo(102000)).toBe(10200000);
      expect(nairaToKobo("107500")).toBe(10750000);
      expect(nairaToKobo("5000")).toBe(500000);
    });

    it("correctly converts decimal Naira strings without floating point drift", () => {
      expect(nairaToKobo("102000.50")).toBe(10200050);
      expect(nairaToKobo("49000.99")).toBe(4900099);
      expect(nairaToKobo("0.05")).toBe(5);
    });

    it("handles Naira strings with currency symbol and commas", () => {
      expect(nairaToKobo("₦115,500.00")).toBe(11550000);
      expect(nairaToKobo("18,000")).toBe(1800000);
    });

    it("throws a TypeError on invalid inputs", () => {
      expect(() => nairaToKobo("invalid_number")).toThrow(TypeError);
      expect(() => nairaToKobo(Infinity)).toThrow(TypeError);
      expect(() => nairaToKobo(NaN)).toThrow(TypeError);
    });
  });

  describe("koboToNaira conversion", () => {
    it("converts integer Kobo back to Naira number", () => {
      expect(koboToNaira(10200000)).toBe(102000);
      expect(koboToNaira(500000)).toBe(5000);
      expect(koboToNaira(10200050)).toBe(102000.5);
    });

    it("throws if non-integer is passed to koboToNaira", () => {
      expect(() => koboToNaira(1234.56)).toThrow(TypeError);
    });
  });

  describe("formatNaira", () => {
    it("formats standard Nigerian currency strings with symbol and decimals", () => {
      expect(formatNaira(10200000)).toBe("₦102,000.00");
      expect(formatNaira(10750050)).toBe("₦107,500.50");
      expect(formatNaira(0)).toBe("₦0.00");
    });

    it("supports formatting without symbol and without decimals", () => {
      expect(formatNaira(10200000, { includeSymbol: false })).toBe("102,000.00");
      expect(formatNaira(10200000, { showDecimals: false })).toBe("₦102,000");
      expect(formatNaira(10200000, { includeSymbol: false, showDecimals: false })).toBe("102,000");
    });

    it("correctly formats negative balances", () => {
      expect(formatNaira(-500000)).toBe("-₦5,000.00");
    });
  });

  describe("sumKobo arithmetic", () => {
    it("accurately sums multiple kobo items avoiding IEEE-754 precision issues", () => {
      // 0.1 + 0.2 in float is 0.30000000000000004
      // In kobo: 10 + 20 = 30 exactly
      expect(sumKobo(10, 20)).toBe(30);
      expect(sumKobo(10200000, 500000, 800000)).toBe(11500000);
    });
  });

  describe("computeOutstandingBalance", () => {
    it("computes outstanding balance: invoice - paid", () => {
      const invoice = 10200000; // ₦102,000
      const partialPayment = 5000000; // ₦50,000
      expect(computeOutstandingBalance(invoice, partialPayment)).toBe(5200000); // ₦52,000
    });

    it("returns zero when fully paid", () => {
      const invoice = 10200000;
      expect(computeOutstandingBalance(invoice, invoice)).toBe(0);
    });
  });

  describe("isValidKoboAmount", () => {
    it("identifies valid kobo values", () => {
      expect(isValidKoboAmount(0)).toBe(true);
      expect(isValidKoboAmount(100)).toBe(true);
      expect(isValidKoboAmount(-5)).toBe(false);
      expect(isValidKoboAmount(12.5)).toBe(false);
      expect(isValidKoboAmount("100")).toBe(false);
    });
  });
});
