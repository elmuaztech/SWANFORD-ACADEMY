# Financial Precision & Architecture Blueprint

**Swanford Academy Management System**  
**Master Specification Reference:** Sections 6, 7, 15, 16, 24

---

## 1. Core Financial Rule: Integer Minor Units (Kobo)

In JavaScript and many standard database setups, standard floating-point numbers (IEEE 754) introduce binary approximation errors:
```javascript
// Floating point problem:
0.1 + 0.2 === 0.30000000000000004 // true
```

In a school financial ledger handling tuition fees, partial payments, and bank reconciliation, floating-point drift can corrupt balances, distort outstanding totals, and cause reconciliation failures.

### The Kobo Standard
* **All monetary values** across the database, APIs, and business logic must be stored and computed as **integer Kobo** (`1 Naira = 100 Kobo`).
* **Example:**
  * Application Form Fee: `₦5,000` → `500000` Kobo
  * Nursery Boys First Term: `₦102,000` → `10200000` Kobo
  * Primary Boys First Term: `₦110,000` → `11000000` Kobo
  * Partial Payment: `₦50,000.50` → `5000050` Kobo

---

## 2. Technical Groundwork Established in Stage 1

The module [`src/lib/money.ts`](file:///c:/SWANFORD%20ACADEMY/src/lib/money.ts) provides the foundational primitives:
1. `nairaToKobo(naira: number | string): Kobo`: Lossless string parsing and conversion to integer Kobo.
2. `koboToNaira(kobo: Kobo): number`: Conversion for display and external API payload serialization.
3. `formatNaira(kobo: Kobo, options?): string`: Standardized Nigerian currency formatting (`₦102,000.00`).
4. `sumKobo(...amounts: Kobo[]): Kobo`: Integer accumulation of fee items and payments.
5. `computeOutstandingBalance(invoiceKobo, paidKobo): Kobo`: Exact balance subtraction.
6. `isValidKoboAmount(kobo: unknown): boolean`: Schema type guard for non-negative integer validation.

---

## 3. Future Financial Stages (Deferred to Dedicated Stages)

Per Stage 1 constraints, the following features remain intentionally deferred:
* Fee Structure & Fee Item models (deferred to Stage 2/8)
* Invoice generation & partial/full payment tracking (deferred to Stage 8)
* Paystack API gateway integration & webhook idempotency (deferred to Stage 9)
* Expense recording & financial reports (deferred to Stage 8)
* Receipt PDF generation (deferred to Stage 14)
