import { Fragment, useEffect, useMemo, useRef, useState } from 'react'

import { formatCurrency } from '../lib/formatters'
import {
  numericDraftFields,
  type ProjectEstimateItemUpdate,
  toEstimateDraft,
  type EstimateDraft,
  type ProjectItemMetric,
} from '../lib/models'

type RowSaveState = 'saved' | 'pending' | 'saving' | 'error'

const parseNumericInput = (value: string) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const isDraftDirty = (draft: EstimateDraft, item: ProjectItemMetric) => {
  const baseline = toEstimateDraft(item)

  if (draft.is_included !== baseline.is_included) {
    return true
  }

  if (draft.item_name !== baseline.item_name) {
    return true
  }

  return numericDraftFields.some((field) => draft[field] !== baseline[field])
}

export const EstimateTable = ({
  items,
  isSaving,
  onSaveRow,
  readOnly = false,
}: {
  items: ProjectItemMetric[]
  isSaving: string | null
  onSaveRow: (itemId: string, patch: ProjectEstimateItemUpdate) => Promise<void>
  readOnly?: boolean
}) => {
  const [draftOverrides, setDraftOverrides] = useState<Record<string, EstimateDraft>>({})
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
          return [key, draftOverrides[key] ?? toEstimateDraft(item)]
        }),
      ),
    [draftOverrides, items],
  )

  const sectionTotals = useMemo(() => {
    const totals = new Map<string, number>()

    for (const item of items) {
      const key = `${item.section_code}:${item.section_name}`
      const running = totals.get(key) ?? 0
      totals.set(key, running + (item.estimated_total_cost ?? 0))
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

  const persistDraft = async (key: string, draft: EstimateDraft, item: ProjectItemMetric) => {
    if (readOnly) {
      return
    }

    if (draft.item_name.trim() === '') {
      setRowSaveState((current) => ({ ...current, [key]: 'error' }))
      return
    }

    if (!isDraftDirty(draft, item)) {
      setRowSaveState((current) => ({ ...current, [key]: 'saved' }))
      return
    }

    setRowSaveState((current) => ({ ...current, [key]: 'saving' }))

    try {
      await onSaveRow(key, {
        item_name: draft.item_name.trim(),
        is_included: draft.is_included,
        quantity: parseNumericInput(draft.quantity),
        labor_hours: parseNumericInput(draft.labor_hours),
        labor_rate: parseNumericInput(draft.labor_rate),
        material_cost: parseNumericInput(draft.material_cost),
        equipment_days: parseNumericInput(draft.equipment_days),
        equipment_rate: parseNumericInput(draft.equipment_rate),
        subcontract_cost: parseNumericInput(draft.subcontract_cost),
        overhead_percent: parseNumericInput(draft.overhead_percent),
        profit_percent: parseNumericInput(draft.profit_percent),
      })

      setRowSaveState((current) => ({ ...current, [key]: 'saved' }))
    } catch {
      setRowSaveState((current) => ({ ...current, [key]: 'error' }))
    }
  }

  const queueAutoSave = (key: string, draft: EstimateDraft, item: ProjectItemMetric) => {
    if (readOnly) {
      return
    }

    setRowSaveState((current) => ({ ...current, [key]: 'pending' }))
    window.clearTimeout(saveTimeouts.current[key])
    saveTimeouts.current[key] = window.setTimeout(() => {
      void persistDraft(key, draft, item)
    }, 1200)
  }

  const flushAutoSave = (key: string, draft: EstimateDraft, item: ProjectItemMetric) => {
    if (readOnly) {
      return
    }

    window.clearTimeout(saveTimeouts.current[key])
    void persistDraft(key, draft, item)
  }

  const updateDraft = (
    key: string,
    field: keyof EstimateDraft,
    value: EstimateDraft[keyof EstimateDraft],
  ) => {
    const item = itemsByKey.get(key)
    const baselineDraft = item ? drafts[key] ?? toEstimateDraft(item) : null
    let nextDraft: EstimateDraft | null = null

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
      <table className="estimate-table">
        <thead>
          <tr>
            <th className="estimate-column-scope estimate-sticky estimate-sticky-scope">Scope</th>
            <th className="estimate-column-bucket">Labor</th>
            <th className="estimate-column-bucket">Materials</th>
            <th className="estimate-column-bucket">Equipment</th>
            <th className="estimate-column-bucket">Subs</th>
            <th className="estimate-column-bucket">O/H + Profit</th>
            <th className="estimate-column-total">Total</th>
          </tr>
        </thead>
        <tbody>
          {displayRows.map(({ item, sectionKey, showSectionHeading }) => {
            const key = item.project_estimate_item_id ?? item.item_code ?? ''
            const draft = drafts[key]

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
                        <strong>{formatCurrency(sectionTotals.get(sectionKey))}</strong>
                      </div>
                    </td>
                  </tr>
                ) : null}
                <tr className={draft.is_included ? '' : 'estimate-row-muted'} key={key}>
                  <td className="scope-cell estimate-column-scope estimate-sticky estimate-sticky-scope">
                    <div className={`scope-editor${readOnly ? ' scope-editor-readonly' : ''}`}>
                      <div className="scope-editor-top">
                        {!readOnly ? (
                          <input
                            aria-label={`Toggle ${item.item_name}`}
                            checked={draft.is_included}
                            onChange={(event) => {
                              updateDraft(key, 'is_included', event.target.checked)
                            }}
                            type="checkbox"
                          />
                        ) : null}
                        <span className="scope-code-pill mono">{item.item_code}</span>
                        <span className="scope-unit-pill">{item.unit}</span>
                      </div>
                      {readOnly ? (
                        <strong>{draft.item_name}</strong>
                      ) : (
                         <input
                           aria-label={`${item.item_code} scope name`}
                           className="scope-name-input"
                           onBlur={() => {
                             flushAutoSave(key, draft, item)
                           }}
                           onChange={(event) => {
                             updateDraft(key, 'item_name', event.target.value)
                           }}
                          type="text"
                          value={draft.item_name}
                        />
                      )}
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
                          <strong>{draft.labor_hours}</strong>
                        ) : (
                          <input
                            aria-label={`${item.item_code} labor hours`}
                            min="0"
                            onBlur={() => {
                              flushAutoSave(key, draft, item)
                            }}
                            onChange={(event) => {
                              updateDraft(key, 'labor_hours', event.target.value)
                            }}
                            step="0.1"
                            type="number"
                            value={draft.labor_hours}
                          />
                        )}
                      </label>
                      <label className="estimate-bucket-field">
                        <span>Rate</span>
                        {readOnly ? (
                          <strong>{formatCurrency(Number(draft.labor_rate))}</strong>
                        ) : (
                          <input
                            aria-label={`${item.item_code} labor rate`}
                            min="0"
                            onBlur={() => {
                              flushAutoSave(key, draft, item)
                            }}
                            onChange={(event) => {
                              updateDraft(key, 'labor_rate', event.target.value)
                            }}
                            step="0.1"
                            type="number"
                            value={draft.labor_rate}
                          />
                        )}
                      </label>
                    </div>
                  </td>
                  <td className="estimate-column-bucket">
                    <div className="estimate-bucket">
                      <label className="estimate-bucket-field">
                        <span>Qty</span>
                        {readOnly ? (
                          <strong>{draft.quantity}</strong>
                        ) : (
                          <input
                            aria-label={`${item.item_code} quantity`}
                            min="0"
                            onBlur={() => {
                              flushAutoSave(key, draft, item)
                            }}
                            onChange={(event) => {
                              updateDraft(key, 'quantity', event.target.value)
                            }}
                            step="0.1"
                            type="number"
                            value={draft.quantity}
                          />
                        )}
                      </label>
                      <label className="estimate-bucket-field">
                        <span>Cost</span>
                        {readOnly ? (
                          <strong>{formatCurrency(Number(draft.material_cost))}</strong>
                        ) : (
                          <input
                            aria-label={`${item.item_code} material cost`}
                            min="0"
                            onBlur={() => {
                              flushAutoSave(key, draft, item)
                            }}
                            onChange={(event) => {
                              updateDraft(key, 'material_cost', event.target.value)
                            }}
                            step="0.1"
                            type="number"
                            value={draft.material_cost}
                          />
                        )}
                      </label>
                    </div>
                  </td>
                  <td className="estimate-column-bucket">
                    <div className="estimate-bucket">
                      <label className="estimate-bucket-field">
                        <span>Days</span>
                        {readOnly ? (
                          <strong>{draft.equipment_days}</strong>
                        ) : (
                          <input
                            aria-label={`${item.item_code} equipment days`}
                            min="0"
                            onBlur={() => {
                              flushAutoSave(key, draft, item)
                            }}
                            onChange={(event) => {
                              updateDraft(key, 'equipment_days', event.target.value)
                            }}
                            step="0.1"
                            type="number"
                            value={draft.equipment_days}
                          />
                        )}
                      </label>
                      <label className="estimate-bucket-field">
                        <span>Rate</span>
                        {readOnly ? (
                          <strong>{formatCurrency(Number(draft.equipment_rate))}</strong>
                        ) : (
                          <input
                            aria-label={`${item.item_code} equipment rate`}
                            min="0"
                            onBlur={() => {
                              flushAutoSave(key, draft, item)
                            }}
                            onChange={(event) => {
                              updateDraft(key, 'equipment_rate', event.target.value)
                            }}
                            step="0.1"
                            type="number"
                            value={draft.equipment_rate}
                          />
                        )}
                      </label>
                    </div>
                  </td>
                  <td className="estimate-column-bucket">
                    <div className="estimate-bucket estimate-bucket-single">
                      <label className="estimate-bucket-field">
                        <span>Cost</span>
                        {readOnly ? (
                          <strong>{formatCurrency(Number(draft.subcontract_cost))}</strong>
                        ) : (
                          <input
                            aria-label={`${item.item_code} subcontract cost`}
                            min="0"
                            onBlur={() => {
                              flushAutoSave(key, draft, item)
                            }}
                            onChange={(event) => {
                              updateDraft(key, 'subcontract_cost', event.target.value)
                            }}
                            step="0.1"
                            type="number"
                            value={draft.subcontract_cost}
                          />
                        )}
                      </label>
                    </div>
                  </td>
                  <td className="estimate-column-bucket">
                    <div className="estimate-bucket">
                      <label className="estimate-bucket-field">
                        <span>O/H %</span>
                        {readOnly ? (
                          <strong>{draft.overhead_percent}%</strong>
                        ) : (
                          <input
                            aria-label={`${item.item_code} overhead percent`}
                            min="0"
                            onBlur={() => {
                              flushAutoSave(key, draft, item)
                            }}
                            onChange={(event) => {
                              updateDraft(key, 'overhead_percent', event.target.value)
                            }}
                            step="1"
                            type="number"
                            value={draft.overhead_percent}
                          />
                        )}
                      </label>
                      <label className="estimate-bucket-field">
                        <span>Profit %</span>
                        {readOnly ? (
                          <strong>{draft.profit_percent}%</strong>
                        ) : (
                          <input
                            aria-label={`${item.item_code} profit percent`}
                            min="0"
                            onBlur={() => {
                              flushAutoSave(key, draft, item)
                            }}
                            onChange={(event) => {
                              updateDraft(key, 'profit_percent', event.target.value)
                            }}
                            step="1"
                            type="number"
                            value={draft.profit_percent}
                          />
                        )}
                      </label>
                    </div>
                  </td>
                  <td className="estimate-column-total estimate-total-cell">
                    <div className="estimate-total-stack">
                      <strong>{formatCurrency(item.estimated_total_cost)}</strong>
                      {!readOnly ? (
                        <span className={`row-save-state row-save-${rowSaveState[key] ?? 'saved'}`}>
                          {getSaveLabel(key)}
                        </span>
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
