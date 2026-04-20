import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'

import { CompanyLibraryPanel } from '../components/CompanyLibraryPanel'
import { FloatingPanel } from '../components/FloatingPanel'
import { MetricCard } from '../components/MetricCard'
import { ProjectEstimateBuilder } from '../components/ProjectEstimateBuilder'
import { StatusBadge } from '../components/StatusBadge'
import { TrackingTable } from '../components/TrackingTable'
import { useAuth } from '../hooks/useAuth'
import { useCompanyLibrary } from '../hooks/useCompanyLibrary'
import { useTrackingPreference } from '../hooks/useTrackingPreference'
import {
  createProjectScope,
  deleteProjectScope,
  fetchOrganizations,
  fetchProjectItemMetrics,
  fetchProjectSummary,
  updateProjectActuals,
  updateProjectEstimateItem,
} from '../lib/api'
import { formatCurrency, formatDate } from '../lib/formatters'
import { calculateActualOverheadCost, parseNumericInput, roundCurrencyValue } from '../lib/item-detail'
import { exportProposalPdf } from '../lib/proposal-pdf'
import { applyEstimatePatchToProjectItemMetric } from '../lib/project-estimate-builder'
import { getNextItemCode, getNextSectionCode, sortScopeItems } from '../lib/scope-hierarchy'
import type {
  ProjectEstimateItemUpdate,
  ProjectItemActualUpdate,
  ProjectItemMetric,
  ProjectSummary,
} from '../lib/models'

type ProjectTotalsSnapshot = {
  actualEquipmentCost: number
  actualEquipmentDays: number
  actualLaborCost: number
  actualLaborHours: number
  actualMaterialCost: number
  actualSubcontractCost: number
  invoiceAmount: number
  percentComplete: number
}

const filterTerminalItems = (items: ProjectItemMetric[]) => {
  const codes = items
    .map((item) => item.item_code?.trim())
    .filter((code): code is string => Boolean(code))

  return items.filter((item) => {
    const code = item.item_code?.trim()

    if (!code) {
      return true
    }

    return !codes.some((candidate) => candidate !== code && candidate.startsWith(code + '.'))
  })
}

const toProjectTotalsSnapshot = (items: ProjectItemMetric[]): ProjectTotalsSnapshot => {
  const totals = items.reduce(
    (summary, item) => {
      summary.actualEquipmentCost += item.actual_equipment_cost ?? 0
      summary.actualEquipmentDays += item.actual_equipment_days ?? 0
      summary.actualLaborCost += item.actual_labor_cost ?? 0
      summary.actualLaborHours += item.actual_labor_hours ?? 0
      summary.actualMaterialCost += item.actual_material_cost ?? 0
      summary.actualSubcontractCost += item.actual_subcontract_cost ?? 0
      summary.invoiceAmount += item.invoice_amount ?? 0
      summary.earnedValue += item.earned_value_amount ?? 0
      summary.estimatedTotal += item.estimated_total_cost ?? 0
      return summary
    },
    {
      actualEquipmentCost: 0,
      actualEquipmentDays: 0,
      actualLaborCost: 0,
      actualLaborHours: 0,
      actualMaterialCost: 0,
      actualSubcontractCost: 0,
      earnedValue: 0,
      estimatedTotal: 0,
      invoiceAmount: 0,
    },
  )

  return {
    actualEquipmentCost: totals.actualEquipmentCost,
    actualEquipmentDays: totals.actualEquipmentDays,
    actualLaborCost: totals.actualLaborCost,
    actualLaborHours: totals.actualLaborHours,
    actualMaterialCost: totals.actualMaterialCost,
    actualSubcontractCost: totals.actualSubcontractCost,
    invoiceAmount: totals.invoiceAmount,
    percentComplete:
      totals.estimatedTotal > 0
        ? roundCurrencyValue((totals.earnedValue / totals.estimatedTotal) * 100)
        : 0,
  }
}

type ProjectQuickAddDraft = {
  addedEquipmentCost: string
  addedEquipmentDays: string
  addedLaborCost: string
  addedLaborHours: string
  addedMaterialCost: string
  addedSubcontractCost: string
  addedInvoiceAmount: string
  percentComplete: string
}

const emptyProjectQuickAddDraft = (): ProjectQuickAddDraft => ({
  addedEquipmentCost: '',
  addedEquipmentDays: '',
  addedLaborCost: '',
  addedLaborHours: '',
  addedMaterialCost: '',
  addedSubcontractCost: '',
  addedInvoiceAmount: '',
  percentComplete: '',
})

