import {
  calculateActualOverheadCost,
  calculateExtendedCost,
  deriveUnitCost,
  parseNumericInput,
  roundCurrencyValue,
} from './item-detail'
import type { ProjectEstimateItemUpdate, ProjectItemMetric } from './models'

export type EstimateBuilderDraft = {
  isIncluded: boolean
  itemName: string
  quantity: string
  unit: string
  materialCostPerUnit: string
  laborHours: string
  laborRate: string
  equipmentDays: string
  equipmentRate: string
  subcontractCost: string
  overheadPercent: string
  profitPercent: string
}

export type EstimateBuilderDerived = {
  quantity: number
  materialCostPerUnit: number
  laborHours: number
  laborRate: number
  equipmentDays: number
  equipmentRate: number
  subcontractCost: number
  overheadPercent: number
  profitPercent: number
  materialCost: number
  laborCost: number
  equipmentCost: number
  directCost: number
  overheadCost: number
  profitCost: number
  totalCost: number
}

const resolveNumericPatchValue = (
  patchValue: number | null | undefined,
  fallbackValue: number | null | undefined,
) => (typeof patchValue === 'number' ? patchValue : fallbackValue ?? 0)

export const toEstimateBuilderDraft = (item: ProjectItemMetric): EstimateBuilderDraft => ({
  isIncluded: item.is_included ?? false,
  itemName: item.item_name ?? '',
  quantity: String(item.quantity ?? 0),
  unit: (item.unit ?? 'EA').toUpperCase(),
  materialCostPerUnit: String(deriveUnitCost(item.material_cost ?? 0, item.quantity ?? 0)),
  laborHours: String(item.labor_hours ?? 0),
  laborRate: String(item.labor_rate ?? 0),
  equipmentDays: String(item.equipment_days ?? 0),
  equipmentRate: String(item.equipment_rate ?? 0),
  subcontractCost: String(item.subcontract_cost ?? 0),
  overheadPercent: String(item.overhead_percent ?? 0),
  profitPercent: String(item.profit_percent ?? 0),
})

export const calculateEstimateBuilderDerived = (
  draft: EstimateBuilderDraft,
): EstimateBuilderDerived => {
  const quantity = parseNumericInput(draft.quantity)
  const materialCostPerUnit = parseNumericInput(draft.materialCostPerUnit)
  const laborHours = parseNumericInput(draft.laborHours)
  const laborRate = parseNumericInput(draft.laborRate)
  const equipmentDays = parseNumericInput(draft.equipmentDays)
  const equipmentRate = parseNumericInput(draft.equipmentRate)
  const subcontractCost = parseNumericInput(draft.subcontractCost)
  const overheadPercent = parseNumericInput(draft.overheadPercent)
  const profitPercent = parseNumericInput(draft.profitPercent)
  const materialCost = calculateExtendedCost(quantity, materialCostPerUnit)
  const laborCost = calculateExtendedCost(laborHours, laborRate)
  const equipmentCost = calculateExtendedCost(equipmentDays, equipmentRate)
  const directCost = roundCurrencyValue(laborCost + materialCost + equipmentCost + subcontractCost)
  const overheadCost = calculateActualOverheadCost(directCost, overheadPercent)
  const profitCost = calculateActualOverheadCost(directCost, profitPercent)

  return {
    quantity,
    materialCostPerUnit,
    laborHours,
    laborRate,
    equipmentDays,
    equipmentRate,
    subcontractCost,
    overheadPercent,
    profitPercent,
    materialCost,
    laborCost,
    equipmentCost,
    directCost,
    overheadCost,
    profitCost,
    totalCost: roundCurrencyValue(directCost + overheadCost + profitCost),
  }
}

export const toProjectEstimateItemPatch = (
  draft: EstimateBuilderDraft,
): ProjectEstimateItemUpdate => {
  const derived = calculateEstimateBuilderDerived(draft)

  return {
    item_name: draft.itemName.trim(),
    is_included: draft.isIncluded,
    quantity: derived.quantity,
    unit: draft.unit.trim().toUpperCase(),
    material_cost: derived.materialCost,
    labor_hours: derived.laborHours,
    labor_rate: derived.laborRate,
    equipment_days: derived.equipmentDays,
    equipment_rate: derived.equipmentRate,
    subcontract_cost: derived.subcontractCost,
    overhead_percent: derived.overheadPercent,
    profit_percent: derived.profitPercent,
  }
}

export const applyEstimatePatchToProjectItemMetric = (
  item: ProjectItemMetric,
  patch: ProjectEstimateItemUpdate,
): ProjectItemMetric => {
  const quantity = resolveNumericPatchValue(patch.quantity, item.quantity)
  const laborHours = resolveNumericPatchValue(patch.labor_hours, item.labor_hours)
  const laborRate = resolveNumericPatchValue(patch.labor_rate, item.labor_rate)
  const materialCost = resolveNumericPatchValue(patch.material_cost, item.material_cost)
  const equipmentDays = resolveNumericPatchValue(patch.equipment_days, item.equipment_days)
  const equipmentRate = resolveNumericPatchValue(patch.equipment_rate, item.equipment_rate)
  const subcontractCost = resolveNumericPatchValue(patch.subcontract_cost, item.subcontract_cost)
  const overheadPercent = resolveNumericPatchValue(patch.overhead_percent, item.overhead_percent)
  const profitPercent = resolveNumericPatchValue(patch.profit_percent, item.profit_percent)
  const laborCost = calculateExtendedCost(laborHours, laborRate)
  const equipmentCost = calculateExtendedCost(equipmentDays, equipmentRate)
  const directCost = roundCurrencyValue(laborCost + materialCost + equipmentCost + subcontractCost)
  const overheadCost = calculateActualOverheadCost(directCost, overheadPercent)
  const profitCost = calculateActualOverheadCost(directCost, profitPercent)

  return {
    ...item,
    item_name: patch.item_name ?? item.item_name,
    is_included: typeof patch.is_included === 'boolean' ? patch.is_included : item.is_included,
    quantity,
    unit: patch.unit ?? item.unit,
    material_cost: materialCost,
    labor_hours: laborHours,
    labor_rate: laborRate,
    equipment_days: equipmentDays,
    equipment_rate: equipmentRate,
    subcontract_cost: subcontractCost,
    overhead_percent: overheadPercent,
    profit_percent: profitPercent,
    estimated_labor_cost: laborCost,
    estimated_equipment_cost: equipmentCost,
    estimated_overhead_cost: overheadCost,
    estimated_profit_cost: profitCost,
    estimated_total_cost: roundCurrencyValue(directCost + overheadCost + profitCost),
  }
}
