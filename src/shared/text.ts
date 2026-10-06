// Text helpers for matching what you type against posting text.

/** Lowercase without accents, so "montreal" finds "Montréal". */
export function fold(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

const WORD = /[\p{L}\p{N}]/u

/** True for a letter or digit in any script. */
export function isWordChar(ch: string | undefined): boolean {
  return !!ch && WORD.test(ch)
}

/**
 * Folds text and records where each folded character came from, so a match found in the
 * folded text can be marked in the original. `map` has an extra entry for the end, and is
 * null when every character folds to exactly one character (the usual case).
 */
export function foldWithMap(raw: string): { text: string; map: number[] | null } {
  const whole = fold(raw)
  if (whole.length === raw.length) return { text: whole, map: null }
  let text = ''
  const map: number[] = []
  let i = 0
  for (const ch of raw) {
    const folded = fold(ch)
    for (let k = 0; k < folded.length; k++) map.push(i)
    text += folded
    i += ch.length
  }
  map.push(i)
  return { text, map }
}
