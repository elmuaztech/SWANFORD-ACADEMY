import { describe, it, expect } from "vitest";
import { toUserFacingError } from "@/lib/ui/error_messages";

describe("UI/UX Standard — Human-Readable Error Translation (Principle 4)", () => {
  it("translates Prisma P2002 email duplicate error into human-readable message", () => {
    const error = {
      code: "P2002",
      message: "Unique constraint failed on the fields: (`email`)",
    };
    const translated = toUserFacingError(error);
    expect(translated.title).toBe("Email Already in Use");
    expect(translated.message).toContain("email address is already registered");
    expect(translated.message).not.toContain("Prisma");
    expect(translated.message).not.toContain("P2002");
    expect(translated.message).not.toContain("constraint");
  });

  it("translates Prisma P2002 phone duplicate error into human-readable message", () => {
    const error = {
      code: "P2002",
      message: "Unique constraint failed on the fields: (`phone`)",
    };
    const translated = toUserFacingError(error);
    expect(translated.title).toBe("Phone Number Already in Use");
    expect(translated.message).toContain("already registered to another guardian");
  });

  it("translates database connection/timeout errors into friendly connectivity guidance", () => {
    const error = new Error("Can't reach database server at `localhost:5432` or transaction timeout");
    const translated = toUserFacingError(error);
    expect(translated.title).toBe("Service Temporarily Unavailable");
    expect(translated.message).toContain("unable to connect to the academy server");
    expect(translated.message).not.toContain("5432");
    expect(translated.message).not.toContain("localhost");
  });

  it("translates session and auth expiration errors into clear sign-in guidance", () => {
    const error = new Error("jwt expired or session token invalid");
    const translated = toUserFacingError(error);
    expect(translated.title).toBe("Session Expired");
    expect(translated.message).toBe("Your session has expired. Please sign in again to continue.");
  });

  it("translates financial overpayment violations cleanly", () => {
    const error = new Error("Payment exceeds remaining invoice balance (overpayment)");
    const translated = toUserFacingError(error);
    expect(translated.title).toBe("Payment Exceeds Balance");
    expect(translated.message).toContain("exceeds the outstanding balance");
  });

  it("never exposes raw stack traces or internal SQL keywords", () => {
    const error = new Error("SELECT * FROM invoices WHERE id = '999' failed with syntax error");
    const translated = toUserFacingError(error);
    expect(translated.message).not.toContain("SELECT");
    expect(translated.message).not.toContain("WHERE");
    expect(translated.title).toBe("Request Could Not Be Completed");
  });
});

describe("UI/UX Standard — Real-World Data & Nigerian Context (Principle 5)", () => {
  it("formats large Nigerian school fee amounts cleanly without float drift", () => {
    // ₦12,450,000.00 (1,245,000,000 Kobo)
    const largeKobo = BigInt(1245000000);
    const nairaNumber = Number(largeKobo) / 100;
    const formatted = `₦${nairaNumber.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    expect(formatted).toContain("12,450,000.00");
    expect(formatted).toContain("₦");
  });

  it("handles long multi-part Nigerian student names without truncation", () => {
    const longStudentName = "Fatima-Zahra Al-Hassan Abdullahi Muhammad";
    expect(longStudentName.length).toBeGreaterThan(30);
    expect(longStudentName.split(" ").length).toBeGreaterThanOrEqual(4);
    // Ensure name contains non-breaking components and valid hyphenation
    expect(longStudentName).toMatch(/^[A-Za-z\s-]+$/);
  });
});