const distributeTotal = (
  total: number,
  items: ProjectItemMetric[],
  getWeight: (item: ProjectItemMetric) => number,
) => {
  const values = new Map<string, number>()

  if (items.length === 0) {
    return values
  }

  const rawWeights = items.map((item) => Math.max(0, getWeight(item)))
  const weightSum = rawWeights.reduce((sum, weight) => sum + weight, 0)
  const weights = weightSum > 0 ? rawWeights : items.map(() => 1)
  const normalizedWeightSum = weights.reduce((sum, weight) => sum + weight, 0)
  let runningTotal = 0

  items.forEach((item, index) => {
    const itemId = item.project_estimate_item_id

    if (!itemId) {
      return
    }

    const value =
      index === items.length - 1
        ? roundCurrencyValue(total - runningTotal)
        : roundCurrencyValue(total * (weights[index] / normalizedWeightSum))

    runningTotal += value
    values.set(itemId, value)
  })

  return values
}

export const ProjectPage = () => {
  const { projectId } = useParams()
  const { user } = useAuth()
  const [project, setProject] = useState<ProjectSummary | null>(null)
  const [items, setItems] = useState<ProjectItemMetric[]>([])
  const [organizationName, setOrganizationName] = useState('')
  const [isCompanyLibraryOpen, setIsCompanyLibraryOpen] = useState(false)
  const [isScopeMutating, setIsScopeMutating] = useState(false)
  const [scopeDeleteTarget, setScopeDeleteTarget] = useState<ProjectItemMetric | null>(null)
  const [screenError, setScreenError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isProjectTotalsSaving, setIsProjectTotalsSaving] = useState(false)
  const [projectQuickAddDraft, setProjectQuickAddDraft] = useState<ProjectQuickAddDraft>(() =>
    emptyProjectQuickAddDraft(),
  )
  const [isTrackingBreakdownOpen, setIsTrackingBreakdownOpen] = useState(true)
  const { trackingPreference } = useTrackingPreference(user?.id)
  const {
    createEmployee: handleCreateEmployeeLibraryItem,
    createEquipment: handleCreateEquipmentLibraryItem,
    createMaterial: handleCreateMaterialLibraryItem,
    deleteEmployee: handleDeleteEmployeeLibraryItem,
    deleteEquipment: handleDeleteEquipmentLibraryItem,
    deleteMaterial: handleDeleteMaterialLibraryItem,
    employees: employeeLibrary,
    equipment: equipmentLibrary,
    isBusy: isLibrarySaving,
    materials: materialLibrary,
  } = useCompanyLibrary({
    onError: setScreenError,
    organizationId: project?.organization_id,
  })

  const loadProject = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!projectId) {
      return
    }

    if (!silent) {
      setIsLoading(true)
    }
    setScreenError(null)

    try {
      const [nextProject, nextItems, organizations] = await Promise.all([
        fetchProjectSummary(projectId),
        fetchProjectItemMetrics(projectId),
        fetchOrganizations(),
      ])

      setProject(nextProject)
      setItems(sortScopeItems(nextItems))
      setOrganizationName(
        organizations.find((organization) => organization.id === nextProject?.organization_id)
          ?.name ??
          organizations[0]?.name ??
          '',
      )
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : 'Unable to load project'
      setScreenError(message)
    } finally {
      if (!silent) {
        setIsLoading(false)
      }
    }
  }, [projectId])

  useEffect(() => {
    void loadProject()
  }, [loadProject])

  useEffect(() => {
    setIsTrackingBreakdownOpen(trackingPreference !== 'project-totals')
  }, [projectId, trackingPreference])

  const projectMode = useMemo(() => {
    if (!project?.status) {
      return 'estimate'
    }

    if (project.status === 'active' || project.status === 'completed') {
      return 'tracking'
    }

    if (project.status === 'lost' || project.status === 'archived') {
      return 'closed-estimate'
    }

    return 'estimate'
  }, [project?.status])

  const terminalItems = useMemo(() => filterTerminalItems(items), [items])
  const projectProfit = (project?.estimated_total_cost ?? 0) - (project?.actual_total_cost ?? 0)
  const showEstimateBuilder = projectMode !== 'tracking'
  const isReadOnly = project?.status === 'lost' || project?.status === 'archived'
  const prefersProjectTotals = projectMode === 'tracking' && trackingPreference === 'project-totals'
  const includedTrackingItems = useMemo(
    () => terminalItems.filter((item) => item.is_included && item.project_estimate_item_id),
    [terminalItems],
  )
  const projectTotalsSnapshot = useMemo(
    () => toProjectTotalsSnapshot(includedTrackingItems),
    [includedTrackingItems],
  )
  const estimateSummary = useMemo(
    () =>
      terminalItems.reduce(
        (summary, item) => {
          if (!item.is_included) {
            summary.itemCount += 1
            return summary
          }

          summary.itemCount += 1
          summary.includedCount += 1
          summary.includedTotal += item.estimated_total_cost ?? 0
          summary.directCost +=
            (item.estimated_labor_cost ?? 0) +
            (item.material_cost ?? 0) +
            (item.estimated_equipment_cost ?? 0) +
            (item.subcontract_cost ?? 0)
          summary.markup +=
            (item.estimated_overhead_cost ?? 0) + (item.estimated_profit_cost ?? 0)
          return summary
        },
        {
          directCost: 0,
          includedCount: 0,
          includedTotal: 0,
          itemCount: 0,
          markup: 0,
        },
      ),
    [terminalItems],
  )
  const projectTotalsPreview = useMemo(() => {
    const actualLaborCost =
      projectTotalsSnapshot.actualLaborCost + parseNumericInput(projectQuickAddDraft.addedLaborCost)
    const actualMaterialCost =
      projectTotalsSnapshot.actualMaterialCost +
      parseNumericInput(projectQuickAddDraft.addedMaterialCost)
    const actualEquipmentCost =
      projectTotalsSnapshot.actualEquipmentCost +
      parseNumericInput(projectQuickAddDraft.addedEquipmentCost)
    const actualSubcontractCost =
      projectTotalsSnapshot.actualSubcontractCost +
      parseNumericInput(projectQuickAddDraft.addedSubcontractCost)
    const directCost = roundCurrencyValue(
      actualLaborCost + actualMaterialCost + actualEquipmentCost + actualSubcontractCost,
    )
    const totalEstimate = includedTrackingItems.reduce(
      (sum, item) => sum + (item.estimated_total_cost ?? 0),
      0,
    )
    const overheadCost = roundCurrencyValue(
      includedTrackingItems.reduce((sum, item) => {
        const itemEstimate = item.estimated_total_cost ?? 0
        const share =
          totalEstimate > 0 ? itemEstimate / totalEstimate : 1 / Math.max(includedTrackingItems.length, 1)
        return sum + calculateActualOverheadCost(directCost * share, item.overhead_percent)
      }, 0),
    )

    return {
      directCost,
      invoiceAmount: roundCurrencyValue(
        projectTotalsSnapshot.invoiceAmount + parseNumericInput(projectQuickAddDraft.addedInvoiceAmount),
      ),
      overheadCost,
      percentComplete:
        projectQuickAddDraft.percentComplete.trim().length > 0
          ? parseNumericInput(projectQuickAddDraft.percentComplete)
          : projectTotalsSnapshot.percentComplete,
      totalCost: roundCurrencyValue(directCost + overheadCost),
    }
  }, [includedTrackingItems, projectQuickAddDraft, projectTotalsSnapshot])
  const currentProjectActualTotal = useMemo(
    () =>
      roundCurrencyValue(
        projectTotalsSnapshot.actualLaborCost +
          projectTotalsSnapshot.actualMaterialCost +
          projectTotalsSnapshot.actualEquipmentCost +
          projectTotalsSnapshot.actualSubcontractCost +
          includedTrackingItems.reduce(
            (sum, item) =>
              sum +
              calculateActualOverheadCost(
                (item.actual_labor_cost ?? 0) +
                  (item.actual_material_cost ?? 0) +
                  (item.actual_equipment_cost ?? 0) +
                  (item.actual_subcontract_cost ?? 0),
                item.overhead_percent,
              ),
            0,
          ),
      ),
    [includedTrackingItems, projectTotalsSnapshot],
  )
  const hasProjectQuickAddChanges = useMemo(
    () =>
      Object.values(projectQuickAddDraft).some((value) => value.trim().length > 0),
    [projectQuickAddDraft],
  )

  useEffect(() => {
    setProjectQuickAddDraft(emptyProjectQuickAddDraft())
  }, [projectId])

  if (!projectId) {
    return <Navigate replace to="/" />
  }

  const handleExportProposal = () => {
    if (!project) {
      return
    }

    exportProposalPdf({
      organizationName,
      project,
      items,
    })
  }

  const handleSaveEstimateRow = async (
    itemId: string,
    patch: ProjectEstimateItemUpdate,
  ) => {
    setScreenError(null)

    try {
      await updateProjectEstimateItem(itemId, patch)
      setItems((current) =>
        sortScopeItems(
          current.map((item) =>
            item.project_estimate_item_id === itemId
              ? applyEstimatePatchToProjectItemMetric(item, patch)
              : item,
          ),
        ),
      )
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : 'Unable to save scope item'
      setScreenError(message)
      throw caughtError
    }
  }

  const handleSaveActualRow = async (
    itemId: string,
    patch: ProjectItemActualUpdate,
  ) => {
    setScreenError(null)

    try {
      await updateProjectActuals(itemId, patch)
      await loadProject({ silent: true })
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : 'Unable to save tracking item'
      setScreenError(message)
      throw caughtError
    }
  }

  const handleSaveProjectTotals = async () => {
    if (includedTrackingItems.length === 0) {
      setScreenError('Add at least one included scope before adding a project update.')
      return
    }

    setIsProjectTotalsSaving(true)
    setScreenError(null)

    const actualLaborHours = roundCurrencyValue(
      projectTotalsSnapshot.actualLaborHours + parseNumericInput(projectQuickAddDraft.addedLaborHours),
    )
    const actualLaborCost = roundCurrencyValue(
      projectTotalsSnapshot.actualLaborCost + parseNumericInput(projectQuickAddDraft.addedLaborCost),
    )
    const actualMaterialCost = roundCurrencyValue(
      projectTotalsSnapshot.actualMaterialCost + parseNumericInput(projectQuickAddDraft.addedMaterialCost),
    )
    const actualEquipmentDays = roundCurrencyValue(
      projectTotalsSnapshot.actualEquipmentDays +
        parseNumericInput(projectQuickAddDraft.addedEquipmentDays),
    )
    const actualEquipmentCost = roundCurrencyValue(
      projectTotalsSnapshot.actualEquipmentCost +
        parseNumericInput(projectQuickAddDraft.addedEquipmentCost),
    )
    const actualSubcontractCost = roundCurrencyValue(
      projectTotalsSnapshot.actualSubcontractCost +
        parseNumericInput(projectQuickAddDraft.addedSubcontractCost),
    )
    const invoiceAmount = roundCurrencyValue(
      projectTotalsSnapshot.invoiceAmount + parseNumericInput(projectQuickAddDraft.addedInvoiceAmount),
    )
    const percentComplete =
      projectQuickAddDraft.percentComplete.trim().length > 0
        ? parseNumericInput(projectQuickAddDraft.percentComplete)
        : projectTotalsSnapshot.percentComplete

    const laborHourByItem = distributeTotal(actualLaborHours, includedTrackingItems, (item) => item.labor_hours ?? 0)
    const laborCostByItem = distributeTotal(actualLaborCost, includedTrackingItems, (item) => item.estimated_labor_cost ?? 0)
    const materialCostByItem = distributeTotal(actualMaterialCost, includedTrackingItems, (item) => item.material_cost ?? 0)
    const equipmentDaysByItem = distributeTotal(actualEquipmentDays, includedTrackingItems, (item) => item.equipment_days ?? 0)
    const equipmentCostByItem = distributeTotal(actualEquipmentCost, includedTrackingItems, (item) => item.estimated_equipment_cost ?? 0)
    const subcontractCostByItem = distributeTotal(actualSubcontractCost, includedTrackingItems, (item) => item.subcontract_cost ?? 0)
    const invoiceAmountByItem = distributeTotal(invoiceAmount, includedTrackingItems, (item) => item.estimated_total_cost ?? 0)

    try {
      await Promise.all(
        includedTrackingItems.map((item) => {
          const itemId = item.project_estimate_item_id

          if (!itemId) {
            return Promise.resolve()
          }

          const directCost = roundCurrencyValue(
            (laborCostByItem.get(itemId) ?? 0) +
              (materialCostByItem.get(itemId) ?? 0) +
              (equipmentCostByItem.get(itemId) ?? 0) +
              (subcontractCostByItem.get(itemId) ?? 0),
          )

          return updateProjectActuals(itemId, {
            actual_equipment_breakdown: [],
            actual_equipment_cost: equipmentCostByItem.get(itemId) ?? 0,
            actual_equipment_days: equipmentDaysByItem.get(itemId) ?? 0,
            actual_labor_breakdown: [],
            actual_labor_cost: laborCostByItem.get(itemId) ?? 0,
            actual_labor_hours: laborHourByItem.get(itemId) ?? 0,
            actual_material_breakdown: [],
            actual_material_cost: materialCostByItem.get(itemId) ?? 0,
            actual_overhead_cost: calculateActualOverheadCost(directCost, item.overhead_percent),
            actual_profit_amount: 0,
            actual_subcontract_cost: subcontractCostByItem.get(itemId) ?? 0,
            invoice_amount: invoiceAmountByItem.get(itemId) ?? 0,
            percent_complete: percentComplete,
          })
        }),
      )
      await loadProject({ silent: true })
      setProjectQuickAddDraft(emptyProjectQuickAddDraft())
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : 'Unable to save project totals'
      setScreenError(message)
    } finally {
      setIsProjectTotalsSaving(false)
    }
  }

  const handleCreateScope = async (draft: {
    itemName: string
    sectionCode?: string
    sectionName: string
    unit: string
  }) => {
    if (!projectId) {
      return
    }

    setIsScopeMutating(true)
    setScreenError(null)

    try {
      const normalizedItems = sortScopeItems(items)
      const sectionCode = draft.sectionCode?.trim() || getNextSectionCode(normalizedItems)
      const sectionName = draft.sectionName.trim()
      const itemCode = getNextItemCode(normalizedItems, sectionCode)
      const seedItem =
        normalizedItems.find((item) => item.section_code?.trim() === sectionCode) ??
        normalizedItems[normalizedItems.length - 1]

      await createProjectScope({
        projectId,
        itemCode,
        itemName: draft.itemName.trim(),
        overheadPercent: seedItem?.overhead_percent ?? 0,
        profitPercent: seedItem?.profit_percent ?? 0,
        sectionCode,
        sectionName,
        unit: draft.unit.trim().toUpperCase() || seedItem?.unit?.trim().toUpperCase() || 'EA',
      })

      await loadProject({ silent: true })
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : 'Unable to create scope'
      setScreenError(message)
      throw caughtError
    } finally {
      setIsScopeMutating(false)
    }
  }

  const handleDeleteScope = async (item: ProjectItemMetric) => {
    setScopeDeleteTarget(item)
  }

  const confirmDeleteScope = async () => {
    const targetItem = scopeDeleteTarget
    const itemId = targetItem?.project_estimate_item_id

    if (!itemId) {
      setScopeDeleteTarget(null)
      setScreenError('Scope is missing its estimate row id')
      return
    }

    setIsScopeMutating(true)
    setScreenError(null)

    try {
      await deleteProjectScope(itemId)
      setScopeDeleteTarget(null)
      await loadProject({ silent: true })
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : 'Unable to delete scope'
      setScreenError(message)
    } finally {
      setIsScopeMutating(false)
    }
  }

  return (
    <main className="app-screen app-screen-compact">
      <header className="project-header project-header-simple">
        <div className="project-header-copy">
          <Link className="back-link" to="/">
            ← Back
          </Link>
          <p className="eyebrow">ProfitBuilder</p>
          <h1>{project?.name ?? (isLoading ? 'Loading project…' : 'Project not found')}</h1>
          <p className="project-meta-line">
            <span>{project?.customer_name ?? 'Customer pending'}</span>
            <span>{project?.location ?? 'Location pending'}</span>
            <span>Due {project ? formatDate(project.bid_due_date) : isLoading ? 'Loading…' : 'No date'}</span>
          </p>
        </div>
        <div className="project-header-actions">
          {project?.organization_id ? (
            <button
              className="secondary-button"
              onClick={() => setIsCompanyLibraryOpen(true)}
              type="button"
            >
              Company library
            </button>
          ) : null}
          <button
            className="secondary-button"
            disabled={isLoading || !project || items.every((item) => !item.is_included)}
            onClick={handleExportProposal}
            type="button"
          >
            Export proposal
          </button>
          {project?.status ? <StatusBadge status={project.status} /> : null}
        </div>
      </header>

      {screenError ? <p className="screen-error">{screenError}</p> : null}

      <section className="metrics-grid">
        {showEstimateBuilder ? (
          <>
            <MetricCard
              label="Estimate"
              note={estimateSummary.includedCount + ' of ' + estimateSummary.itemCount + ' scopes included'}
              value={formatCurrency(estimateSummary.includedTotal)}
            />
            <MetricCard
              label="Direct cost"
              note="Labor + materials + equipment + subs"
              value={formatCurrency(estimateSummary.directCost)}
            />
            <MetricCard
              label="Markup"
              note="Overhead + profit"
              value={formatCurrency(estimateSummary.markup)}
            />
          </>
        ) : (
          <>
            <MetricCard
              label="Bid"
              value={project ? formatCurrency(project.estimated_total_cost) : '—'}
            />
            <MetricCard
              label="Actual"
              value={project ? formatCurrency(project.actual_total_cost) : '—'}
            />
            <MetricCard
              label="Profit"
              note={project ? 'Invoice ' + formatCurrency(project.invoice_amount) : undefined}
              value={project ? formatCurrency(projectProfit) : '—'}
            />
          </>
        )}
      </section>

      {scopeDeleteTarget ? (
        <FloatingPanel
          onClose={() => {
            if (!isScopeMutating) {
              setScopeDeleteTarget(null)
            }
          }}
          size="compact"
          subtitle="This removes the scope row and any tracked actuals tied to it."
          title="Delete scope?"
        >
          <div className="scope-delete-dialog">
            <div className="scope-delete-summary">
              <strong>{scopeDeleteTarget.item_name ?? 'Scope item'}</strong>
              <span>
                {(scopeDeleteTarget.item_code ?? 'Scope') +
                  ' · ' +
                  (scopeDeleteTarget.section_name ?? 'Unassigned section')}
              </span>
            </div>
            <div className="scope-delete-actions">
              <button
                className="secondary-button"
                disabled={isScopeMutating}
                onClick={() => setScopeDeleteTarget(null)}
                type="button"
              >
                Keep scope
              </button>
              <button
                className="secondary-button secondary-button-danger"
                disabled={isScopeMutating}
                onClick={() => {
                  void confirmDeleteScope()
                }}
                type="button"
              >
                {isScopeMutating ? 'Deleting…' : 'Delete scope'}
              </button>
            </div>
          </div>
        </FloatingPanel>
      ) : null}

      {project?.organization_id && isCompanyLibraryOpen ? (
        <FloatingPanel
          onClose={() => setIsCompanyLibraryOpen(false)}
          title="Company library"
          subtitle="Keep labor, equipment, and material prefills handy for the bid builder and advanced item editor."
        >
          <CompanyLibraryPanel
            employees={employeeLibrary}
            equipment={equipmentLibrary}
            hideHeader
            isBusy={isLibrarySaving}
            materials={materialLibrary}
            onCreateEmployee={handleCreateEmployeeLibraryItem}
            onCreateEquipment={handleCreateEquipmentLibraryItem}
            onCreateMaterial={handleCreateMaterialLibraryItem}
            onDeleteEmployee={handleDeleteEmployeeLibraryItem}
            onDeleteEquipment={handleDeleteEquipmentLibraryItem}
            onDeleteMaterial={handleDeleteMaterialLibraryItem}
            unitOptions={terminalItems.map((item) => item.unit ?? 'EA')}
          />
        </FloatingPanel>
      ) : null}

      {showEstimateBuilder ? (
        <article className="panel panel-large">
          <div className="panel-heading panel-heading-compact">
            <div>
              <h2>Bid builder</h2>
              <p className="panel-meta">
                Keep the bid in the table. Open Labor, Materials, or Equipment to pull company rates without leaving the page.
              </p>
              <div className="project-mobile-panel-pills" aria-hidden="true">
                <span className="dashboard-mobile-chip">Tap a scope to edit</span>
                <span className="dashboard-mobile-chip">{terminalItems.length} scopes</span>
              </div>
            </div>
            <span className="section-count">{isLoading ? '—' : terminalItems.length}</span>
          </div>

          {isLoading ? (
            <div className="panel-empty">Loading bid builder…</div>
          ) : (
            <ProjectEstimateBuilder
              employeeLibrary={employeeLibrary}
              equipmentLibrary={equipmentLibrary}
              isScopeMutating={isScopeMutating}
              items={terminalItems}
              materialLibrary={materialLibrary}
              onCreateEmployeeLibraryItem={handleCreateEmployeeLibraryItem}
              onCreateEquipmentLibraryItem={handleCreateEquipmentLibraryItem}
              onCreateMaterialLibraryItem={handleCreateMaterialLibraryItem}
              onCreateScope={handleCreateScope}
              onDeleteScope={handleDeleteScope}
              onSaveRow={handleSaveEstimateRow}
              readOnly={projectMode === 'closed-estimate'}
            />
          )}
        </article>
      ) : (
        <article className="panel panel-large">
          <div className="panel-heading panel-heading-compact">
            <div>
              <h2>{prefersProjectTotals ? 'Project tracking' : 'Terminal items'}</h2>
              <p className="panel-meta">
                {prefersProjectTotals
                  ? 'You prefer project totals for labor and materials. The summary cards above stay primary, and the task / WBS breakdown is there when you need extra detail.'
                  : 'Track active and completed jobs in the same table rhythm as the bid builder, with each scope editable from the same bucket controls.'}
              </p>
              <div className="project-mobile-panel-pills" aria-hidden="true">
                <span className="dashboard-mobile-chip">
                  {prefersProjectTotals ? 'Project totals first' : 'Tap a scope to track'}
                </span>
                <span className="dashboard-mobile-chip">{terminalItems.length} scopes</span>
              </div>
            </div>
            <span className="section-count">{isLoading ? '—' : terminalItems.length}</span>
          </div>

          <section className="item-detail-section project-totals-tracker">
            <div className="item-detail-section-heading">
              <div>
                <h2>Quick update</h2>
                <p>
                  {prefersProjectTotals
                    ? 'Add what happened today, this week, or whenever you think of it. We roll it into project totals and keep the WBS tucked away.'
                    : 'Add what happened today without opening every scope. We roll it into project totals and keep the detailed WBS below for later.'}
                </p>
              </div>
              <strong>{formatCurrency(projectTotalsPreview.totalCost)}</strong>
            </div>
            <div className="project-quick-update-summary">
              <div className="item-detail-readout">
                <span>Current actual total</span>
                <strong>{formatCurrency(currentProjectActualTotal)}</strong>
                <small>After save {formatCurrency(projectTotalsPreview.totalCost)}</small>
              </div>
              <div className="item-detail-readout">
                <span>Billing + progress</span>
                <strong>{formatCurrency(projectTotalsPreview.invoiceAmount)}</strong>
                <small>{projectTotalsPreview.percentComplete}% complete after save</small>
              </div>
              <div className="item-detail-readout item-detail-readout-stack">
                <span>Sync target</span>
                <strong>{includedTrackingItems.length} scopes</strong>
                <small>Hidden WBS stays in sync automatically</small>
              </div>
            </div>
            <div className="project-quick-update-grid">
              <label>
                Progress now (%)
                <input
                  aria-label="Progress now"
                  max="100"
                  min="0"
                  onChange={(event) =>
                    setProjectQuickAddDraft((current) => ({
                      ...current,
                      percentComplete: event.target.value,
                    }))
                  }
                  placeholder={String(projectTotalsSnapshot.percentComplete)}
                  step="1"
                  type="number"
                  value={projectQuickAddDraft.percentComplete}
                />
              </label>
              <label>
                Add invoice amount
                <input
                  aria-label="Add invoice amount"
                  onChange={(event) =>
                    setProjectQuickAddDraft((current) => ({
                      ...current,
                      addedInvoiceAmount: event.target.value,
                    }))
                  }
                  placeholder="0"
                  step="0.01"
                  type="number"
                  value={projectQuickAddDraft.addedInvoiceAmount}
                />
              </label>
              <label>
                Add labor hours
                <input
                  aria-label="Add labor hours"
                  onChange={(event) =>
                    setProjectQuickAddDraft((current) => ({
                      ...current,
                      addedLaborHours: event.target.value,
                    }))
                  }
                  placeholder="0"
                  step="0.1"
                  type="number"
                  value={projectQuickAddDraft.addedLaborHours}
                />
              </label>
              <label>
                Add labor cost
                <input
                  aria-label="Add labor cost"
                  onChange={(event) =>
                    setProjectQuickAddDraft((current) => ({
                      ...current,
                      addedLaborCost: event.target.value,
                    }))
                  }
                  placeholder="0"
                  step="0.01"
                  type="number"
                  value={projectQuickAddDraft.addedLaborCost}
                />
              </label>
              <label>
                Add material cost
                <input
                  aria-label="Add material cost"
                  onChange={(event) =>
                    setProjectQuickAddDraft((current) => ({
                      ...current,
                      addedMaterialCost: event.target.value,
                    }))
                  }
                  placeholder="0"
                  step="0.01"
                  type="number"
                  value={projectQuickAddDraft.addedMaterialCost}
                />
              </label>
            </div>
            <details className="project-quick-update-details">
              <summary>Other costs</summary>
              <div className="item-detail-grid project-quick-update-details-grid">
                <label>
                  Add equipment days
                  <input
                    aria-label="Add equipment days"
                    onChange={(event) =>
                      setProjectQuickAddDraft((current) => ({
                        ...current,
                        addedEquipmentDays: event.target.value,
                      }))
                    }
                    placeholder="0"
                    step="0.1"
                    type="number"
                    value={projectQuickAddDraft.addedEquipmentDays}
                  />
                </label>
                <label>
                  Add equipment cost
                  <input
                    aria-label="Add equipment cost"
                    onChange={(event) =>
                      setProjectQuickAddDraft((current) => ({
                        ...current,
                        addedEquipmentCost: event.target.value,
                      }))
                    }
                    placeholder="0"
                    step="0.01"
                    type="number"
                    value={projectQuickAddDraft.addedEquipmentCost}
                  />
                </label>
                <label>
                  Add subcontract cost
                  <input
                    aria-label="Add subcontract cost"
                    onChange={(event) =>
                      setProjectQuickAddDraft((current) => ({
                        ...current,
                        addedSubcontractCost: event.target.value,
                      }))
                    }
                    placeholder="0"
                    step="0.01"
                    type="number"
                    value={projectQuickAddDraft.addedSubcontractCost}
                  />
                </label>
                <div className="item-detail-readout item-detail-readout-stack">
                  <span>Overhead</span>
                  <strong>{formatCurrency(projectTotalsPreview.overheadCost)}</strong>
                  <small>Calculated from direct actuals</small>
                </div>
              </div>
            </details>
            {!isReadOnly ? (
              <div className="item-detail-savebar">
                <button
                  className="primary-button"
                  disabled={
                    isProjectTotalsSaving ||
                    includedTrackingItems.length === 0 ||
                    !hasProjectQuickAddChanges
                  }
                  onClick={() => {
                    void handleSaveProjectTotals()
                  }}
                  type="button"
                >
                  {isProjectTotalsSaving ? 'Saving…' : 'Add update to project'}
                </button>
              </div>
            ) : null}
          </section>

          {prefersProjectTotals ? (
            <>
              <div className="project-tracking-preference-banner">
                <div className="project-tracking-preference-copy">
                  <span className="eyebrow">Tracking default</span>
                  <strong>Project totals first</strong>
                  <p className="panel-meta">
                    Keep labor and materials simple at the project level, then open the task / WBS
                    breakdown only when you want scope-by-scope detail.
                  </p>
                </div>
                <button
                  className="secondary-button"
                  onClick={() => setIsTrackingBreakdownOpen((current) => !current)}
                  type="button"
                >
                  {isTrackingBreakdownOpen ? 'Hide task / WBS breakdown' : 'Show task / WBS breakdown'}
                </button>
              </div>
            </>
          ) : null}

          {isLoading ? (
            <div className="panel-empty">Loading terminal items…</div>
          ) : terminalItems.length === 0 ? (
            <div className="panel-empty">No terminal items yet.</div>
          ) : prefersProjectTotals && !isTrackingBreakdownOpen ? (
            <div className="panel-empty">
              Task / WBS breakdown is hidden for this preference. Use the button above if you need
              scope-level tracking.
            </div>
          ) : (
            <TrackingTable
              employeeLibrary={employeeLibrary}
              equipmentLibrary={equipmentLibrary}
              isSaving={null}
              items={terminalItems}
              materialLibrary={materialLibrary}
              onCreateEmployeeLibraryItem={handleCreateEmployeeLibraryItem}
              onCreateEquipmentLibraryItem={handleCreateEquipmentLibraryItem}
              onCreateMaterialLibraryItem={handleCreateMaterialLibraryItem}
              onSaveRow={handleSaveActualRow}
              readOnly={isReadOnly}
            />
          )}
        </article>
      )}
    </main>
  )
}
