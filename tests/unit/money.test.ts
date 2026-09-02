import { describe, it, expect } from "vitest";
import {
  nairaToKoboBigInt,
  formatNaira,
  sumKoboBigInt,
  computeOutstandingBalance,
  serializeBigInt,
  parseKoboFromDto,
  KOBO_PER_NAIRA,
} from "@/lib/money";
import "@/lib/prisma"; // ensures BigInt.prototype.toJSON is installed

describe("Financial Precision & Money Engine", () => {
  it("converts standard Naira amounts to exact integer Kobo BigInt", () => {
    // ₦102,000 = 10,200,000 Kobo
    expect(nairaToKoboBigInt("102000")).toBe(BigInt(10200000));
    expect(nairaToKoboBigInt(102000)).toBe(BigInt(10200000));

    // ₦107,500.50 = 10,750,050 Kobo
    expect(nairaToKoboBigInt("107500.50")).toBe(BigInt(10750050));
    expect(nairaToKoboBigInt(107500.5)).toBe(BigInt(10750050));

    // Formatted strings with commas and symbols
    expect(nairaToKoboBigInt("₦115,500.00")).toBe(BigInt(11550000));
    expect(nairaToKoboBigInt("  5,000 ")).toBe(BigInt(500000));
  });

  it("handles high precision without 64-bit floating point corruption", () => {
    // ₦500,000,000.75 (Half a billion Naira)
    const largeKobo = nairaToKoboBigInt("500000000.75");
    expect(largeKobo).toBe(BigInt("50000000075"));
    expect(largeKobo % KOBO_PER_NAIRA).toBe(BigInt(75));
  });

  it("formats integer Kobo into standardized Nigerian currency string", () => {
    expect(formatNaira(BigInt(10200000))).toBe("₦102,000.00");
    expect(formatNaira(BigInt(10750050))).toBe("₦107,500.50");
    expect(formatNaira(BigInt(1800000), { showDecimals: false })).toBe("₦18,000");
    expect(formatNaira(BigInt(500000), { includeSymbol: false })).toBe("5,000.00");
  });

  it("computes exact addition and subtraction with BigInt", () => {
    const tuition = BigInt(7500000); // ₦75,000
    const uniform = BigInt(2500000); // ₦25,000
    const medical = BigInt(1000000); // ₦10,000

    const totalInvoice = sumKoboBigInt(tuition, uniform, medical);
    expect(totalInvoice).toBe(BigInt(11000000)); // ₦110,000

    const partialPayment = BigInt(6000000); // ₦60,000
    const outstanding = computeOutstandingBalance(totalInvoice, partialPayment);
    expect(outstanding).toBe(BigInt(5000000)); // ₦50,000
  });

  it("safely serializes BigInt fields in DTO objects without precision loss", () => {
    const dto = {
      invoiceId: "inv-123",
      totalAmountKobo: BigInt("11000000000055"),
      items: [
        { name: "Item 1", amountKobo: BigInt("6000000000050") },
        { name: "Item 2", amountKobo: BigInt("5000000000005") },
      ],
      createdAt: new Date("2026-09-01T10:00:00Z"),
    };

    const serialized = serializeBigInt(dto);
    expect(serialized.totalAmountKobo).toBe("11000000000055");
    expect(serialized.items[0].amountKobo).toBe("6000000000050");
    expect(serialized.items[1].amountKobo).toBe("5000000000005");

    // Deserialization round-trip
    const restored = parseKoboFromDto(serialized.totalAmountKobo);
    expect(restored).toBe(BigInt("11000000000055"));
  });

  it("prevents JSON.stringify crash on BigInt via toJSON patch", () => {
    const record = {
      invoiceNumber: "INV-2026-00001",
      amountKobo: BigInt(10200000),
    };

    expect(() => JSON.stringify(record)).not.toThrow();
    const jsonStr = JSON.stringify(record);
    expect(jsonStr).toBe('{"invoiceNumber":"INV-2026-00001","amountKobo":"10200000"}');
  });
});
