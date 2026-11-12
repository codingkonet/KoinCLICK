export interface CurrencyInfo {
  code: string
  symbol: string
  name: string
  flag: string
  /** Rate relative to 1 USD (e.g. 1 USD = 0.92 EUR) */
  ratePerUsd: number
}

const CUSTOM_RATES_KEY = 'koinclick_custom_fx_rates'

export const DEFAULT_CURRENCIES: CurrencyInfo[] = [
  { code: 'USD', symbol: '$', name: 'US Dollar', flag: '🇺🇸', ratePerUsd: 1.0 },
  { code: 'EUR', symbol: '€', name: 'Euro', flag: '🇪🇺', ratePerUsd: 0.92 },
  { code: 'GBP', symbol: '£', name: 'British Pound', flag: '🇬🇧', ratePerUsd: 0.79 },
  { code: 'MAD', symbol: 'DH', name: 'Moroccan Dirham', flag: '🇲🇦', ratePerUsd: 9.95 },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', flag: '🇨🇦', ratePerUsd: 1.39 },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', flag: '🇦🇺', ratePerUsd: 1.53 },
  { code: 'CHF', symbol: 'Fr', name: 'Swiss Franc', flag: '🇨🇭', ratePerUsd: 0.88 },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', flag: '🇯🇵', ratePerUsd: 154.5 },
  { code: 'AED', symbol: 'AED', name: 'UAE Dirham', flag: '🇦🇪', ratePerUsd: 3.67 },
  { code: 'SAR', symbol: 'SR', name: 'Saudi Riyal', flag: '🇸🇦', ratePerUsd: 3.75 },
]

export function getCustomRatesMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(CUSTOM_RATES_KEY)
    if (!raw) return {}
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export function saveCustomRatesMap(rates: Record<string, number>) {
  localStorage.setItem(CUSTOM_RATES_KEY, JSON.stringify(rates))
}

export function resetCustomRatesMap() {
  localStorage.removeItem(CUSTOM_RATES_KEY)
}

export function getSupportedCurrencies(): CurrencyInfo[] {
  const custom = getCustomRatesMap()
  return DEFAULT_CURRENCIES.map((c) => ({
    ...c,
    ratePerUsd:
      c.code === 'USD'
        ? 1.0
        : custom[c.code] && Number(custom[c.code]) > 0
          ? Number(custom[c.code])
          : c.ratePerUsd,
  }))
}

export const SUPPORTED_CURRENCIES: CurrencyInfo[] = DEFAULT_CURRENCIES

export function getCurrencyInfo(code?: string): CurrencyInfo {
  const list = getSupportedCurrencies()
  return list.find((c) => c.code === (code || 'USD').toUpperCase()) || list[0]
}

/**
 * Converts an amount from `fromCurrency` to `toCurrency` using USD pivot rates.
 */
export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string
): number {
  if (!Number.isFinite(amount)) return 0
  if (fromCurrency === toCurrency) return amount
  const from = getCurrencyInfo(fromCurrency)
  const to = getCurrencyInfo(toCurrency)
  const amountInUsd = amount / from.ratePerUsd
  return amountInUsd * to.ratePerUsd
}

/**
 * Formats an amount into a human-readable currency string.
 */
export function formatMoney(
  amount: number,
  currencyCode: string = 'USD',
  options?: { compact?: boolean; decimals?: number }
): string {
  const info = getCurrencyInfo(currencyCode)
  const isZeroDecimal = info.code === 'JPY'
  const decimals = options?.decimals ?? (isZeroDecimal ? 0 : 2)

  const formattedNumber = Number(amount || 0).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

  if (['MAD', 'AED', 'SAR', 'CHF'].includes(info.code)) {
    return `${formattedNumber} ${info.symbol}`
  }
  return `${info.symbol}${formattedNumber}`
}
