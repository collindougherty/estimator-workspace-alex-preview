# WeWeb agent prompt

You are building the **WeWeb frontend** for a contractor estimating app on top of an existing **Supabase backend**.

Do **not** redesign the backend. Use the schema, views, and RPCs that already exist. Keep the UI **simple, fast, and estimate-first**. The product direction comes from the meeting transcript and two sketch images in this repo:

- `alex_meeting_transcript.txt`
- `724.jpg`
- `725.jpg`

## Product direction

The product is intentionally staged:

1. **Estimate first**
   - contractors enter hours, materials, equipment, overhead, and profit
   - the system generates a proposal / bid summary
2. **After the bid is won**
   - track actual hours, actual costs, equipment time, and percent complete
   - support invoice generation
3. **Later**
   - build historical data, dashboards, and reporting

The second sketch defines the core estimating model:

- **WBS** = Work Breakdown Structure (terminal work items)
- **CBS** = Cost Breakdown Structure
  - A = Labor
  - B = Materials
  - C = Equipment
  - D = Subcontractors
  - E = Overhead / Profit

The first seeded contractor preset is:

- **Roofing / Gutters / Siding**

The seeded WBS items are:

1. Tear off and disposal
2. Deck sheeting repair
3. Ice and water shield
4. Synthetic underlayment
5. Architectural shingles
6. Ridge vent and cap
7. Flashing and drip edge
8. Gutters and downspouts
9. Siding patch and replacement

## UX principles

- Keep the app much simpler than Procore or enterprise construction software.
- Optimize for small contractors who are good at the trade but not very technical.
- The UI should feel like:
  - a **project list/dashboard**
  - a **project estimate detail page**
  - a **clear row-based estimating table**
- a **proposal summary**
- Tracking screens can exist as placeholders or early versions, but estimating is the main focus.

## Critical WeWeb implementation constraints

- **Do not use `window.supabase` or call `createClient(...)` inside WeWeb formulas.**
- **Do not assume Supabase is available as a browser global.**
- Configure Supabase through WeWeb's built-in plugins instead:
  - **Supabase Auth plugin**
  - **Supabase Data plugin**
- In custom JS, prefer the plugin-managed client instance instead of creating a new one manually.
- If custom JS is absolutely required, use the WeWeb plugin instance pattern rather than `window.supabase`.
- Prefer WeWeb workflow actions and plugin bindings over handwritten auth logic whenever possible.

Example of the correct direction for custom JS in WeWeb:

```js
const supabase =
  wwLib.wwPlugins.supabaseAuth?.publicInstance ||
  wwLib.wwPlugins.supabase?.instance;

if (!supabase) {
  throw new Error('Supabase plugin not initialized in WeWeb');
}

const { data, error } = await supabase.auth.signInWithPassword({
  email: context.parameters.email,
  password: context.parameters.password,
});

if (error) {
  throw new Error(error.message || 'Authentication failed');
}

return data;
```

Also note:

- if the WeWeb Supabase plugin is configured correctly, you should **not** need to read `SUPABASE_URL` and `SUPABASE_ANON_KEY` from a custom JS formula
- configure those values in the plugin itself
- because this backend uses RLS, the UI must authenticate before trying to read organization/project data

## Supabase backend that already exists

### Core tables

Use these exact tables:

1. `profiles`
   - Supabase Auth-backed user profile row

2. `organizations`
   - contractor companies / accounts

3. `organization_members`
   - membership + role (`owner`, `admin`, `member`)

4. `contractor_presets`
   - contractor preset definitions
   - includes the seeded `roofing_gutters_siding` system preset

5. `preset_wbs_items`
   - terminal WBS items for each preset

6. `projects`
   - project / bid records
   - status enum:
     - `draft`
     - `bidding`
     - `submitted`
     - `won`
     - `active`
     - `completed`
     - `lost`
     - `archived`

7. `project_estimate_items`
   - flattened estimate rows for each project
   - each row already carries the WBS item plus CBS inputs

8. `project_item_actuals`
   - actuals / tracking row keyed 1:1 to `project_estimate_items`
   - use later for tracking, earned value, and invoice progress

### Important views

Use these views for read-heavy screens:

1. `project_item_metrics`
   - row-level calculations
   - includes estimated direct cost, estimated total cost, actual total cost, earned value, variances

2. `project_summary`
   - project-level rollups
   - use for dashboards and project list cards

### Important RPCs

Use these exact RPCs:

1. `create_organization(p_name text, p_slug text default null)`
   - creates an organization and makes the current user the owner

