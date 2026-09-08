# Swanford Academy — Frontend Engineering & UI/UX Design Standard

## 1. Purpose & Scope
This document specifies the mandatory architectural, accessibility, visual, and UX standard for all user interfaces across Swanford Academy (Admissions Portal, Finance & Invoicing, Administrator Portal, Teacher Portal, Guardian/Parent Portal, and Public Academic Website).

Every screen must be built as a finished, production-grade interface from the first implementation. Never defer responsiveness, accessibility, or professional styling to future cleanup phases.

---

## 2. Responsive Breakpoint Specification
Every screen must be explicitly verified across the following viewports:

| Target Device / Category | Viewport Width | Design Considerations |
| :--- | :--- | :--- |
| Compact Mobile | **360px** | Base layout. Single-column forms, stacked card tables, compact typography, 44px touch targets. Zero horizontal scroll. |
| Standard Mobile | **390px** | iPhone standard. Comfortable padding (16px), stacked action buttons, collapsible mobile drawer navigation. |
| Large Mobile | **430px** | High-end mobile/phablet. Card layouts, clear hierarchical whitespace. |
| Tablet | **768px** | Two-column form layouts where logical, responsive table containers with prioritized columns, persistent or slide-out sidebar. |
| Compact Desktop | **1024px** | Multi-column dashboard grids, side navigation with collapse toggle, full tables. |
| Standard Desktop | **1280px** | Primary desktop benchmark. Centered content containers (max-w-7xl), full breadcrumbs and filters. |
| Widescreen Desktop | **1440px – 1920px** | Bounded container widths to prevent overly stretched lines of text (max line length ~75ch for readable prose). |

### Golden Rules of Mobile-First Layouts
1. **Never compress desktop layouts**: Desktop grids must wrap or collapse into deliberate mobile flows rather than shrinking to microscopic dimensions.
2. **Strict overflow prevention**: `overflow-x: hidden` at root level where appropriate, with intentional horizontal scroll containers for data tables that include visual indicators.
3. **Touch target accessibility**: All clickable elements (buttons, links, tab items, dropdown triggers, checkboxes) must have a minimum interactive tap target of **44×44px** on mobile viewports.

---

## 3. Swanford Academy Design Tokens & Palette

### Primary Academic Brand Colors
- **Swanford Emerald 900**: `#064e3b` (Deep academic primary, headers, active navigation)
- **Swanford Emerald 800**: `#065f46` (Brand solid, primary buttons, badges)
- **Swanford Emerald 700**: `#047857` (Interactive hover states)
- **Swanford Emerald 100**: `#d1fae5` (Light background accents, success highlights)
- **Swanford Emerald 50**: `#ecfdf5` (Page hero backgrounds, subtle cards)

### Neutral & Contrast Hierarchy (Slate)
- **Slate 900**: `#0f172a` (Primary headings, high-contrast text)
- **Slate 700**: `#334155` (Body text, labels)
- **Slate 500**: `#64748b` (Secondary text, helper notes, timestamps)
- **Slate 200**: `#e2e8f0` (Standard component borders, card dividers)
- **Slate 100**: `#f1f5f9` (Subtle card headers, zebra stripes)
- **Slate 50**: `#f8fafc` (Application canvas background)

### Status & Semantic Feedback
- **Success**: Emerald 700 (`#047857`) on Emerald 50 (`#ecfdf5`)
- **Warning**: Amber 700 (`#b45309`) on Amber 50 (`#fffbeb`)
- **Danger / Error**: Rose 700 (`#be123c`) on Rose 50 (`#fff1f2`)
- **Information**: Sky 700 (`#0369a1`) on Sky 50 (`#f0f9ff`)
*Crucial Rule*: Never rely on color alone to communicate status. Every badge and alert must include explicit text labels and/or recognizable semantic icons.

---

## 4. Component Architecture (`src/components/`)

All user interfaces must import and reuse canonical components from `@/components`:

