import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { WorkspaceMenu } from '../components/WorkspaceMenu'
import { useAuth } from '../hooks/useAuth'
import { useTrackingPreference } from '../hooks/useTrackingPreference'
import { fetchOrganizations } from '../lib/api'
import type { Organization } from '../lib/models'
import { trackingPreferenceOptions } from '../lib/tracking-preferences'

export const SettingsPage = () => {
  const { signOutUser, user } = useAuth()
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [screenError, setScreenError] = useState<string | null>(null)
  const { setTrackingPreference, trackingPreference } = useTrackingPreference(user?.id)

  useEffect(() => {
    const loadOrganizations = async () => {
      setIsLoading(true)
      setScreenError(null)

      try {
        const nextOrganizations = await fetchOrganizations()
        setOrganizations(nextOrganizations)
      } catch (caughtError) {
        const message =
          caughtError instanceof Error ? caughtError.message : 'Unable to load settings'
        setScreenError(message)
      } finally {
        setIsLoading(false)
      }
    }

    void loadOrganizations()
  }, [])

  const activeOrganization = organizations[0] ?? null

  return (
    <main className="app-screen app-screen-compact">
      <header className="topbar topbar-simple">
        <div className="project-header-copy">
          <Link className="back-link" to="/">
            ← Back
          </Link>
          <p className="eyebrow">ProfitBuilder</p>
          <h1>Settings</h1>
          <p className="project-meta-line">
            <span>{activeOrganization?.name ?? 'No organization yet'}</span>
            <span>{user?.email ?? 'Signed in'}</span>
          </p>
        </div>
        <div className="topbar-actions">
          <button className="secondary-button" onClick={() => void signOutUser()} type="button">
            Sign out
          </button>
          <WorkspaceMenu />
        </div>
      </header>

      {screenError ? <p className="screen-error">{screenError}</p> : null}

      {isLoading ? (
        <article className="panel">
          <div className="panel-empty">Loading settings…</div>
        </article>
      ) : (
        <section className="utility-page-grid">
          <article className="panel panel-compact">
            <div className="panel-heading panel-heading-compact">
              <div>
                <h2>Account</h2>
                <p className="panel-meta">The signed-in workspace user for this environment.</p>
              </div>
            </div>
            <div className="utility-list">
              <div className="utility-row">
                <div className="utility-row-copy">
                  <strong>Email</strong>
                  <span>Current login</span>
                </div>
                <span>{user?.email ?? 'Unavailable'}</span>
              </div>
            </div>
          </article>

          <article className="panel panel-compact">
            <div className="panel-heading panel-heading-compact">
              <div>
                <h2>Workspace</h2>
                <p className="panel-meta">Minimal settings surface for the current company.</p>
              </div>
            </div>
            <div className="utility-list">
              <div className="utility-row">
                <div className="utility-row-copy">
                  <strong>Organization</strong>
                  <span>Default company context</span>
                </div>
                <span>{activeOrganization?.name ?? 'Create one from the dashboard'}</span>
              </div>
              <div className="utility-row">
                <div className="utility-row-copy">
                  <strong>Slug</strong>
                  <span>Useful for future workspace settings</span>
                </div>
                <span>{activeOrganization?.slug ?? 'Not set'}</span>
              </div>
            </div>
          </article>

          <article className="panel panel-compact">
            <div className="panel-heading panel-heading-compact">
              <div>
                <h2>Tracking defaults</h2>
                <p className="panel-meta">
                  Choose the simple default for labor and materials on active jobs.
                </p>
              </div>
            </div>

            <fieldset className="settings-choice-group">
              <legend className="settings-choice-legend">Actuals tracking style</legend>
              {trackingPreferenceOptions.map((option) => {
                const isSelected = trackingPreference === option.value

                return (
                  <label
                    className={
                      'settings-choice-card' + (isSelected ? ' settings-choice-card-selected' : '')
                    }
                    key={option.value}
                  >
                    <div className="settings-choice-input">
                      <input
                        checked={isSelected}
                        name="tracking-preference"
                        onChange={() => setTrackingPreference(option.value)}
                        type="radio"
                        value={option.value}
                      />
                    </div>
                    <div className="settings-choice-copy">
                      <strong>{option.label}</strong>
                      <span>{option.description}</span>
                    </div>
                  </label>
                )
              })}
            </fieldset>

            <p className="panel-meta">
              Saved on this device for {user?.email ?? 'the signed-in user'}.
            </p>
          </article>
        </section>
      )}
    </main>
  )
}
