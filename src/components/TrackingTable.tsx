import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { formatCurrency, formatNumber } from '../lib/formatters'
import type { ProjectItemActualUpdate, ProjectItemMetric } from '../lib/models'

type RowSaveState = 'saved' | 'pending' | 'saving' | 'error'

type TrackingDraft = {
  actual_quantity: string
  actual_labor_hours: string
  actual_labor_cost: string
  actual_material_cost: string
  actual_equipment_days: string
  actual_equipment_cost: string
  actual_subcontract_cost: string
  actual_overhead_cost: string
  actual_profit_amount: string
}

const toTrackingDraft = (item: ProjectItemMetric): TrackingDraft => ({
  actual_quantity: String(item.actual_quantity ?? 0),
  actual_labor_hours: String(item.actual_labor_hours ?? 0),
  actual_labor_cost: String(item.actual_labor_cost ?? 0),
  actual_material_cost: String(item.actual_material_cost ?? 0),
  actual_equipment_days: String(item.actual_equipment_days ?? 0),
  actual_equipment_cost: String(item.actual_equipment_cost ?? 0),
  actual_subcontract_cost: String(item.actual_subcontract_cost ?? 0),
  actual_overhead_cost: String(item.actual_overhead_cost ?? 0),
  actual_profit_amount: String(item.actual_profit_amount ?? 0),
})

const parseNumericInput = (value: string) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const isDraftDirty = (draft: TrackingDraft, item: ProjectItemMetric) => {
  const baseline = toTrackingDraft(item)

  return (
    draft.actual_quantity !== baseline.actual_quantity ||
    draft.actual_labor_hours !== baseline.actual_labor_hours ||
    draft.actual_labor_cost !== baseline.actual_labor_cost ||
    draft.actual_material_cost !== baseline.actual_material_cost ||
    draft.actual_equipment_days !== baseline.actual_equipment_days ||
    draft.actual_equipment_cost !== baseline.actual_equipment_cost ||
    draft.actual_subcontract_cost !== baseline.actual_subcontract_cost ||
    draft.actual_overhead_cost !== baseline.actual_overhead_cost ||
    draft.actual_profit_amount !== baseline.actual_profit_amount
  )
}

