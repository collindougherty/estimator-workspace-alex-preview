import { devices, expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, readFileSync } from 'node:fs'

import type { Database } from '../src/lib/database.types'

const readLocalEnv = () => {
  const content = readFileSync('.env.local', 'utf8')
  const values = new Map<string, string>()

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()

    if (!line || line.startsWith('#')) {
      continue
    }

    const equalsIndex = line.indexOf('=')

    if (equalsIndex === -1) {
      continue
    }

    const key = line.slice(0, equalsIndex).trim()
    const value = line.slice(equalsIndex + 1).trim()
    values.set(key, value)
  }

  return {
    demoEmail: values.get('VITE_DEMO_EMAIL') ?? '',
    demoPassword: values.get('VITE_DEMO_PASSWORD') ?? '',
    supabasePublishableKey: values.get('VITE_SUPABASE_PUBLISHABLE_KEY') ?? '',
    supabaseUrl: values.get('VITE_SUPABASE_URL') ?? '',
  }
}

const { demoEmail, demoPassword, supabasePublishableKey, supabaseUrl } = readLocalEnv()
const iPhone13 = devices['iPhone 13']
const formatUsd = (value: number) =>
  new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(value)
const parseUsd = (value: string) => Number(value.replace(/[^0-9.-]/g, ''))
const compactUsd = (value: number) => formatUsd(value).replace('.00', '')

type ProjectActualSnapshot = Pick<
  Database['public']['Tables']['project_item_actuals']['Row'],
  | 'actual_equipment_breakdown'
  | 'actual_equipment_cost'
  | 'actual_equipment_days'
  | 'actual_labor_breakdown'
  | 'actual_labor_cost'
  | 'actual_labor_hours'
  | 'actual_material_breakdown'
  | 'actual_material_cost'
  | 'actual_overhead_cost'
  | 'actual_profit_amount'
  | 'actual_subcontract_cost'
  | 'invoice_amount'
  | 'percent_complete'
  | 'project_estimate_item_id'
>

const createTestSupabaseClient = () =>
  createClient<Database>(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

const captureProjectActuals = async (projectName: string) => {
  const client = createTestSupabaseClient()
  const {
    data: authData,
    error: authError,
  } = await client.auth.signInWithPassword({
    email: demoEmail,
    password: demoPassword,
  })

  if (authError || !authData.session) {
    throw new Error(authError?.message ?? 'Unable to authenticate test client')
  }

  const { data: project, error: projectError } = await client
    .from('project_summary')
    .select('project_id')
    .eq('name', projectName)
    .single()

  if (projectError || !project) {
    throw new Error(projectError?.message ?? `Unable to load ${projectName}`)
  }

  const { data: projectItems, error: projectItemsError } = await client
    .from('project_item_metrics')
    .select('project_estimate_item_id')
    .eq('project_id', project.project_id)

  if (projectItemsError) {
    throw new Error(projectItemsError.message)
  }

  const { data, error } = await client
    .from('project_item_actuals')
    .select(
      'project_estimate_item_id, actual_equipment_breakdown, actual_equipment_cost, actual_equipment_days, actual_labor_breakdown, actual_labor_cost, actual_labor_hours, actual_material_breakdown, actual_material_cost, actual_overhead_cost, actual_profit_amount, actual_subcontract_cost, invoice_amount, percent_complete',
    )
    .in(
      'project_estimate_item_id',
      projectItems
        ?.map((item) => item.project_estimate_item_id)
        .filter((item): item is string => Boolean(item)) ?? [],
    )

  await client.auth.signOut()

  if (error) {
    throw new Error(error.message)
  }

  return data ?? []
}

const restoreProjectActuals = async (snapshot: ProjectActualSnapshot[]) => {
  const client = createTestSupabaseClient()
  const {
    data: authData,
    error: authError,
  } = await client.auth.signInWithPassword({
    email: demoEmail,
    password: demoPassword,
  })

  if (authError || !authData.session) {
    throw new Error(authError?.message ?? 'Unable to authenticate test client')
  }

  await Promise.all(
    snapshot.map(({ project_estimate_item_id, ...patch }) =>
      client.from('project_item_actuals').update(patch).eq('project_estimate_item_id', project_estimate_item_id),
    ),
  )

  await client.auth.signOut()
}

const signInDemoUser = async (page: Page) => {
  await page.goto('/login')
  await expect(page.getByText('ProfitBuilder')).toBeVisible()
  await page.getByLabel('Email').fill(demoEmail)
  await page.getByLabel('Password').fill(demoPassword)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'ProfitBuilder' })).toBeVisible()
}

