insert into public.contractor_presets (
  scope,
  key,
  name,
  description
)
values
  (
    'system',
    'roofing_gutters_siding',
    'Roofing / Gutters / Siding',
    'Residential exterior preset with estimate-ready and active-tracking-ready WBS rows.'
  ),
  (
    'system',
    'general_contractor_buildout',
    'General Contractor / Buildout',
    'General contractor preset for coordination, demo, framing, finishes, and closeout work.'
  ),
  (
    'system',
    'electrician_service_upgrade',
    'Electrician / Service + TI',
    'Electrical preset for service upgrades, branch circuits, devices, lighting, and final trim.'
  ),
  (
    'system',
    'plumbing_fixture_finish',
    'Plumbing / Fixtures + Finish',
    'Plumbing preset for rough-in, fixture install, trim, and commissioning work.'
  ),
  (
    'system',
    'hvac_changeout_balance',
    'HVAC / Changeout + Balance',
    'HVAC preset for demo, equipment changeout, duct transitions, controls, startup, and balance.'
  )
on conflict ((lower(key))) where scope = 'system'
do update set
  name = excluded.name,
  description = excluded.description,
  updated_at = now();

insert into public.preset_wbs_items (
  preset_id,
  section_code,
  section_name,
  item_code,
  item_name,
  unit,
  sort_order,
  active_default,
  default_quantity,
  default_labor_hours,
  default_labor_rate,
  default_material_cost,
  default_equipment_days,
  default_equipment_rate,
  default_subcontract_cost,
  default_overhead_percent,
  default_profit_percent
)
select
  preset.id,
  data.section_code,
  data.section_name,
  data.item_code,
  data.item_name,
  data.unit,
  data.sort_order,
  data.active_default,
  data.default_quantity,
  data.default_labor_hours,
  data.default_labor_rate,
  data.default_material_cost,
  data.default_equipment_days,
  data.default_equipment_rate,
  data.default_subcontract_cost,
  data.default_overhead_percent,
  data.default_profit_percent
