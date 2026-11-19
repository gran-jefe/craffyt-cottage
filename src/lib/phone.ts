/**
 * Phone numbers for customers in Nigeria and abroad.
 *
 * Everything is stored in E.164 ("+2348031234567", "+447700900123") so admin WhatsApp links
 * work the same for every customer. Nigerian numbers may be typed the local way (0803…) or
 * without the leading 0; any other country needs its code (+44…, 0044…).
 */

export type PhoneResult = { ok: true; e164: string } | { ok: false; error: string }

/** Nigerian mobile numbers after the country code: 70x, 80x, 81x, 90x, 91x + 7 digits. */
const NG_NATIONAL = /^[789][01]\d{8}$/

export function parsePhone(input: string): PhoneResult {
  const raw = input.trim()
  if (!raw) return { ok: false, error: 'Enter a phone or WhatsApp number so we can reach you about delivery.' }
  if (/[a-z]/i.test(raw)) return { ok: false, error: 'Use digits only, plus an optional + at the start.' }

  let digits = raw.replace(/\D/g, '')
  const international = raw.startsWith('+') || digits.startsWith('00')
  // "0044…" is the dial-out form of "+44…".
  if (!raw.startsWith('+') && digits.startsWith('00')) digits = digits.slice(2)

  if (international) {
    if (digits.startsWith('234')) return nigerian(digits.slice(3).replace(/^0/, ''))
    // E.164 allows up to 15 digits; under 8 is too short to be a real number anywhere.
    if (digits.length < 8 || digits.length > 15 || digits.startsWith('0')) {
      return { ok: false, error: 'This international number doesn’t look complete. Check the country code and number.' }
    }
    return { ok: true, e164: `+${digits}` }
  }

  // No + or 00: read it as a Nigerian number.
  if (digits.startsWith('234') && digits.length === 13) return nigerian(digits.slice(3))
  if (digits.startsWith('0') && digits.length === 11) return nigerian(digits.slice(1))
  if (digits.length === 10 && NG_NATIONAL.test(digits)) return nigerian(digits)
  return {
    ok: false,
    error:
      'Enter an 11-digit Nigerian number (e.g. 0803 123 4567), or start with + and your country code if you’re abroad (e.g. +44 7700 900123).',
  }
}

function nigerian(national: string): PhoneResult {
  return NG_NATIONAL.test(national)
    ? { ok: true, e164: `+234${national}` }
    : { ok: false, error: 'This Nigerian number doesn’t look right. It should be 11 digits, like 0803 123 4567.' }
}

/** "+2348031234567" → "+234 803 123 4567"; other countries are shown as stored. */
export function formatPhone(value: string): string {
  const m = /^\+234(\d{3})(\d{3})(\d{4})$/.exec(value.replace(/\s/g, ''))
  return m ? `+234 ${m[1]} ${m[2]} ${m[3]}` : value
}

/**
 * Digits for a wa.me link. Also copes with numbers saved before this format existed
 * (e.g. "0803 123 4567"). Returns null when the number can't be turned into one.
 */
export function whatsappDigits(value: string): string | null {
  const parsed = parsePhone(value)
  return parsed.ok ? parsed.e164.slice(1) : null
}

/* ---------- Country picker ---------- */

export interface Country {
  /** ISO 3166 alpha-2, e.g. "NG". */
  iso: string
  name: string
  /** Calling code without "+", e.g. "234". */
  dial: string
}

/** Where customers most often order from: shown first in the picker. */
export const POPULAR_COUNTRIES = ['NG', 'GB', 'US', 'CA', 'GH', 'AE', 'ZA', 'IE']

