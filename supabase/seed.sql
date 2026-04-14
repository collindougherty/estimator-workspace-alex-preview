with seeded_preset as (
  insert into public.contractor_presets (
    scope,
    key,
    name,
    description
  )
  values (
    'system',
    'roofing_gutters_siding',
    'Roofing / Gutters / Siding',
    'System preset seeded from the Alex meeting transcript and sketches. Estimate-first, with WBS rows crossed against labor, materials, equipment, subcontractors, overhead, and profit.'
  )
  on conflict ((lower(key))) where scope = 'system'
  do update set
    name = excluded.name,
    description = excluded.description,
    updated_at = now()
  returning id
)
insert into public.preset_wbs_items (
  preset_id,
  section_code,
  section_name,
  item_code,
  item_name,
  unit,
  sort_order,
  active_default,
  default_overhead_percent,
  default_profit_percent
)
select
  seeded_preset.id,
  data.section_code,
  data.section_name,
  data.item_code,
  data.item_name,
  data.unit,
  data.sort_order,
  data.active_default,
  data.default_overhead_percent,
  data.default_profit_percent
from seeded_preset
cross join (
  values
    ('1.1', 'Roof prep', '1.1.1', 'Tear off and disposal', 'sq ft', 10, true, 10, 10),
    ('1.1', 'Roof prep', '1.1.2', 'Deck sheeting repair', 'sq ft', 20, true, 10, 10),
    ('1.2', 'Roof install', '1.2.1', 'Ice and water shield', 'sq ft', 30, true, 10, 10),
    ('1.2', 'Roof install', '1.2.2', 'Synthetic underlayment', 'sq ft', 40, true, 10, 10),
    ('1.2', 'Roof install', '1.2.3', 'Architectural shingles', 'sq ft', 50, true, 10, 10),
    ('1.2', 'Roof install', '1.2.4', 'Ridge vent and cap', 'lf', 60, true, 10, 10),
    ('1.2', 'Roof install', '1.2.5', 'Flashing and drip edge', 'lf', 70, true, 10, 10),
    ('1.3', 'Exterior finishes', '1.3.1', 'Gutters and downspouts', 'lf', 80, true, 10, 10),
    ('1.3', 'Exterior finishes', '1.3.2', 'Siding patch and replacement', 'sq ft', 90, true, 10, 10)
) as data (
  section_code,
  section_name,
  item_code,
  item_name,
  unit,
  sort_order,
  active_default,
  default_overhead_percent,
  default_profit_percent
)
on conflict (preset_id, item_code)
do update set
  section_code = excluded.section_code,
  section_name = excluded.section_name,
  item_name = excluded.item_name,
  unit = excluded.unit,
  sort_order = excluded.sort_order,
  active_default = excluded.active_default,
  default_overhead_percent = excluded.default_overhead_percent,
  default_profit_percent = excluded.default_profit_percent;
