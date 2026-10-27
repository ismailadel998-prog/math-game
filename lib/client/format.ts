export function ordinal(n: number) {
  const s = ['TH', 'ST', 'ND', 'RD']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}