const setTrackingPreference = async (page: Page, preference: 'Project totals' | 'Task / WBS breakdown') => {
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await page.getByLabel(preference).check()
}

const openTrackingBucket = async (page: Page, bucket: 'Equipment' | 'Labor') => {
  await page.getByRole('button', { name: new RegExp(`Tear off and disposal ${bucket}`, 'i') }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: `${bucket} actuals` })).toBeVisible()
  return dialog
}

const tearOffTrackingRow = (page: Page) =>
  page.locator('.tracking-table tbody tr').filter({ hasText: 'Tear off and disposal' }).first()

test('dashboard, tracking table, and two-page bid builder render cleanly', async ({ page }) => {
  mkdirSync('artifacts/iteration-11-builder-layout', { recursive: true })

  await signInDemoUser(page)

  await expect(page.getByRole('heading', { name: 'ProfitBuilder' })).toBeVisible()
  await expect(page.locator('.app-brand-mark')).toBeVisible()
  await expect(page.getByText('ProfitBuilder')).toBeVisible()
  await expect(page.getByRole('link', { name: /Pine Court Storm Repair/i })).toBeVisible()
  await page.screenshot({
    path: 'artifacts/iteration-11-builder-layout/dashboard.png',
    fullPage: true,
  })

  await page.getByRole('link', { name: /Pine Court Storm Repair/i }).click()
  await expect(page.getByRole('heading', { name: 'Pine Court Storm Repair' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Terminal items' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Quick update' })).toBeVisible()
  await expect(page.locator('.tracking-table')).toBeVisible()
  await page.screenshot({
    path: 'artifacts/iteration-11-builder-layout/project-tracking-list.png',
    fullPage: true,
  })

  const trackingRow = tearOffTrackingRow(page)
  const equipmentActualsDialog = await openTrackingBucket(page, 'Equipment')
  const equipmentDaysField = equipmentActualsDialog.getByLabel('Days')
  const originalEquipmentDays = await equipmentDaysField.inputValue()
  const updatedEquipmentDays = String(Number(originalEquipmentDays || '0') + 0.5)

  await equipmentDaysField.fill(updatedEquipmentDays)
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(trackingRow.locator('.row-save-state')).toHaveText('Synced')

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Pine Court Storm Repair' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Terminal items' })).toBeVisible()

  const reloadedEquipmentDialog = await openTrackingBucket(page, 'Equipment')
  await expect(reloadedEquipmentDialog.getByLabel('Days')).toHaveValue(updatedEquipmentDays)
  await reloadedEquipmentDialog.getByLabel('Days').fill(originalEquipmentDays)
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(tearOffTrackingRow(page).locator('.row-save-state')).toHaveText('Synced')

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Pine Court Storm Repair' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Terminal items' })).toBeVisible()

  await page.getByRole('button', { name: /Labor/i }).first().click()
  const laborActualsDialog = page.getByRole('dialog')
  await expect(laborActualsDialog.getByRole('heading', { name: 'Labor actuals' })).toBeVisible()
  await laborActualsDialog.screenshot({
    path: 'artifacts/iteration-11-builder-layout/tracking-labor-actuals.png',
  })
  await page.getByRole('button', { name: 'Close' }).click()

  await page.getByRole('button', { name: /O\/H \+ profit/i }).first().click()
  const markupActualsDialog = page.getByRole('dialog')
  await expect(markupActualsDialog.getByRole('heading', { name: 'Overhead actuals' })).toBeVisible()
  await expect(markupActualsDialog.getByText('Tracked on the project summary, not typed here')).toBeVisible()
  await markupActualsDialog.screenshot({
    path: 'artifacts/iteration-11-builder-layout/tracking-markup-actuals.png',
  })
  await page.getByRole('button', { name: 'Close' }).click()

  await page.getByRole('link', { name: /Back/i }).click()
  await expect(page.getByRole('link', { name: /Maple Street Roof Replacement/i })).toBeVisible()
  await page.getByRole('link', { name: /Maple Street Roof Replacement/i }).click()
  await expect(page.getByRole('heading', { name: 'Maple Street Roof Replacement' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Bid builder' })).toBeVisible()
  await expect(page.locator('.project-builder-table')).toBeVisible()
  await expect(page.getByRole('button', { name: 'New section' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Materials/i }).first()).toBeVisible()
  await page.screenshot({
    path: 'artifacts/iteration-11-builder-layout/project-bid-builder.png',
    fullPage: true,
  })

  await page.getByRole('button', { name: 'New section' }).click()
  const scopeCreator = page.locator('.scope-picker-popover').first()
  await expect(scopeCreator.getByRole('heading', { name: 'New section' })).toBeVisible()
  await scopeCreator.screenshot({
    path: 'artifacts/iteration-11-builder-layout/scope-creator.png',
  })
  await scopeCreator.getByRole('button', { name: 'Cancel' }).click()
  const firstScopeInput = page.locator('.project-builder-table').getByLabel('1.1.1 scope name')
  await firstScopeInput.scrollIntoViewIfNeeded()
  const firstScopeRow = firstScopeInput.locator('xpath=ancestor::tr[1]')
  await firstScopeRow.getByRole('button', { name: /^Delete$/ }).click()
  const deleteScopeDialog = page.getByRole('dialog')
  await expect(deleteScopeDialog.getByRole('heading', { name: 'Delete scope?' })).toBeVisible()
  await deleteScopeDialog.getByRole('button', { name: 'Keep scope' }).click()
  await expect(deleteScopeDialog).toHaveCount(0)

  await page.getByRole('button', { name: /Materials/i }).first().click()
  const materialsDialog = page.getByRole('dialog')
  await expect(materialsDialog.getByRole('heading', { name: 'Materials editor' })).toBeVisible()
  await expect(materialsDialog.getByRole('searchbox')).toBeVisible()
  await materialsDialog.screenshot({
    path: 'artifacts/iteration-11-builder-layout/materials-picker.png',
  })
  await page.getByRole('button', { name: 'Close' }).click()

  await page.getByRole('button', { name: 'Company library' }).click()
  const libraryDialog = page.getByRole('dialog')
  await expect(libraryDialog.getByRole('heading', { name: 'Company library' })).toBeVisible()
  await expect(libraryDialog.getByRole('tab', { name: /Labor/i })).toBeVisible()
  await expect(libraryDialog.getByRole('tab', { name: /Equipment/i })).toBeVisible()
  await expect(libraryDialog.getByRole('tab', { name: /Materials/i })).toBeVisible()
  await libraryDialog.screenshot({
    path: 'artifacts/iteration-11-builder-layout/company-library.png',
  })
  await page.getByRole('button', { name: 'Close' }).click()

  await page.getByRole('link', { name: /Back/i }).click()
  await expect(page.getByRole('heading', { name: 'ProfitBuilder' })).toBeVisible()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByText('ProfitBuilder')).toBeVisible()
})

