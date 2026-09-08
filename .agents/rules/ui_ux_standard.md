# Swanford Academy — Permanent UI/UX & Product Quality Standard

This is a mandatory engineering standard for Swanford Academy and applies to every frontend screen, every component, and every future stage.

## 1. Mobile-First Responsive Design
- Design every interface mobile-first, ensuring it works seamlessly across:
  - 360px mobile
  - 390px mobile
  - 430px mobile
  - 768px tablet
  - 1280px desktop
  - 1440px desktop
  - 1920px desktop
- Never assume a desktop layout can simply be compressed onto a phone.
- Tables, forms, dashboards, cards, navigation, modals, dropdowns, filters, buttons, and notifications must intentionally adapt to smaller screens.
- Never allow accidental horizontal overflow, clipped text, overlapping elements, broken layouts, microscopic text, unusable tables, or buttons extending outside the viewport.

## 2. Establish a Consistent Design System
- Do not allow individual pages to invent their own visual language.
- Consistently reuse shared components from `@/components`:
  - Typography (`h1`–`h6`, body, lead, caption)
  - Spacing (4px, 8px, 12px, 16px, 24px, 32px, 48px)
  - Buttons (`Button` with variants, sizes, loading states, >=44px touch target)
  - Form controls (`Input`, `Textarea`, `Select`, `Checkbox`, `FormGroup` with human errors)
  - Cards (`Card`, `CardHeader`, `CardTitle`, `CardContent`, `CardFooter`)
  - Tables (`ResponsiveTable` with card mode / horizontal scroll hint)
  - Badges/status indicators (`Badge` with variant and visual dot, not color alone)
  - Alerts (`Alert` with info, success, warning, error)
  - Dialogs/modals (`Modal` with backdrop, mobile bottom sheet, keyboard Escape)
  - Dropdowns (`DropdownMenu`)
  - Tabs (`Tabs` with mobile horizontal scroll)
  - Navigation (`Navbar`, `MobileNav`, `PageHeader`, `Breadcrumbs`)
  - Pagination (`Pagination` mobile-friendly)
  - Loading, empty, and error states (`LoadingState`, `EmptyState`, `ErrorState`, `SuccessMessage`)
- Admissions, Finance, Admin, Teacher, Parent, and Public Website interfaces must look like parts of one coherent Swanford product.

## 3. Professional Simplicity
- Prioritize clarity, hierarchy, whitespace, consistency, and usability over unnecessary decoration.
- Do not overcrowd screens with excessive cards, colors, icons, animations, gradients, or borders.
- Every screen should make the primary user action obvious.

## 4. Never Expose Developer Language to Normal Users
- Technical implementation details must never appear in ordinary user-facing messages.
- FORBIDDEN:
  - “Saved to PostgreSQL”
  - “Prisma error” / “Database transaction failed”
  - “Argon/security error” / “Internal server error 500”
  - Stack traces, file paths, raw database column names, internal UUIDs, SQL queries.
- MANDATORY:
  - “Student saved successfully.”
  - “We couldn't complete this request. Please check your connection and try again.”
  - “Your session has expired. Please sign in again.”
  - “The phone number entered is invalid. Please enter an 11-digit Nigerian phone number.”
- Technical diagnostic information belongs exclusively in controlled server-side logs.

## 5. Real-World Data Testing
- Test every UI with real-world edge cases:
  - Long student names (e.g. "Fatima-Zahra Al-Hassan Abdullahi Muhammad")
  - Long guardian names and Nigerian addresses
  - Large financial amounts (e.g. "₦12,450,000.00")
  - High row counts (50+ rows), pagination, and empty results
  - Validation errors on multiple fields
  - Slow loading states and network failure scenarios

## 6. Forms
- Simple, logically grouped, easy to complete on mobile.
- Use clear labels, helpful validation, and appropriate HTML input types (`tel`, `email`, `number`, `date`).
- Validation errors must appear directly adjacent to the relevant field using human-readable language.

## 7. Tables
- Never force a large desktop table into a tiny mobile viewport.
- Transform tables into responsive cards, prioritized columns, or horizontal scrolling containers with visible indicators.

## 8. Navigation
- Role- and device-appropriate navigation.
- Mobile drawer / bottom navigation with touch targets >= 44px.
- Breadcrumbs and clear heading hierarchy so users always know where they are.

## 9. Loading, Empty, and Error States
- Every major data-driven screen must have deliberate:
  - Loading state (skeleton or spinner)
  - Empty state (friendly illustration/icon, clear description, primary action)
  - Success state (toast/banner confirmation)
  - Validation state (inline field errors)
  - Recoverable error state (retry button, clear human guidance)

## 10. Accessibility
- Accessible labels (`aria-label`, `aria-describedby`, `<label htmlFor>`).
- Keyboard navigation & visible focus rings (`focus-visible:ring-2 focus-visible:ring-emerald-600`).
- Touch-target size: minimum 44×44px on touch devices.
- WCAG AA contrast ratio compliance.
- Status indicators must not rely solely on color (combine icons/text with color).

## 11. Performance
- Lightweight and fast for Swanford's KVM1 production environment.
- Avoid unnecessary polling, heavy animations, oversized unoptimized images, and bloated client state.

## 12. Quality Gate for Every Frontend Stage
- Inspect the rendered interface at mobile (360px, 390px, 430px), tablet (768px), and desktop (1280px+).
- Passing unit tests, typecheck, and build is necessary but NOT sufficient; visual/UX review is mandatory before declaring completion.
