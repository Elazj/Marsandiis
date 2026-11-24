export type SalesCurrency = 'GMD' | 'XOF'

const numberFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

export const CFA_BLOCK = 5000

export const money = (value: unknown, currency: SalesCurrency) => `${numberFormat.format(Number(value) || 0)} ${currency}`
export const moneyValue = (value: unknown) => Number(value) || 0
export const fromGmd = (value: unknown, currency: SalesCurrency, rate: unknown) => moneyValue(value) * (currency === 'XOF' ? moneyValue(rate) : 1)
export const gmdPerCfaBlock = (rate: unknown) => {
  const value = Number(rate)
  return isFinite(value) && value > 0 ? CFA_BLOCK / value : 0
}
export const cfaRateFromGmd = (gmd: unknown) => {
  const value = Number(gmd)
  return isFinite(value) && value > 0 ? CFA_BLOCK / value : 0
}
export const cfaRateLabel = (rate: unknown) => {
  const gmd = gmdPerCfaBlock(rate)
  return gmd > 0 ? `5000 CFA = ${numberFormat.format(gmd)} GMD` : 'not configured'
}