export const COUNTRIES: Country[] = [
  ['AU', 'Australia', '61'], ['AT', 'Austria', '43'], ['BE', 'Belgium', '32'], ['BJ', 'Benin', '229'],
  ['BW', 'Botswana', '267'], ['BR', 'Brazil', '55'], ['BF', 'Burkina Faso', '226'], ['CM', 'Cameroon', '237'],
  ['CA', 'Canada', '1'], ['TD', 'Chad', '235'], ['CN', 'China', '86'], ['CI', "Côte d'Ivoire", '225'],
  ['DK', 'Denmark', '45'], ['EG', 'Egypt', '20'], ['ET', 'Ethiopia', '251'], ['FI', 'Finland', '358'],
  ['FR', 'France', '33'], ['GA', 'Gabon', '241'], ['GM', 'Gambia', '220'], ['DE', 'Germany', '49'],
  ['GH', 'Ghana', '233'], ['GR', 'Greece', '30'], ['GN', 'Guinea', '224'], ['HK', 'Hong Kong', '852'],
  ['IN', 'India', '91'], ['IE', 'Ireland', '353'], ['IL', 'Israel', '972'], ['IT', 'Italy', '39'],
  ['JM', 'Jamaica', '1'], ['JP', 'Japan', '81'], ['KE', 'Kenya', '254'], ['KW', 'Kuwait', '965'],
  ['LR', 'Liberia', '231'], ['MY', 'Malaysia', '60'], ['ML', 'Mali', '223'], ['MA', 'Morocco', '212'],
  ['NL', 'Netherlands', '31'], ['NZ', 'New Zealand', '64'], ['NE', 'Niger', '227'], ['NG', 'Nigeria', '234'],
  ['NO', 'Norway', '47'], ['OM', 'Oman', '968'], ['PL', 'Poland', '48'], ['PT', 'Portugal', '351'],
  ['QA', 'Qatar', '974'], ['RW', 'Rwanda', '250'], ['SA', 'Saudi Arabia', '966'], ['SN', 'Senegal', '221'],
  ['SL', 'Sierra Leone', '232'], ['SG', 'Singapore', '65'], ['ZA', 'South Africa', '27'], ['KR', 'South Korea', '82'],
  ['ES', 'Spain', '34'], ['SE', 'Sweden', '46'], ['CH', 'Switzerland', '41'], ['TZ', 'Tanzania', '255'],
  ['TG', 'Togo', '228'], ['TT', 'Trinidad and Tobago', '1'], ['TR', 'Turkey', '90'], ['UG', 'Uganda', '256'],
  ['AE', 'United Arab Emirates', '971'], ['GB', 'United Kingdom', '44'], ['US', 'United States', '1'],
  ['ZM', 'Zambia', '260'], ['ZW', 'Zimbabwe', '263'],
].map(([iso, name, dial]) => ({ iso, name, dial }))

export const DEFAULT_COUNTRY = 'NG'

export function countryByIso(iso: string): Country {
  return COUNTRIES.find((c) => c.iso === iso) ?? COUNTRIES.find((c) => c.iso === DEFAULT_COUNTRY)!
}

/** 🇳🇬 from "NG" (shows as letters on systems without flag glyphs, which still reads fine). */
export function flagOf(iso: string): string {
  return String.fromCodePoint(...iso.toUpperCase().split('').map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}

/**
 * The country a full international number belongs to (longest calling code wins).
 * Codes shared by several countries (+1) resolve to `prefer` when it matches.
 */
export function countryForE164(e164: string, prefer?: string): Country | undefined {
  const digits = e164.replace(/\D/g, '')
  const matches = COUNTRIES.filter((c) => digits.startsWith(c.dial))
  if (matches.length === 0) return undefined
  const longest = Math.max(...matches.map((c) => c.dial.length))
  const best = matches.filter((c) => c.dial.length === longest)
  return (
    best.find((c) => c.iso === prefer) ??
    POPULAR_COUNTRIES.map((iso) => best.find((c) => c.iso === iso)).find(Boolean) ??
    best[0]
  )
}

/**
 * Validates a number typed next to a country picker. A number typed with its own "+" or "00"
 * prefix is read as international and wins over the picker.
 */
export function parsePhoneForCountry(iso: string, input: string): PhoneResult {
  const raw = input.trim()
  if (!raw) return { ok: false, error: 'Enter a phone or WhatsApp number so we can reach you about delivery.' }
  const country = countryByIso(iso)
  if (raw.startsWith('+') || raw.replace(/[\s()-]/g, '').startsWith('00')) return parsePhone(raw)
  if (/[a-z]/i.test(raw)) return { ok: false, error: 'Use digits only.' }
  if (country.iso === 'NG') {
    const ng = parsePhone(raw)
    return ng.ok
      ? ng
      : { ok: false, error: 'Enter an 11-digit Nigerian number, like 0803 123 4567. Outside Nigeria? Choose your country first.' }
  }

  let national = raw.replace(/\D/g, '')
  // Pasted with the country code but no "+": 447700900123 under United Kingdom.
  if (national.startsWith(country.dial) && national.length >= country.dial.length + 7) {
    national = national.slice(country.dial.length)
  }
  // Drop the domestic trunk 0 (07700 → 7700). Italy keeps its leading 0 in international form.
  if (country.iso !== 'IT') national = national.replace(/^0+/, '')
  const total = country.dial + national
  if (national.length < 5 || total.length < 8) {
    return { ok: false, error: `This number looks too short for ${country.name}. Check it and try again.` }
  }
  if (total.length > 15) {
    return { ok: false, error: `This number looks too long for ${country.name}. Check it and try again.` }
  }
  return { ok: true, e164: `+${total}` }
}
