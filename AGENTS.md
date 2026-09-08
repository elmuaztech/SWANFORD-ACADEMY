<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Swanford Academy — Permanent UI/UX & Product Quality Standard

This is a mandatory engineering standard for Swanford Academy and applies to every frontend screen and every future stage.
Do not build functional but visually unfinished interfaces and plan to "fix responsiveness later."
The application must be designed and implemented as a professional production software product from the first implementation of every screen.

### Mandatory Rules
1. **Mobile-first responsive design**: Test and guarantee support on 360px, 390px, 430px, 768px tablet, 1280px, 1440px, and 1920px. Never allow accidental horizontal overflow, clipped text, or unusable mobile tables. Minimum touch-target size is 44×44px.
2. **Consistent design system**: Always reuse components from `@/components` (`Button`, `Card`, `Badge`, `Alert`, `FormGroup`, `Input`, `Select`, `Table`, `Modal`, `Tabs`, `Pagination`, `States`). Never let individual pages invent ad-hoc visual languages.
3. **Professional simplicity**: Prioritize clarity, hierarchy, whitespace, and usability over decoration. Obvious primary action on every screen.
4. **Never expose developer language to users**: Technical diagnostics (PostgreSQL errors, Prisma constraint codes, Argon errors, stack traces, internal IDs) must stay in server logs. All user-facing messages must be professional, dignified, and human-readable (see `@/lib/ui/error_messages.ts`).
5. **Real-world data testing**: Test with long Nigerian names, large financial amounts (₦), pagination, empty tables, and slow/loading states.
6. **Accessible forms & tables**: Human-readable errors adjacent to fields; transform tables to responsive cards or scrolling containers with visible indicators on small screens.
7. **Loading, empty, and error states**: Never leave a screen blank during data fetching. Provide skeletons, friendly empty states, and actionable error states.
8. **Frontend quality gate**: Inspect rendered interfaces visually at mobile and desktop sizes in addition to running `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.