from public.contractor_presets preset
join (
  values
    ('roofing_gutters_siding', '1.1', 'Roof prep', '1.1.1', 'Tear off and disposal', 'SQ FT', 10, true, 1, 0, 0, 0, 0, 0, 0, 10, 10),
    ('roofing_gutters_siding', '1.1', 'Roof prep', '1.1.2', 'Deck sheeting repair', 'SQ FT', 20, true, 1, 0, 0, 0, 0, 0, 0, 10, 10),
    ('roofing_gutters_siding', '1.2', 'Roof install', '1.2.1', 'Ice and water shield', 'SQ FT', 30, true, 1, 0, 0, 0, 0, 0, 0, 10, 10),
    ('roofing_gutters_siding', '1.2', 'Roof install', '1.2.2', 'Synthetic underlayment', 'SQ FT', 40, true, 1, 0, 0, 0, 0, 0, 0, 10, 10),
    ('roofing_gutters_siding', '1.2', 'Roof install', '1.2.3', 'Architectural shingles', 'SQ FT', 50, true, 1, 0, 0, 0, 0, 0, 0, 10, 10),
    ('roofing_gutters_siding', '1.2', 'Roof install', '1.2.4', 'Ridge vent and cap', 'LF', 60, true, 1, 0, 0, 0, 0, 0, 0, 10, 10),
    ('roofing_gutters_siding', '1.2', 'Roof install', '1.2.5', 'Flashing and drip edge', 'LF', 70, true, 1, 0, 0, 0, 0, 0, 0, 10, 10),
    ('roofing_gutters_siding', '1.3', 'Exterior finishes', '1.3.1', 'Gutters and downspouts', 'LF', 80, true, 1, 0, 0, 0, 0, 0, 0, 10, 10),
    ('roofing_gutters_siding', '1.3', 'Exterior finishes', '1.3.2', 'Siding patch and replacement', 'SQ FT', 90, true, 1, 0, 0, 0, 0, 0, 0, 10, 10),

    ('general_contractor_buildout', '1.1', 'General conditions', '1.1.1', 'Permits and coordination', 'LS', 10, true, 1, 0, 0, 0, 0, 0, 0, 10, 10),
    ('general_contractor_buildout', '1.1', 'General conditions', '1.1.2', 'Site protection and temporary barriers', 'LS', 20, true, 1, 0, 0, 0, 0, 0, 0, 10, 10),
    ('general_contractor_buildout', '1.2', 'Selective demo', '1.2.1', 'Selective demolition', 'LS', 30, true, 1, 0, 0, 0, 0, 0, 0, 10, 10),
    ('general_contractor_buildout', '1.3', 'Carpentry', '1.3.1', 'Framing and backing', 'LS', 40, true, 1, 0, 0, 0, 0, 0, 0, 10, 10),
    ('general_contractor_buildout', '1.4', 'Wall finishes', '1.4.1', 'Drywall patch and finish', 'LS', 50, true, 1, 0, 0, 0, 0, 0, 0, 10, 10),
    ('general_contractor_buildout', '1.4', 'Wall finishes', '1.4.2', 'Paint and touch-up', 'LS', 60, true, 1, 0, 0, 0, 0, 0, 0, 10, 10),
    ('general_contractor_buildout', '1.5', 'Finish work', '1.5.1', 'Doors, trim, and hardware', 'LS', 70, true, 1, 0, 0, 0, 0, 0, 0, 10, 10),
    ('general_contractor_buildout', '1.6', 'Closeout', '1.6.1', 'Punch list and final cleanup', 'LS', 80, true, 1, 0, 0, 0, 0, 0, 0, 10, 10),

    ('electrician_service_upgrade', '1.1', 'Service', '1.1.1', 'Service upgrade and panel work', 'LS', 10, true, 1, 0, 0, 0, 0, 0, 0, 10, 10),
    ('electrician_service_upgrade', '1.2', 'Distribution', '1.2.1', 'Subfeed and homeruns', 'LS', 20, true, 1, 0, 0, 0, 0, 0, 0, 10, 10),
    ('electrician_service_upgrade', '1.2', 'Distribution', '1.2.2', 'Branch circuit rough-in', 'LS', 30, true, 1, 0, 0, 0, 0, 0, 0, 10, 10),
    ('electrician_service_upgrade', '1.3', 'Devices', '1.3.1', 'Switches and receptacles', 'EA', 40, true, 1, 0, 0, 0, 0, 0, 0, 10, 10),
    ('electrician_service_upgrade', '1.3', 'Devices', '1.3.2', 'Lighting fixtures and trims', 'EA', 50, true, 1, 0, 0, 0, 0, 0, 0, 10, 10),
    ('electrician_service_upgrade', '1.4', 'Low voltage', '1.4.1', 'Data, controls, and specialty wiring', 'LS', 60, false, 1, 0, 0, 0, 0, 0, 0, 10, 10),
    ('electrician_service_upgrade', '1.5', 'Startup', '1.5.1', 'Test, label, and commission', 'LS', 70, true, 1, 0, 0, 0, 0, 0, 0, 10, 10),

    ('plumbing_fixture_finish', '1.1', 'Prep', '1.1.1', 'Demo and cap existing lines', 'LS', 10, true, 1, 0, 0, 0, 0, 0, 0, 10, 10),
    ('plumbing_fixture_finish', '1.2', 'Rough-in', '1.2.1', 'Water line rough-in', 'LS', 20, true, 1, 0, 0, 0, 0, 0, 0, 10, 10),
    ('plumbing_fixture_finish', '1.2', 'Rough-in', '1.2.2', 'DWV and vent modifications', 'LS', 30, true, 1, 0, 0, 0, 0, 0, 0, 10, 10),
    ('plumbing_fixture_finish', '1.3', 'Fixtures', '1.3.1', 'Fixture set and trim', 'EA', 40, true, 1, 0, 0, 0, 0, 0, 0, 10, 10),
    ('plumbing_fixture_finish', '1.3', 'Fixtures', '1.3.2', 'Valve and accessory install', 'EA', 50, true, 1, 0, 0, 0, 0, 0, 0, 10, 10),
    ('plumbing_fixture_finish', '1.4', 'Equipment', '1.4.1', 'Water heater or specialty equipment', 'LS', 60, false, 1, 0, 0, 0, 0, 0, 0, 10, 10),
    ('plumbing_fixture_finish', '1.5', 'Closeout', '1.5.1', 'Test, flush, and commission', 'LS', 70, true, 1, 0, 0, 0, 0, 0, 0, 10, 10),

    ('hvac_changeout_balance', '1.1', 'Demo', '1.1.1', 'Remove existing equipment', 'LS', 10, true, 1, 0, 0, 0, 0, 0, 0, 10, 10),
    ('hvac_changeout_balance', '1.2', 'Equipment', '1.2.1', 'Set unit and platform or curb', 'LS', 20, true, 1, 0, 0, 0, 0, 0, 0, 10, 10),
    ('hvac_changeout_balance', '1.2', 'Equipment', '1.2.2', 'Line set, venting, and condensate', 'LS', 30, true, 1, 0, 0, 0, 0, 0, 0, 10, 10),
    ('hvac_changeout_balance', '1.3', 'Airside', '1.3.1', 'Duct transitions and accessories', 'LS', 40, true, 1, 0, 0, 0, 0, 0, 0, 10, 10),
    ('hvac_changeout_balance', '1.4', 'Controls', '1.4.1', 'Thermostat and controls', 'LS', 50, true, 1, 0, 0, 0, 0, 0, 0, 10, 10),
    ('hvac_changeout_balance', '1.5', 'Startup', '1.5.1', 'Startup and refrigerant charge', 'LS', 60, true, 1, 0, 0, 0, 0, 0, 0, 10, 10),
    ('hvac_changeout_balance', '1.5', 'Startup', '1.5.2', 'Air balance and owner handoff', 'LS', 70, true, 1, 0, 0, 0, 0, 0, 0, 10, 10)
) as data (
  preset_key,
  section_code,
  section_name,
  item_code,
  item_name,
  unit,
  sort_order,
  active_default,
  default_quantity,
  default_labor_hours,
  default_labor_rate,
  default_material_cost,
  default_equipment_days,
  default_equipment_rate,
  default_subcontract_cost,
  default_overhead_percent,
  default_profit_percent
)
  on lower(preset.key) = lower(data.preset_key)
where preset.scope = 'system'
on conflict (preset_id, item_code)
do update set
  section_code = excluded.section_code,
  section_name = excluded.section_name,
  item_name = excluded.item_name,
  unit = excluded.unit,
  sort_order = excluded.sort_order,
  active_default = excluded.active_default,
  default_quantity = excluded.default_quantity,
  default_labor_hours = excluded.default_labor_hours,
  default_labor_rate = excluded.default_labor_rate,
  default_material_cost = excluded.default_material_cost,
  default_equipment_days = excluded.default_equipment_days,
  default_equipment_rate = excluded.default_equipment_rate,
  default_subcontract_cost = excluded.default_subcontract_cost,
  default_overhead_percent = excluded.default_overhead_percent,
  default_profit_percent = excluded.default_profit_percent;
