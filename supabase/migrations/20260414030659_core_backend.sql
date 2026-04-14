create extension if not exists pgcrypto with schema extensions;

create type public.organization_role as enum ('owner', 'admin', 'member');
create type public.project_status as enum (
  'draft',
  'bidding',
  'submitted',
  'won',
  'active',
  'completed',
  'lost',
  'archived'
);
create type public.preset_scope as enum ('system', 'organization');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_slug_not_blank check (slug <> '')
);

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.organization_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.contractor_presets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  scope public.preset_scope not null default 'organization',
  key text not null,
  name text not null,
  description text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contractor_presets_key_not_blank check (key <> ''),
  constraint contractor_presets_scope_match check (
    (scope = 'system' and organization_id is null)
    or (scope = 'organization' and organization_id is not null)
  )
);

create table public.preset_wbs_items (
  id uuid primary key default gen_random_uuid(),
  preset_id uuid not null references public.contractor_presets (id) on delete cascade,
  section_code text not null,
  section_name text not null,
  item_code text not null,
  item_name text not null,
  unit text not null,
  sort_order integer not null default 0,
  active_default boolean not null default true,
  default_quantity numeric not null default 0 check (default_quantity >= 0),
  default_labor_hours numeric not null default 0 check (default_labor_hours >= 0),
  default_labor_rate numeric not null default 0 check (default_labor_rate >= 0),
  default_material_cost numeric not null default 0 check (default_material_cost >= 0),
  default_equipment_days numeric not null default 0 check (default_equipment_days >= 0),
  default_equipment_rate numeric not null default 0 check (default_equipment_rate >= 0),
  default_subcontract_cost numeric not null default 0 check (default_subcontract_cost >= 0),
  default_overhead_percent numeric not null default 10 check (default_overhead_percent >= 0),
  default_profit_percent numeric not null default 10 check (default_profit_percent >= 0)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  preset_id uuid references public.contractor_presets (id) on delete set null,
  name text not null,
  customer_name text,
  location text,
  status public.project_status not null default 'bidding',
  bid_due_date date,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_estimate_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  preset_item_id uuid references public.preset_wbs_items (id) on delete set null,
  section_code text not null,
  section_name text not null,
  item_code text not null,
  item_name text not null,
  unit text not null,
  sort_order integer not null default 0,
  is_included boolean not null default true,
  quantity numeric not null default 0 check (quantity >= 0),
  labor_hours numeric not null default 0 check (labor_hours >= 0),
  labor_rate numeric not null default 0 check (labor_rate >= 0),
  material_cost numeric not null default 0 check (material_cost >= 0),
  equipment_days numeric not null default 0 check (equipment_days >= 0),
  equipment_rate numeric not null default 0 check (equipment_rate >= 0),
  subcontract_cost numeric not null default 0 check (subcontract_cost >= 0),
  overhead_percent numeric not null default 10 check (overhead_percent >= 0),
  profit_percent numeric not null default 10 check (profit_percent >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_item_actuals (
  project_estimate_item_id uuid primary key references public.project_estimate_items (id) on delete cascade,
  percent_complete numeric not null default 0 check (percent_complete >= 0 and percent_complete <= 100),
  actual_quantity numeric not null default 0 check (actual_quantity >= 0),
  actual_labor_hours numeric not null default 0 check (actual_labor_hours >= 0),
  actual_labor_cost numeric not null default 0 check (actual_labor_cost >= 0),
  actual_material_cost numeric not null default 0 check (actual_material_cost >= 0),
  actual_equipment_days numeric not null default 0 check (actual_equipment_days >= 0),
  actual_equipment_cost numeric not null default 0 check (actual_equipment_cost >= 0),
  actual_subcontract_cost numeric not null default 0 check (actual_subcontract_cost >= 0),
  actual_overhead_cost numeric not null default 0 check (actual_overhead_cost >= 0),
  actual_profit_amount numeric not null default 0 check (actual_profit_amount >= 0),
  planned_start_date date,
  planned_finish_date date,
  actual_start_date date,
  actual_finish_date date,
  invoice_percent_complete numeric not null default 0 check (invoice_percent_complete >= 0 and invoice_percent_complete <= 100),
  invoice_amount numeric not null default 0 check (invoice_amount >= 0),
  updated_at timestamptz not null default now()
);

create unique index organizations_slug_lower_idx
  on public.organizations (lower(slug));

create index organization_members_user_id_idx
  on public.organization_members (user_id);

create unique index contractor_presets_system_key_idx
  on public.contractor_presets (lower(key))
  where scope = 'system';

create unique index contractor_presets_org_key_idx
  on public.contractor_presets (organization_id, lower(key))
  where scope = 'organization';

create index contractor_presets_org_id_idx
  on public.contractor_presets (organization_id);

create unique index preset_wbs_items_preset_code_idx
  on public.preset_wbs_items (preset_id, item_code);

create index preset_wbs_items_preset_sort_idx
  on public.preset_wbs_items (preset_id, sort_order);

create index projects_org_status_idx
  on public.projects (organization_id, status);

create index projects_preset_id_idx
  on public.projects (preset_id);

create unique index project_estimate_items_project_code_idx
  on public.project_estimate_items (project_id, item_code);

create index project_estimate_items_project_sort_idx
  on public.project_estimate_items (project_id, sort_order);

create or replace function public.slugify(value text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(public.profiles.full_name, excluded.full_name),
      updated_at = now();

  return new;
end;
$$;

create or replace function public.is_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members organization_member
    where organization_member.organization_id = target_organization_id
      and organization_member.user_id = auth.uid()
  );
$$;

create or replace function public.is_org_admin(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members organization_member
    where organization_member.organization_id = target_organization_id
      and organization_member.user_id = auth.uid()
      and organization_member.role in ('owner', 'admin')
  );
$$;

create or replace function public.create_organization(p_name text, p_slug text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_organization_id uuid;
  normalized_slug text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  normalized_slug := coalesce(nullif(p_slug, ''), public.slugify(p_name));

  if normalized_slug is null or normalized_slug = '' then
    raise exception 'A valid organization slug is required';
  end if;

  insert into public.organizations (name, slug, created_by)
  values (p_name, normalized_slug, auth.uid())
  returning id into new_organization_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (new_organization_id, auth.uid(), 'owner');

  return new_organization_id;
end;
$$;

create or replace function public.create_project_from_preset(
  p_organization_id uuid,
  p_preset_id uuid,
  p_name text,
  p_customer_name text default null,
  p_location text default null,
  p_bid_due_date date default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_project_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_org_member(p_organization_id) then
    raise exception 'You are not a member of this organization';
  end if;

  if not exists (
    select 1
    from public.contractor_presets contractor_preset
    where contractor_preset.id = p_preset_id
      and (
        contractor_preset.scope = 'system'
        or contractor_preset.organization_id = p_organization_id
      )
  ) then
    raise exception 'Preset is not visible to this organization';
  end if;

  insert into public.projects (
    organization_id,
    preset_id,
    name,
    customer_name,
    location,
    status,
    bid_due_date,
    notes,
    created_by
  )
  values (
    p_organization_id,
    p_preset_id,
    p_name,
    p_customer_name,
    p_location,
    'bidding',
    p_bid_due_date,
    p_notes,
    auth.uid()
  )
  returning id into new_project_id;

  with cloned_rows as (
    insert into public.project_estimate_items (
      project_id,
      preset_item_id,
      section_code,
      section_name,
      item_code,
      item_name,
      unit,
      sort_order,
      is_included,
      quantity,
      labor_hours,
      labor_rate,
      material_cost,
      equipment_days,
      equipment_rate,
      subcontract_cost,
      overhead_percent,
      profit_percent
    )
    select
      new_project_id,
      preset_wbs_item.id,
      preset_wbs_item.section_code,
      preset_wbs_item.section_name,
      preset_wbs_item.item_code,
      preset_wbs_item.item_name,
      preset_wbs_item.unit,
      preset_wbs_item.sort_order,
      preset_wbs_item.active_default,
      preset_wbs_item.default_quantity,
      preset_wbs_item.default_labor_hours,
      preset_wbs_item.default_labor_rate,
      preset_wbs_item.default_material_cost,
      preset_wbs_item.default_equipment_days,
      preset_wbs_item.default_equipment_rate,
      preset_wbs_item.default_subcontract_cost,
      preset_wbs_item.default_overhead_percent,
      preset_wbs_item.default_profit_percent
    from public.preset_wbs_items preset_wbs_item
    where preset_wbs_item.preset_id = p_preset_id
    order by preset_wbs_item.sort_order
    returning id
  )
  insert into public.project_item_actuals (project_estimate_item_id)
  select cloned_rows.id
  from cloned_rows;

  return new_project_id;
end;
$$;

create or replace view public.project_item_metrics
with (security_invoker = true)
as
select
  calculated.project_estimate_item_id,
  calculated.project_id,
  calculated.section_code,
  calculated.section_name,
  calculated.item_code,
  calculated.item_name,
  calculated.unit,
  calculated.sort_order,
  calculated.is_included,
  calculated.quantity,
  calculated.labor_hours,
  calculated.labor_rate,
  calculated.material_cost,
  calculated.equipment_days,
  calculated.equipment_rate,
  calculated.subcontract_cost,
  calculated.overhead_percent,
  calculated.profit_percent,
  calculated.estimated_labor_cost,
  calculated.estimated_equipment_cost,
  calculated.estimated_direct_cost,
  calculated.estimated_overhead_cost,
  calculated.estimated_profit_cost,
  calculated.estimated_total_cost,
  calculated.percent_complete,
  calculated.actual_quantity,
  calculated.actual_labor_hours,
  calculated.actual_labor_cost,
  calculated.actual_material_cost,
  calculated.actual_equipment_days,
  calculated.actual_equipment_cost,
  calculated.actual_subcontract_cost,
  calculated.actual_overhead_cost,
  calculated.actual_profit_amount,
  calculated.actual_direct_cost,
  calculated.actual_total_cost,
  calculated.planned_start_date,
  calculated.planned_finish_date,
  calculated.actual_start_date,
  calculated.actual_finish_date,
  calculated.invoice_percent_complete,
  calculated.invoice_amount,
  calculated.estimated_total_cost * (calculated.percent_complete / 100.0) as earned_value_amount,
  (calculated.estimated_total_cost * (calculated.percent_complete / 100.0)) - calculated.actual_total_cost as cost_variance,
  calculated.actual_labor_hours - calculated.labor_hours as labor_hour_variance
from (
  select
    project_estimate_item.id as project_estimate_item_id,
    project_estimate_item.project_id,
    project_estimate_item.section_code,
    project_estimate_item.section_name,
    project_estimate_item.item_code,
    project_estimate_item.item_name,
    project_estimate_item.unit,
    project_estimate_item.sort_order,
    project_estimate_item.is_included,
    project_estimate_item.quantity,
    project_estimate_item.labor_hours,
    project_estimate_item.labor_rate,
    project_estimate_item.material_cost,
    project_estimate_item.equipment_days,
    project_estimate_item.equipment_rate,
    project_estimate_item.subcontract_cost,
    project_estimate_item.overhead_percent,
    project_estimate_item.profit_percent,
    project_item_actual.percent_complete,
    project_item_actual.actual_quantity,
    project_item_actual.actual_labor_hours,
    project_item_actual.actual_labor_cost,
    project_item_actual.actual_material_cost,
    project_item_actual.actual_equipment_days,
    project_item_actual.actual_equipment_cost,
    project_item_actual.actual_subcontract_cost,
    project_item_actual.actual_overhead_cost,
    project_item_actual.actual_profit_amount,
    project_item_actual.planned_start_date,
    project_item_actual.planned_finish_date,
    project_item_actual.actual_start_date,
    project_item_actual.actual_finish_date,
    project_item_actual.invoice_percent_complete,
    project_item_actual.invoice_amount,
    (project_estimate_item.labor_hours * project_estimate_item.labor_rate) as estimated_labor_cost,
    (project_estimate_item.equipment_days * project_estimate_item.equipment_rate) as estimated_equipment_cost,
    (
      (project_estimate_item.labor_hours * project_estimate_item.labor_rate)
      + project_estimate_item.material_cost
      + (project_estimate_item.equipment_days * project_estimate_item.equipment_rate)
      + project_estimate_item.subcontract_cost
    ) as estimated_direct_cost,
    (
      (
        (project_estimate_item.labor_hours * project_estimate_item.labor_rate)
        + project_estimate_item.material_cost
        + (project_estimate_item.equipment_days * project_estimate_item.equipment_rate)
        + project_estimate_item.subcontract_cost
      ) * (project_estimate_item.overhead_percent / 100.0)
    ) as estimated_overhead_cost,
    (
      (
        (project_estimate_item.labor_hours * project_estimate_item.labor_rate)
        + project_estimate_item.material_cost
        + (project_estimate_item.equipment_days * project_estimate_item.equipment_rate)
        + project_estimate_item.subcontract_cost
      ) * (project_estimate_item.profit_percent / 100.0)
    ) as estimated_profit_cost,
    (
      (
        (project_estimate_item.labor_hours * project_estimate_item.labor_rate)
        + project_estimate_item.material_cost
        + (project_estimate_item.equipment_days * project_estimate_item.equipment_rate)
        + project_estimate_item.subcontract_cost
      )
      + (
        (
          (project_estimate_item.labor_hours * project_estimate_item.labor_rate)
          + project_estimate_item.material_cost
          + (project_estimate_item.equipment_days * project_estimate_item.equipment_rate)
          + project_estimate_item.subcontract_cost
        ) * (project_estimate_item.overhead_percent / 100.0)
      )
      + (
        (
          (project_estimate_item.labor_hours * project_estimate_item.labor_rate)
          + project_estimate_item.material_cost
          + (project_estimate_item.equipment_days * project_estimate_item.equipment_rate)
          + project_estimate_item.subcontract_cost
        ) * (project_estimate_item.profit_percent / 100.0)
      )
    ) as estimated_total_cost,
    (
      project_item_actual.actual_labor_cost
      + project_item_actual.actual_material_cost
      + project_item_actual.actual_equipment_cost
      + project_item_actual.actual_subcontract_cost
    ) as actual_direct_cost,
    (
      project_item_actual.actual_labor_cost
      + project_item_actual.actual_material_cost
      + project_item_actual.actual_equipment_cost
      + project_item_actual.actual_subcontract_cost
      + project_item_actual.actual_overhead_cost
      + project_item_actual.actual_profit_amount
    ) as actual_total_cost
  from public.project_estimate_items project_estimate_item
  left join public.project_item_actuals project_item_actual
    on project_item_actual.project_estimate_item_id = project_estimate_item.id
) as calculated;

create or replace view public.project_summary
with (security_invoker = true)
as
select
  project.id as project_id,
  project.organization_id,
  project.preset_id,
  project.name,
  project.customer_name,
  project.location,
  project.status,
  project.bid_due_date,
  project.notes,
  project.created_by,
  project.created_at,
  project.updated_at,
  count(project_item_metric.project_estimate_item_id) filter (where project_item_metric.is_included) as included_item_count,
  coalesce(sum(project_item_metric.estimated_direct_cost) filter (where project_item_metric.is_included), 0) as estimated_direct_cost,
  coalesce(sum(project_item_metric.estimated_overhead_cost) filter (where project_item_metric.is_included), 0) as estimated_overhead_cost,
  coalesce(sum(project_item_metric.estimated_profit_cost) filter (where project_item_metric.is_included), 0) as estimated_profit_cost,
  coalesce(sum(project_item_metric.estimated_total_cost) filter (where project_item_metric.is_included), 0) as estimated_total_cost,
  coalesce(sum(project_item_metric.actual_total_cost) filter (where project_item_metric.is_included), 0) as actual_total_cost,
  coalesce(sum(project_item_metric.earned_value_amount) filter (where project_item_metric.is_included), 0) as earned_value_amount,
  coalesce(sum(project_item_metric.invoice_amount) filter (where project_item_metric.is_included), 0) as invoice_amount,
  coalesce(sum(project_item_metric.labor_hours) filter (where project_item_metric.is_included), 0) as estimated_labor_hours,
  coalesce(sum(project_item_metric.actual_labor_hours) filter (where project_item_metric.is_included), 0) as actual_labor_hours
from public.projects project
left join public.project_item_metrics project_item_metric
  on project_item_metric.project_id = project.id
group by
  project.id,
  project.organization_id,
  project.preset_id,
  project.name,
  project.customer_name,
  project.location,
  project.status,
  project.bid_due_date,
  project.notes,
  project.created_by,
  project.created_at,
  project.updated_at;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.touch_updated_at();

create trigger set_organizations_updated_at
  before update on public.organizations
  for each row execute procedure public.touch_updated_at();

create trigger set_contractor_presets_updated_at
  before update on public.contractor_presets
  for each row execute procedure public.touch_updated_at();

create trigger set_projects_updated_at
  before update on public.projects
  for each row execute procedure public.touch_updated_at();

create trigger set_project_estimate_items_updated_at
  before update on public.project_estimate_items
  for each row execute procedure public.touch_updated_at();

create trigger set_project_item_actuals_updated_at
  before update on public.project_item_actuals
  for each row execute procedure public.touch_updated_at();

insert into public.profiles (id, email, full_name)
select
  auth_user.id,
  auth_user.email,
  coalesce(auth_user.raw_user_meta_data ->> 'full_name', split_part(coalesce(auth_user.email, ''), '@', 1))
from auth.users auth_user
on conflict (id) do update
set email = excluded.email,
    updated_at = now();

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.contractor_presets enable row level security;
alter table public.preset_wbs_items enable row level security;
alter table public.projects enable row level security;
alter table public.project_estimate_items enable row level security;
alter table public.project_item_actuals enable row level security;

create policy profiles_select_self
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

create policy profiles_update_self
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy organizations_select_member
  on public.organizations
  for select
  to authenticated
  using (public.is_org_member(id));

create policy organizations_update_admin
  on public.organizations
  for update
  to authenticated
  using (public.is_org_admin(id))
  with check (public.is_org_admin(id));

create policy organizations_delete_admin
  on public.organizations
  for delete
  to authenticated
  using (public.is_org_admin(id));

create policy organization_members_select_member
  on public.organization_members
  for select
  to authenticated
  using (public.is_org_member(organization_id));

create policy organization_members_insert_admin
  on public.organization_members
  for insert
  to authenticated
  with check (public.is_org_admin(organization_id));

create policy organization_members_update_admin
  on public.organization_members
  for update
  to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

create policy organization_members_delete_admin
  on public.organization_members
  for delete
  to authenticated
  using (public.is_org_admin(organization_id));

create policy contractor_presets_select_visible
  on public.contractor_presets
  for select
  to authenticated
  using (
    scope = 'system'
    or public.is_org_member(organization_id)
  );

create policy contractor_presets_insert_admin
  on public.contractor_presets
  for insert
  to authenticated
  with check (
    scope = 'organization'
    and public.is_org_admin(organization_id)
  );

create policy contractor_presets_update_admin
  on public.contractor_presets
  for update
  to authenticated
  using (
    scope = 'organization'
    and public.is_org_admin(organization_id)
  )
  with check (
    scope = 'organization'
    and public.is_org_admin(organization_id)
  );

create policy contractor_presets_delete_admin
  on public.contractor_presets
  for delete
  to authenticated
  using (
    scope = 'organization'
    and public.is_org_admin(organization_id)
  );

create policy preset_wbs_items_select_visible
  on public.preset_wbs_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.contractor_presets contractor_preset
      where contractor_preset.id = preset_id
        and (
          contractor_preset.scope = 'system'
          or public.is_org_member(contractor_preset.organization_id)
        )
    )
  );

create policy preset_wbs_items_insert_admin
  on public.preset_wbs_items
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.contractor_presets contractor_preset
      where contractor_preset.id = preset_id
        and contractor_preset.scope = 'organization'
        and public.is_org_admin(contractor_preset.organization_id)
    )
  );