test('settings can default active jobs to project totals first', async ({ page }) => {
  const originalActuals = await captureProjectActuals('Pine Court Storm Repair')

  try {
  await signInDemoUser(page)
  await setTrackingPreference(page, 'Project totals')

  await page.goto('/')
  await expect(page.getByRole('link', { name: /Pine Court Storm Repair/i })).toBeVisible()
  await page.getByRole('link', { name: /Pine Court Storm Repair/i }).click()
  await expect(page.getByRole('heading', { name: 'Project tracking' })).toBeVisible()
  await expect(page.locator('.project-tracking-preference-banner strong')).toHaveText('Project totals first')
  const totalsTracker = page.locator('.project-totals-tracker')
  await expect(totalsTracker).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Quick update' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Show task / WBS breakdown' })).toBeVisible()
  const currentActualTotal = totalsTracker
    .locator('.project-quick-update-summary .item-detail-readout')
    .first()
    .locator('strong')
  const afterSavePreview = totalsTracker.locator('.item-detail-section-heading strong')
  const laborCostField = totalsTracker.getByLabel('Add labor cost')
  const otherCostField = totalsTracker.getByLabel('Add materials / equipment cost')
  await laborCostField.fill('25')
  await otherCostField.fill('40')
  const expectedAfterSaveTotal = compactUsd(parseUsd(await afterSavePreview.textContent()))
  const saveQuickUpdateButton = totalsTracker.getByRole('button', { name: 'Add costs to project' })
  await expect(saveQuickUpdateButton).toBeEnabled()
  await saveQuickUpdateButton.click()
  await expect(currentActualTotal).toHaveText(expectedAfterSaveTotal)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Project tracking' })).toBeVisible()
  await expect(totalsTracker.getByLabel('Add labor cost')).toHaveValue('')
  await expect(totalsTracker.getByLabel('Add materials / equipment cost')).toHaveValue('')
  await expect(currentActualTotal).toHaveText(expectedAfterSaveTotal)
  await expect(page.locator('.tracking-table')).toHaveCount(0)

  await page.getByRole('button', { name: 'Show task / WBS breakdown' }).click()
  await expect(page.locator('.tracking-table')).toBeVisible()
  } finally {
    await restoreProjectActuals(originalActuals)
  }
})