2. `create_project_from_preset(
   p_organization_id uuid,
   p_preset_id uuid,
   p_name text,
   p_customer_name text default null,
   p_location text default null,
   p_bid_due_date date default null,
   p_notes text default null
   )`
   - creates a project
   - clones the preset WBS items into `project_estimate_items`
   - seeds matching `project_item_actuals` rows

## Fields to use on the estimate screen

For each `project_estimate_items` row, expose at least:

- `is_included`
- `section_code`
- `section_name`
- `item_code`
- `item_name`
- `unit`
- `quantity`
- `labor_hours`
- `labor_rate`
- `material_cost`
- `equipment_days`
- `equipment_rate`
- `subcontract_cost`
- `overhead_percent`
- `profit_percent`
- `notes`

For calculated display, prefer `project_item_metrics`:

- `estimated_labor_cost`
- `estimated_equipment_cost`
- `estimated_direct_cost`
- `estimated_overhead_cost`
- `estimated_profit_cost`
- `estimated_total_cost`
- `actual_total_cost`
- `earned_value_amount`
- `cost_variance`
- `labor_hour_variance`

## WeWeb pages to build

### 1. Auth / bootstrap

- Sign in with Supabase Auth
- If the user has no organization yet, guide them through creating one using `create_organization`

### 2. Dashboard / project list

Use `project_summary` to show:

- bidding projects
- submitted bids
- active jobs
- completed / archived jobs

Show simple cards or tables with:

- project name
- customer
- location
- status
- bid due date
- estimated total cost

### 3. New project flow

Flow:

1. choose organization
2. choose contractor preset
3. enter project name, customer, location, due date, notes
4. call `create_project_from_preset(...)`
5. route to project detail page

### 4. Project estimate detail

This is the main page.

Requirements:

- table/grid of `project_estimate_items`
- group rows visually by `section_code` / `section_name`
- editable cost inputs per row
- toggle `is_included`
- show totals from `project_item_metrics`
- show project totals from `project_summary`

The mental model should mirror the sketch:

- WBS rows down the left
- CBS buckets across the row
- totals on the right

### 5. Proposal / bid summary

A simple printable or reviewable summary using:

- included WBS items
- quantities
- total estimated cost
- optionally grouped subtotals by section

This does **not** need to be fancy in V1.

### 6. Tracking placeholder / early tracking page

Use `project_item_actuals` and `project_item_metrics` for:

- percent complete
- actual quantity
- actual labor hours / cost
- actual material cost
- actual equipment cost
- actual subcontract cost
- invoice amount

This can be a secondary page after the estimate page.

## Data operations

### Queries

- list visible presets from `contractor_presets`
- list preset items from `preset_wbs_items`
- list project summaries from `project_summary`
- load project rows from `project_estimate_items`
- load row calculations from `project_item_metrics`
- load / update tracking fields from `project_item_actuals`

### Mutations

- create org via `create_organization`
- create project via `create_project_from_preset`
- update `projects`
- update `project_estimate_items`
- update `project_item_actuals`

## Security / auth notes

- This backend already uses **RLS**
- Build the frontend around **authenticated users**
- Never use the **service role key** in WeWeb
- Use the **publishable / anon key** only

## Local development connection details

Current local endpoints:

- API URL: `http://127.0.0.1:54321`
- REST URL: `http://127.0.0.1:54321/rest/v1`
- GraphQL URL: `http://127.0.0.1:54321/graphql/v1`
- Studio URL: `http://127.0.0.1:54323`
- MCP URL: `http://127.0.0.1:54321/mcp`

If you need the current local Supabase publishable key, get it from:

```bash
npx --yes supabase@2.90.0 status -o env
```

Use `PUBLISHABLE_KEY` from that command output. Do **not** use `SERVICE_ROLE_KEY`.

## Supabase MCP notes

If your environment can use Supabase MCP:

- local MCP URL: `http://127.0.0.1:54321/mcp`
- hosted MCP docs say to scope access to a specific project and prefer read-only mode when possible
- do not use MCP against production data for this workflow

## What not to do

- do not invent a different data model
- do not replace the WBS/CBS structure with something overly abstract
- do not make the UI enterprise-heavy or overloaded
- do not skip the estimate table in favor of a wizard-only flow

## Build priority

Build in this order:

1. auth + organization bootstrap
2. dashboard / project list
3. create project from preset
4. project estimate detail screen
5. proposal summary
6. tracking page

## Final reminder

Anchor your decisions to the repo artifacts:

- `alex_meeting_transcript.txt`
- `724.jpg`
- `725.jpg`

The goal is a **simple contractor estimating app** whose first excellent workflow is:

**pick a preset -> create a project -> edit WBS estimate rows -> review totals -> generate/send proposal**