export const TrackingTable = ({
  items,
  isSaving,
  onSaveRow,
  projectId,
  readOnly = false,
}: {
  items: ProjectItemMetric[]
  isSaving: string | null
  onSaveRow: (itemId: string, patch: ProjectItemActualUpdate) => Promise<void>
  projectId?: string
  readOnly?: boolean
}) => {
  const [draftOverrides, setDraftOverrides] = useState<Record<string, TrackingDraft>>({})
  const [rowSaveState, setRowSaveState] = useState<Record<string, RowSaveState>>({})
  const saveTimeouts = useRef<Record<string, ReturnType<typeof window.setTimeout>>>({})

  useEffect(
    () => () => {
      Object.values(saveTimeouts.current).forEach((timeoutId) => window.clearTimeout(timeoutId))
    },
    [],
  )

  const itemsByKey = useMemo(
    () =>
      new Map(
        items.map((item) => [item.project_estimate_item_id ?? item.item_code ?? '', item]),
      ),
    [items],
  )

  const drafts = useMemo(
    () =>
      Object.fromEntries(
        items.map((item) => {
          const key = item.project_estimate_item_id ?? item.item_code ?? ''
          return [key, draftOverrides[key] ?? toTrackingDraft(item)]
        }),
      ),
    [draftOverrides, items],
  )

  const sectionTotals = useMemo(() => {
    const totals = new Map<string, { actual: number; bid: number }>()

    for (const item of items) {
      const key = `${item.section_code}:${item.section_name}`
      const running = totals.get(key) ?? { actual: 0, bid: 0 }
      totals.set(key, {
        actual: running.actual + (item.actual_total_cost ?? 0),
        bid: running.bid + (item.estimated_total_cost ?? 0),
      })
    }

    return totals
  }, [items])

  const displayRows = useMemo(
    () =>
      items.map((item, index) => {
        const previousItem = items[index - 1]
        const showSectionHeading =
          index === 0 ||
          previousItem?.section_code !== item.section_code ||
          previousItem?.section_name !== item.section_name
        const sectionKey = `${item.section_code}:${item.section_name}`

        return {
          item,
          sectionKey,
          showSectionHeading,
        }
      }),
    [items],
  )

  const persistDraft = async (key: string, draft: TrackingDraft, item: ProjectItemMetric) => {
    if (readOnly) {
      return
    }

    if (!isDraftDirty(draft, item)) {
      setRowSaveState((current) => ({ ...current, [key]: 'saved' }))
      return
    }

    setRowSaveState((current) => ({ ...current, [key]: 'saving' }))

    try {
      await onSaveRow(key, {
        actual_quantity: parseNumericInput(draft.actual_quantity),
        actual_labor_hours: parseNumericInput(draft.actual_labor_hours),
        actual_labor_cost: parseNumericInput(draft.actual_labor_cost),
        actual_material_cost: parseNumericInput(draft.actual_material_cost),
        actual_equipment_days: parseNumericInput(draft.actual_equipment_days),
        actual_equipment_cost: parseNumericInput(draft.actual_equipment_cost),
        actual_subcontract_cost: parseNumericInput(draft.actual_subcontract_cost),
        actual_overhead_cost: parseNumericInput(draft.actual_overhead_cost),
        actual_profit_amount: parseNumericInput(draft.actual_profit_amount),
      })

      setRowSaveState((current) => ({ ...current, [key]: 'saved' }))
    } catch {
      setRowSaveState((current) => ({ ...current, [key]: 'error' }))
    }
  }

  const queueAutoSave = (key: string, draft: TrackingDraft, item: ProjectItemMetric) => {
    if (readOnly) {
      return
    }

    setRowSaveState((current) => ({ ...current, [key]: 'pending' }))
    window.clearTimeout(saveTimeouts.current[key])
    saveTimeouts.current[key] = window.setTimeout(() => {
      void persistDraft(key, draft, item)
    }, 1200)
  }

  const flushAutoSave = (key: string, draft: TrackingDraft, item: ProjectItemMetric) => {
    if (readOnly) {
      return
    }

    window.clearTimeout(saveTimeouts.current[key])
    void persistDraft(key, draft, item)
  }

  const updateDraft = (
    key: string,
    field: keyof TrackingDraft,
    value: TrackingDraft[keyof TrackingDraft],
  ) => {
    const item = itemsByKey.get(key)
    const baselineDraft = item ? drafts[key] ?? toTrackingDraft(item) : null
    let nextDraft: TrackingDraft | null = null

    setDraftOverrides((current) => {
      const currentDraft = current[key] ?? baselineDraft

      if (!currentDraft) {
        return current
      }

      nextDraft = {
        ...currentDraft,
        [field]: value,
      }

      return {
        ...current,
        [key]: nextDraft,
      }
    })

    if (item && nextDraft) {
      queueAutoSave(key, nextDraft, item)
    }
  }

  const getSaveLabel = (key: string) => {
    if (isSaving === key || rowSaveState[key] === 'saving' || rowSaveState[key] === 'pending') {
      return 'Syncing…'
    }

    if (rowSaveState[key] === 'error') {
      return 'Needs retry'
    }

    return 'Synced'
  }

  return (
    <div className="table-shell">
      <table className="estimate-table tracking-table">
        <thead>
          <tr>
            <th className="estimate-column-scope estimate-sticky estimate-sticky-scope">Scope</th>
            <th className="estimate-column-bucket">Labor</th>
            <th className="estimate-column-bucket">Materials</th>
            <th className="estimate-column-bucket">Equipment</th>
            <th className="estimate-column-bucket">Subs</th>
            <th className="estimate-column-bucket">O/H + Profit</th>
            <th className="estimate-column-total">Actual</th>
          </tr>
        </thead>
        <tbody>
          {displayRows.map(({ item, sectionKey, showSectionHeading }) => {
            const key = item.project_estimate_item_id ?? item.item_code ?? ''
            const draft = drafts[key]
            const sectionTotal = sectionTotals.get(sectionKey)
            const itemRoute =
              projectId && item.project_estimate_item_id
                ? '/projects/' + projectId + '/items/' + item.project_estimate_item_id
                : null

            if (!draft) {
              return null
            }

            return (
              <Fragment key={key}>
                {showSectionHeading ? (
                  <tr className="estimate-section-row" key={`${sectionKey}-heading`}>
                    <td colSpan={7}>
                      <div>
                        <span>
                          {item.section_code} · {item.section_name}
                        </span>
                        <strong>
                          {formatCurrency(sectionTotal?.actual)} actual · {formatCurrency(sectionTotal?.bid)} bid
                        </strong>
                      </div>
                    </td>
                  </tr>
                ) : null}
                <tr>
                  <td className="scope-cell estimate-column-scope estimate-sticky estimate-sticky-scope">
                      <div className="scope-editor scope-editor-readonly">
                        <div className="scope-editor-top">
                          <span className="scope-code-pill mono">{item.item_code}</span>
                          <span className="scope-unit-pill">{item.unit}</span>
                        </div>
                        <strong>{item.item_name}</strong>
                        <span className="scope-meta-line">
                          {item.section_code} · {item.section_name}
                        </span>
                    </div>
                  </td>
                  <td className="estimate-column-bucket">
                    <div className="estimate-bucket">
                      <label className="estimate-bucket-field">
                        <span>Hours</span>
                        {readOnly ? (
                          <strong>{formatNumber(item.actual_labor_hours)}</strong>
                        ) : (
                          <input
                            aria-label={`${item.item_code} actual labor hours`}
                            min="0"
                            onBlur={() => {
                              flushAutoSave(key, draft, item)
                            }}
                            onChange={(event) => {
                              updateDraft(key, 'actual_labor_hours', event.target.value)
                            }}
                            step="0.1"
                            type="number"
                            value={draft.actual_labor_hours}
                          />
                        )}
                      </label>
                      <label className="estimate-bucket-field">
                        <span>Cost</span>
                        {readOnly ? (
                          <strong>{formatCurrency(item.actual_labor_cost)}</strong>
                        ) : (
                          <input
                            aria-label={`${item.item_code} actual labor cost`}
                            min="0"
                            onBlur={() => {
                              flushAutoSave(key, draft, item)
                            }}
                            onChange={(event) => {
                              updateDraft(key, 'actual_labor_cost', event.target.value)
                            }}
                            step="0.1"
                            type="number"
                            value={draft.actual_labor_cost}
                          />
                        )}
                      </label>
                      <span className="estimate-reference">
                        Bid {formatNumber(item.labor_hours)} hrs · {formatCurrency(item.estimated_labor_cost)}
                      </span>
                    </div>
                  </td>
                  <td className="estimate-column-bucket">
                    <div className="estimate-bucket">
                      <label className="estimate-bucket-field">
                        <span>Qty</span>
                        {readOnly ? (
                          <strong>{formatNumber(item.actual_quantity)}</strong>
                        ) : (
                          <input
                            aria-label={`${item.item_code} actual quantity`}
                            min="0"
                            onBlur={() => {
                              flushAutoSave(key, draft, item)
                            }}
                            onChange={(event) => {
                              updateDraft(key, 'actual_quantity', event.target.value)
                            }}
                            step="0.1"
                            type="number"
                            value={draft.actual_quantity}
                          />
                        )}
                      </label>
                      <label className="estimate-bucket-field">
                        <span>Cost</span>
                        {readOnly ? (
                          <strong>{formatCurrency(item.actual_material_cost)}</strong>
                        ) : (
                          <input
                            aria-label={`${item.item_code} actual material cost`}
                            min="0"
                            onBlur={() => {
                              flushAutoSave(key, draft, item)
                            }}
                            onChange={(event) => {
                              updateDraft(key, 'actual_material_cost', event.target.value)
                            }}
                            step="0.1"
                            type="number"
                            value={draft.actual_material_cost}
                          />
                        )}
                      </label>
                      <span className="estimate-reference">
                        Bid {formatNumber(item.quantity)} {item.unit} · {formatCurrency(item.material_cost)}
                      </span>
                    </div>
                  </td>
                  <td className="estimate-column-bucket">
                    <div className="estimate-bucket">
                      <label className="estimate-bucket-field">
                        <span>Days</span>
                        {readOnly ? (
                          <strong>{formatNumber(item.actual_equipment_days)}</strong>
                        ) : (
                          <input
                            aria-label={`${item.item_code} actual equipment days`}
                            min="0"
                            onBlur={() => {
                              flushAutoSave(key, draft, item)
                            }}
                            onChange={(event) => {
                              updateDraft(key, 'actual_equipment_days', event.target.value)
                            }}
                            step="0.1"
                            type="number"
                            value={draft.actual_equipment_days}
                          />
                        )}
                      </label>
                      <label className="estimate-bucket-field">
                        <span>Cost</span>
                        {readOnly ? (
                          <strong>{formatCurrency(item.actual_equipment_cost)}</strong>
                        ) : (
                          <input
                            aria-label={`${item.item_code} actual equipment cost`}
                            min="0"
                            onBlur={() => {
                              flushAutoSave(key, draft, item)
                            }}
                            onChange={(event) => {
                              updateDraft(key, 'actual_equipment_cost', event.target.value)
                            }}
                            step="0.1"
                            type="number"
                            value={draft.actual_equipment_cost}
                          />
                        )}
                      </label>
                      <span className="estimate-reference">
                        Bid {formatNumber(item.equipment_days)} days · {formatCurrency(item.estimated_equipment_cost)}
                      </span>
                    </div>
                  </td>
                  <td className="estimate-column-bucket">
                    <div className="estimate-bucket estimate-bucket-single">
                      <label className="estimate-bucket-field">
                        <span>Cost</span>
                        {readOnly ? (
                          <strong>{formatCurrency(item.actual_subcontract_cost)}</strong>
                        ) : (
                          <input
                            aria-label={`${item.item_code} actual subcontract cost`}
                            min="0"
                            onBlur={() => {
                              flushAutoSave(key, draft, item)
                            }}
                            onChange={(event) => {
                              updateDraft(key, 'actual_subcontract_cost', event.target.value)
                            }}
                            step="0.1"
                            type="number"
                            value={draft.actual_subcontract_cost}
                          />
                        )}
                      </label>
                      <span className="estimate-reference">
                        Bid {formatCurrency(item.subcontract_cost)}
                      </span>
                    </div>
                  </td>
                  <td className="estimate-column-bucket">
                    <div className="estimate-bucket">
                      <label className="estimate-bucket-field">
                        <span>O/H</span>
                        {readOnly ? (
                          <strong>{formatCurrency(item.actual_overhead_cost)}</strong>
                        ) : (
                          <input
                            aria-label={`${item.item_code} actual overhead cost`}
                            min="0"
                            onBlur={() => {
                              flushAutoSave(key, draft, item)
                            }}
                            onChange={(event) => {
                              updateDraft(key, 'actual_overhead_cost', event.target.value)
                            }}
                            step="0.1"
                            type="number"
                            value={draft.actual_overhead_cost}
                          />
                        )}
                      </label>
                      <label className="estimate-bucket-field">
                        <span>Profit</span>
                        {readOnly ? (
                          <strong>{formatCurrency(item.actual_profit_amount)}</strong>
                        ) : (
                          <input
                            aria-label={`${item.item_code} actual profit amount`}
                            min="0"
                            onBlur={() => {
                              flushAutoSave(key, draft, item)
                            }}
                            onChange={(event) => {
                              updateDraft(key, 'actual_profit_amount', event.target.value)
                            }}
                            step="0.1"
                            type="number"
                            value={draft.actual_profit_amount}
                          />
                        )}
                      </label>
                      <span className="estimate-reference">
                        Bid {formatCurrency(item.estimated_overhead_cost)} · {formatCurrency(item.estimated_profit_cost)}
                      </span>
                    </div>
                  </td>
                  <td className="estimate-column-total estimate-total-cell">
                    <div className="estimate-total-stack">
                      <strong>{formatCurrency(item.actual_total_cost)}</strong>
                      <span className="estimate-reference">
                        Bid {formatCurrency(item.estimated_total_cost)}
                      </span>
                      {!readOnly ? (
                        <span className={`row-save-state row-save-${rowSaveState[key] ?? 'saved'}`}>
                          {getSaveLabel(key)}
                        </span>
                      ) : null}
                      {itemRoute ? (
                        <Link className="ghost-button tracking-row-link" to={itemRoute}>
                          Advanced
                        </Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
