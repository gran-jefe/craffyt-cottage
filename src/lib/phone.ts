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
