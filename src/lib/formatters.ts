const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
})

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

export const formatCurrency = (value: number | null | undefined) =>
  currencyFormatter.format(value ?? 0)

export const formatNumber = (value: number | null | undefined) =>
  numberFormatter.format(value ?? 0)

export const formatDate = (value: string | null | undefined) => {
  if (!value) {
    return 'No date'
  }

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return dateFormatter.format(parsed)
}
