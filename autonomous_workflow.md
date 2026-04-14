# Autonomous frontend workflow

This file tracks the local iterative workflow for the coded frontend.

## Goal

Build the app in small loops and keep every loop grounded in:

- product notes kept outside the repository
- current UI screenshots and design references

## Working loop

1. implement the next useful UI slice
2. run the app locally
3. use Playwright to:
   - log in
   - click through the main screens
   - capture screenshots
4. review the screenshots and compare against the current product direction
5. clean dead code and simplify the UI
6. repeat

## What already failed

- WeWeb AI generated code that assumed `window.supabase` / `createClient(...)`, which does not match WeWeb's plugin model.
- That path consumed credits and introduced plugin/runtime errors instead of helping ship the MVP.

## What is expected to work better

- local coded frontend
- direct control over Supabase auth and queries
- Playwright screenshots and smoke tests for each iteration
- manual comparison of each screen to the current workflow and design intent

## What is working in the loop

- A small React + TypeScript frontend over the existing Supabase schema is much easier to reason about than the WeWeb path.
- Typed Supabase access plus a thin API layer keeps the UI iteration focused on behavior instead of guessing at payload shapes.
- Prefilled demo credentials make browser loops repeatable.
- Playwright is useful when the assertions wait on data-bearing elements, not just shell headings.
- Screenshot capture is valuable after route changes and real data readiness checks.
- Row-save coverage is safe when the test mutates data and then restores it in the same run.

## What is not working in the loop

- Treating a visible page heading as proof that the screen is ready is too weak; the first screenshots captured loading states and looked better than the actual UX.
- Broad text selectors are fragile in estimate screens because the same scope item can appear in both the table and the proposal summary.
- Creating permanent demo data from browser tests is risky against the hosted Supabase project unless there is a cleanup path.
- WeWeb AI was not trustworthy for this project because it generated Supabase code that did not match the actual plugin/runtime model.

## Guardrails that seem worth keeping

- Always wait for route changes and a unique, data-backed locator before taking a screenshot.
- Prefer assertions scoped to the table, row, card, or panel instead of loose page text.
- When a workflow touches hosted sample data, either restore the original values in the same test or avoid mutating that path.
- Treat screenshot review and DOM inspection as complementary: screenshots catch layout issues, while Playwright error snapshots explain why a loop failed.

## Iteration log

### Iteration 0

- switched from WeWeb to coded frontend
- preserved Supabase backend and seeded sample data
- starting frontend scaffold next

### Iteration 1

- built the first coded slice: login, dashboard, project detail, and typed Supabase queries
- added the first Playwright smoke path and screenshot capture
- learned that the test was too optimistic because it only waited for page chrome
- result: screenshots looked like success but actually captured dashboard/project loading states

### Iteration 2

- added explicit loading states for scoped dashboard/project data
- changed Playwright to wait for real project links, route changes, and estimate rows before screenshots
- reviewed the loaded project workspace and found the table was too cramped relative to the right-hand summary panels
- widened the main project pane and made the left estimate columns sticky so the WBS and scope stay readable while scrolling cost columns
- result: the screenshots now reflect the real loaded experience instead of a transient shell state

### Iteration 3

- extended the browser loop to edit a row, save it, confirm the metric change, revert it, and verify the session can sign out and sign back in
- learned that session round-trip assertions should key off the real login copy or route, not remembered phrasing
- important constraint: avoid testing project creation against hosted sample data until there is an automated cleanup path

## Current next steps

- add targeted coverage for more estimate-row edits, especially rows in other sections
- decide whether project creation testing should move to a resettable local Supabase loop instead of the hosted demo project
- keep refining the project workspace hierarchy so the estimate table remains the dominant surface
