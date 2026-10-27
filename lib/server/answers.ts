import 'server-only'

/**
 * Correct answers live ONLY here (server side). They are never included in any
 * API response, page props, or client bundle (this file imports `server-only`).
 */
const ANSWERS: readonly number[] = [
  60795, // Q15  6,755 × 9
  39974, // Q16  869 × 46
  74682, // Q17  922 × 81
  10962, // Q18  783 × 14
  10260, // Q19  684 × 15
  14300, // Q20  650 × 22
  93425, // Q21  2,525 × 37
  25215, // Q22  615 × 41
]

export function correctAnswerFor(questionIndex: number): number | undefined {
  return ANSWERS[questionIndex]
}

/** Accepts "60795" or "60,795" (properly grouped). Returns null for anything else. */
export function parseAnswer(raw: string): number | null {
  const s = raw.trim().replace(/\s+/g, '')
  if (s.length === 0 || s.length > 14) return null
  if (/^\d+$/.test(s) || /^\d{1,3}(,\d{3})+$/.test(s)) {
    const n = Number(s.replace(/,/g, ''))
    return Number.isSafeInteger(n) ? n : null
  }
  return null
}

export function isCorrect(questionIndex: number, parsed: number): boolean {
  return correctAnswerFor(questionIndex) === parsed
}
