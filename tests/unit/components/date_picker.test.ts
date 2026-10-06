import { describe, it, expect } from "vitest";
import { parseDateInput } from "@/components/ui/date-picker";

describe("DatePicker parseDateInput — Resilient Date Formats", () => {
  it("correctly parses canonical YYYY-MM-DD format", () => {
    const result = parseDateInput("2018-04-15");
    expect(result.valid).toBe(true);
    expect(result.isoDate).toBe("2018-04-15");
    expect(result.year).toBe(2018);
    expect(result.month).toBe(4);
    expect(result.day).toBe(15);
  });

  it("correctly parses Nigerian / British DD/MM/YYYY format typed manually", () => {
    const result = parseDateInput("15/04/2018");
    expect(result.valid).toBe(true);
    expect(result.isoDate).toBe("2018-04-15");
    expect(result.year).toBe(2018);
    expect(result.month).toBe(4);
    expect(result.day).toBe(15);
  });

  it("correctly parses hyphenated DD-MM-YYYY format typed manually", () => {
    const result = parseDateInput("28-02-2019");
    expect(result.valid).toBe(true);
    expect(result.isoDate).toBe("2019-02-28");
    expect(result.year).toBe(2019);
    expect(result.month).toBe(2);
    expect(result.day).toBe(28);
  });

  it("correctly parses single digit day and month format e.g. 5/4/2018", () => {
    const result = parseDateInput("5/4/2018");
    expect(result.valid).toBe(true);
    expect(result.isoDate).toBe("2018-04-05");
  });

  it("rejects invalid days e.g. February 30th", () => {
    const result = parseDateInput("30/02/2020");
    expect(result.valid).toBe(false);
  });

  it("rejects invalid months e.g. month 13", () => {
    const result = parseDateInput("12/13/2020");
    expect(result.valid).toBe(false);
  });

  it("handles empty or whitespace strings cleanly", () => {
    const result = parseDateInput("   ");
    expect(result.valid).toBe(true);
    expect(result.isoDate).toBe("");
  });
});