create policy preset_wbs_items_update_admin
  on public.preset_wbs_items
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.contractor_presets contractor_preset
      where contractor_preset.id = preset_id
        and contractor_preset.scope = 'organization'
        and public.is_org_admin(contractor_preset.organization_id)
    )
  )
  with check (
    exists (
      select 1
      from public.contractor_presets contractor_preset
      where contractor_preset.id = preset_id
        and contractor_preset.scope = 'organization'
        and public.is_org_admin(contractor_preset.organization_id)
    )
  );

create policy preset_wbs_items_delete_admin
  on public.preset_wbs_items
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.contractor_presets contractor_preset
      where contractor_preset.id = preset_id
        and contractor_preset.scope = 'organization'
        and public.is_org_admin(contractor_preset.organization_id)
    )
  );

create policy projects_select_member
  on public.projects
  for select
  to authenticated
  using (public.is_org_member(organization_id));

create policy projects_insert_member
  on public.projects
  for insert
  to authenticated
  with check (
    public.is_org_member(organization_id)
    and auth.uid() = created_by
  );

create policy projects_update_member
  on public.projects
  for update
  to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy projects_delete_admin
  on public.projects
  for delete
  to authenticated
  using (public.is_org_admin(organization_id));

create policy project_estimate_items_select_member
  on public.project_estimate_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.projects project
      where project.id = project_id
        and public.is_org_member(project.organization_id)
    )
  );