```
src/components/
├── ui/
│   ├── button.tsx           # Primary, secondary, outline, ghost, danger, link; loading state, >=44px
│   ├── badge.tsx            # Semantic status indicators with text & optional dot indicator
│   ├── card.tsx             # Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter
│   ├── input.tsx            # Accessible text, email, tel, number, date inputs
│   ├── textarea.tsx         # Accessible multi-line inputs with counter support
│   ├── select.tsx           # Standardized select dropdown with clear options
│   ├── checkbox.tsx         # Accessible checkbox with integrated label
│   ├── form-group.tsx       # Label, required mark (*), helper text, human-readable error display
│   ├── alert.tsx            # Dismissible semantic alert banners
│   ├── modal.tsx            # Responsive dialog / mobile bottom sheet with focus trap
│   ├── table.tsx            # Responsive table supporting desktop rows and mobile card views
│   ├── tabs.tsx             # Scrollable responsive tab bar
│   ├── pagination.tsx       # Mobile-friendly pagination controls
│   ├── dropdown.tsx         # Action menu dropdown
│   └── states.tsx           # LoadingState, EmptyState, ErrorState, SuccessMessage
├── layout/
│   ├── navbar.tsx           # Responsive brand header with user role indicator
│   ├── mobile-nav.tsx       # Off-canvas mobile navigation drawer
│   └── page-header.tsx      # Standard page header with breadcrumb and primary CTA
└── index.ts                 # Clean barrel export
```

---

## 5. Human-Readable Error Policy

Under no circumstances may technical error strings, framework exceptions, database query fragments, or internal IDs be displayed to ordinary users:

| Technical / Developer String (STRICTLY PROHIBITED) | User-Facing Professional Replacement (MANDATORY) |
| :--- | :--- |
| `PrismaClientKnownRequestError: Unique constraint failed on the fields: (email)` | "An account with this email address is already registered." |
| `P2002 constraint failed on phone` | "This phone number is already registered for another guardian." |
| `Database transaction failed: rollback` | "We were unable to save your changes. Please review your details and try again." |
| `Argon2 password hash error` | "The password entered does not meet security requirements or is incorrect." |
| `NetworkError when attempting to fetch resource` | "We could not connect to the school server. Please check your internet connection." |
| `Internal Server Error 500 (Unhandled)` | "We encountered an unexpected problem processing this request. Our technical team has been notified." |
| `Record not found in student table for ID: 9f82c...` | "The requested student record could not be found. It may have been moved or removed." |

All API client calls and server actions must translate exceptions through `@/lib/ui/error_messages.ts` before rendering feedback to the user.

---

## 6. Real-World Data Robustness Checklist

1. **Name Field Stress**:
   - Verify layout with 4-part Nigerian names: e.g. `Fatima-Zahra Al-Hassan Abdullahi Muhammad`.
   - Ensure names wrap cleanly without breaking card margins or table column widths.
2. **Monetary Precision & Formatting**:
   - Never display raw integer Kobo to users (e.g. `1245000000`).
   - Format cleanly via Nigerian Naira currency standards: `₦12,450,000.00`.
   - Ensure large numbers do not cause layout overflow on 360px mobile viewports.
3. **Empty States**:
   - Never leave tables or lists blank. Always render `EmptyState` with a helpful explanation and a clear next-step button.
4. **Loading States**:
   - Never leave users on an unassisted white screen. Provide skeleton loaders matching the layout geometry.

---

## 7. Frontend Verification & Quality Review Protocol

Before declaring any frontend stage complete:
1. **Automated Verification**:
   - `npm test`: All unit and integration tests pass.
   - `npm run typecheck`: TypeScript passes with 0 errors.
   - `npm run lint`: ESLint passes with 0 errors and 0 warnings.
   - `npm run build`: Production bundle compiles cleanly.
2. **Visual & Responsive Verification**:
   - Verify viewports: 360px (Small Mobile), 390px (Mobile), 768px (Tablet), 1280px+ (Desktop).
   - Verify keyboard tab order, focus ring visibility, and contrast.
   - Verify absence of technical/database terminology in all user-visible copy.
