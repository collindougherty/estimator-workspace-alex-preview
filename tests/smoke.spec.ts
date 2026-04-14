import { expect, test } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'

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
  }
}

const { demoEmail, demoPassword } = readLocalEnv()

test('login, dashboard, and project detail render cleanly', async ({ page }) => {
  mkdirSync('artifacts/iteration-7', { recursive: true })

  await page.goto('/login')
  await page.getByLabel('Email').fill(demoEmail)
  await page.getByLabel('Password').fill(demoPassword)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Pine Court Storm Repair/i })).toBeVisible()
  await page.screenshot({
    path: 'artifacts/iteration-7/dashboard.png',
    fullPage: true,
  })

  await page.getByRole('link', { name: /Pine Court Storm Repair/i }).click()
  await expect(page).toHaveURL(/\/projects\//)
  await expect(page.getByRole('heading', { name: 'Pine Court Storm Repair' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Tracking' })).toBeVisible()
  await expect(page.getByLabel('1.1.1 actual material cost')).toBeVisible()
  await page.screenshot({
    path: 'artifacts/iteration-7/project-active.png',
    fullPage: true,
  })

  await page.getByRole('link', { name: /Back/i }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('link', { name: /Maple Street Roof Replacement/i })).toBeVisible()
  await page.getByRole('link', { name: /Maple Street Roof Replacement/i }).click()
  await expect(page).toHaveURL(/\/projects\//)
  await expect(page.getByRole('heading', { name: 'Maple Street Roof Replacement' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Estimate' })).toBeVisible()
  await expect(page.getByLabel('1.2.3 scope name')).toHaveValue('Architectural shingles')
  await expect(page.getByLabel('1.2.3 material cost')).toBeVisible()
  await page.screenshot({
    path: 'artifacts/iteration-7/project-bidding.png',
    fullPage: true,
  })

  await page.getByRole('link', { name: /Back/i }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()

  await page.getByLabel('Email').fill(demoEmail)
  await page.getByLabel('Password').fill(demoPassword)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('link', { name: /Pine Court Storm Repair/i })).toBeVisible()
})