test.describe('iphone layout', () => {
  test.use({
    viewport: iPhone13.viewport,
    userAgent: iPhone13.userAgent,
    deviceScaleFactor: iPhone13.deviceScaleFactor,
    isMobile: iPhone13.isMobile,
    hasTouch: iPhone13.hasTouch,
  })

  test('mobile bid builder sheets render cleanly', async ({ page }) => {
    mkdirSync('artifacts/iteration-11-builder-layout-mobile', { recursive: true })

    await signInDemoUser(page)
    await setTrackingPreference(page, 'Project totals')
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'ProfitBuilder' })).toBeVisible()
    await expect(page.locator('.app-brand-mark')).toBeVisible()
    await expect(page.locator('.dashboard-mobile-list').first()).toBeVisible()
    await expect(page.locator('.dashboard-mobile-card-summary').first()).toBeVisible()
    const activeCard = page.locator('.dashboard-mobile-card').filter({ hasText: 'Pine Court Storm Repair' })
    await activeCard.locator('summary').click()
    await expect(activeCard.locator('.dashboard-mobile-active-tracking')).toBeVisible()
    await expect(activeCard.locator('.dashboard-mobile-active-tracking')).toContainText('Budget')
    await expect(activeCard.locator('.dashboard-mobile-active-tracking')).toContainText('Actual')
    await expect(activeCard.locator('.dashboard-mobile-active-tracking')).toContainText('Spent')
    await page.screenshot({
      path: 'artifacts/iteration-11-builder-layout-mobile/dashboard-iphone13.png',
      fullPage: true,
    })

    await activeCard.getByRole('link', { name: 'Open project' }).click()
    await expect(page.getByRole('heading', { name: 'Pine Court Storm Repair' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Project tracking' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Quick update' })).toBeVisible()
    await expect(page.getByText('Quick add view')).toBeVisible()
    await expect(page.locator('.tracking-mobile-quick-card')).toHaveCount(2)
    await expect(page.locator('.tracking-mobile-scope-details')).toContainText('Show WBS details')
    await expect(page.locator('.tracking-table')).toHaveCount(0)
    await page.screenshot({
      path: 'artifacts/iteration-11-builder-layout-mobile/project-tracking-iphone13.png',
      fullPage: true,
    })

    await page.getByRole('link', { name: /Back/i }).click()
    await expect(page.getByRole('heading', { name: 'ProfitBuilder' })).toBeVisible()

    const bidCard = page.locator('.dashboard-mobile-card').filter({ hasText: 'Maple Street Roof Replacement' })
    await bidCard.locator('summary').click()
    await bidCard.getByRole('link', { name: 'Open project' }).click()
    await expect(page.getByRole('heading', { name: 'Maple Street Roof Replacement' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Bid builder' })).toBeVisible()
    await expect(page.locator('.project-mobile-panel-pills')).toBeVisible()
    await expect(page.locator('.project-builder-mobile-list')).toBeVisible()
    await expect(page.locator('.project-builder-section').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'New section' })).toBeVisible()
    await page.screenshot({
      path: 'artifacts/iteration-11-builder-layout-mobile/project-bid-builder-iphone13.png',
      fullPage: true,
    })

    const firstMobileCard = page.locator('.project-builder-mobile-list details').first()
    await firstMobileCard.locator('summary').click()
    await page.screenshot({
      path: 'artifacts/iteration-11-builder-layout-mobile/project-bid-builder-expanded-iphone13.png',
      fullPage: true,
    })
    await firstMobileCard.getByRole('button', { name: /Materials/i }).click()
    const materialsDialog = page.getByRole('dialog')
    await expect(materialsDialog.getByRole('heading', { name: 'Materials editor' })).toBeVisible()
    await materialsDialog.screenshot({
      path: 'artifacts/iteration-11-builder-layout-mobile/materials-picker-iphone13.png',
    })
    await page.getByRole('button', { name: 'Close' }).click()

    await page.getByRole('button', { name: 'Company library' }).click()
    const libraryDialog = page.getByRole('dialog')
    await expect(libraryDialog.getByRole('heading', { name: 'Company library' })).toBeVisible()
    await expect(libraryDialog.getByRole('tab', { name: /Labor/i })).toBeVisible()
    await libraryDialog.screenshot({
      path: 'artifacts/iteration-11-builder-layout-mobile/company-library-iphone13.png',
    })
    await page.getByRole('button', { name: 'Close' }).click()
  })

  test('mobile settings honor the project totals tracking preference', async ({ page }) => {
    mkdirSync('artifacts/iteration-11-tracking-mobile', { recursive: true })

    await signInDemoUser(page)
    await setTrackingPreference(page, 'Project totals')

    await page.goto('/')
    await expect(page.locator('.dashboard-mobile-list').first()).toBeVisible()

    const activeCard = page.locator('.dashboard-mobile-card').filter({ hasText: 'Pine Court Storm Repair' })
    await activeCard.locator('summary').click()
    await activeCard.getByRole('link', { name: 'Open project' }).click()

    await expect(page.getByRole('heading', { name: 'Pine Court Storm Repair' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Project tracking' })).toBeVisible()
    await expect(page.locator('.project-totals-tracker')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Quick update' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add costs to project' })).toBeVisible()
    await expect(page.getByLabel('Add labor cost')).toBeVisible()
    await expect(page.getByLabel('Add materials / equipment cost')).toBeVisible()
    await expect(page.getByText('Quick add view')).toBeVisible()
    await expect(page.locator('.tracking-mobile-quick-card')).toHaveCount(2)
    await expect(page.locator('.tracking-mobile-scope-details')).toContainText('Show WBS details')
    await expect(page.locator('.tracking-table')).toHaveCount(0)

    await page.locator('.tracking-mobile-scope-details > summary').click()
    await expect(page.locator('.project-mobile-panel-pills')).toBeVisible()
    await expect(page.locator('.worksheet-mobile-card-list').first()).toBeVisible()
    await expect(page.locator('.worksheet-mobile-card').first()).toBeVisible()
    await page.screenshot({
      path: 'artifacts/iteration-11-tracking-mobile/project-tracking-iphone13.png',
      fullPage: true,
    })
  })

  test('mobile inventory page renders as cards', async ({ page }) => {
    mkdirSync('artifacts/iteration-11-inventory-mobile', { recursive: true })

    await signInDemoUser(page)
    await page.goto('/inventory')

    await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible()
    await expect(page.locator('.inventory-mobile-list')).toBeVisible()
    await expect(page.locator('.inventory-mobile-card').first()).toBeVisible()
    await expect(page.locator('.inventory-table-shell')).toBeHidden()
    await page.screenshot({
      path: 'artifacts/iteration-11-inventory-mobile/inventory-iphone13.png',
      fullPage: true,
    })
  })
})