create policy project_estimate_items_insert_member
  on public.project_estimate_items
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.projects project
      where project.id = project_id
        and public.is_org_member(project.organization_id)
    )
  );

create policy project_estimate_items_update_member
  on public.project_estimate_items
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.projects project
      where project.id = project_id
        and public.is_org_member(project.organization_id)
    )
  )
  with check (
    exists (
      select 1
      from public.projects project
      where project.id = project_id
        and public.is_org_member(project.organization_id)
    )
  );

create policy project_estimate_items_delete_member
  on public.project_estimate_items
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.projects project
      where project.id = project_id
        and public.is_org_member(project.organization_id)
    )
  );

create policy project_item_actuals_select_member
  on public.project_item_actuals
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.project_estimate_items project_estimate_item
      join public.projects project
        on project.id = project_estimate_item.project_id
      where project_estimate_item.id = project_estimate_item_id
        and public.is_org_member(project.organization_id)
    )
  );

create policy project_item_actuals_insert_member
  on public.project_item_actuals
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.project_estimate_items project_estimate_item
      join public.projects project
        on project.id = project_estimate_item.project_id
      where project_estimate_item.id = project_estimate_item_id
        and public.is_org_member(project.organization_id)
    )
  );

create policy project_item_actuals_update_member
  on public.project_item_actuals
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.project_estimate_items project_estimate_item
      join public.projects project
        on project.id = project_estimate_item.project_id
      where project_estimate_item.id = project_estimate_item_id
        and public.is_org_member(project.organization_id)
    )
  )
  with check (
    exists (
      select 1
      from public.project_estimate_items project_estimate_item
      join public.projects project
        on project.id = project_estimate_item.project_id
      where project_estimate_item.id = project_estimate_item_id
        and public.is_org_member(project.organization_id)
    )
  );

create policy project_item_actuals_delete_member
  on public.project_item_actuals
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.project_estimate_items project_estimate_item
      join public.projects project
        on project.id = project_estimate_item.project_id
      where project_estimate_item.id = project_estimate_item_id
        and public.is_org_member(project.organization_id)
    )
  );

grant select, update on public.profiles to authenticated;
grant select, update, delete on public.organizations to authenticated;
grant select, insert, update, delete on public.organization_members to authenticated;
grant select, insert, update, delete on public.contractor_presets to authenticated;
grant select, insert, update, delete on public.preset_wbs_items to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.project_estimate_items to authenticated;
grant select, insert, update, delete on public.project_item_actuals to authenticated;
grant select on public.project_item_metrics to authenticated;
grant select on public.project_summary to authenticated;
grant execute on function public.create_organization(text, text) to authenticated;
grant execute on function public.create_project_from_preset(uuid, uuid, text, text, text, date, text) to authenticated;
