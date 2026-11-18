// Number and time formatting shared by the HUD, signs, labels and windows.
const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc']

// 1234 -> "1.2K", 999 -> "999".
export function short(n) {
  n = Math.floor(n)
  let i = 0
  while (n >= 1000 && i < SUFFIXES.length - 1) {
    n /= 1000
    i++
  }
  if (i === 0) return String(n)
  return `${n >= 100 ? Math.floor(n + 1e-6) : Math.floor(n * 10 + 1e-6) / 10}${SUFFIXES[i]}`
}

// Money: full digits with commas up to a million, short form above. "$3,058", "$1.2M".
export function money(n) {
  n = Math.floor(Math.max(0, n))
  if (n >= 1e6) return `$${short(n)}`
  return `$${n.toLocaleString('en-US')}`
}

// XP with up to 2 decimals, trailing zeros dropped: 1.25, 1.56, 40.
export function num(n) {
  return n >= 100 ? short(n) : String(Math.round(n * 100) / 100)
}

// 754 -> "12:34"; 3725 -> "1:02:05".
export function clock(seconds) {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

// 202 -> "3m 22s".
export function minsSecs(seconds) {
  const s = Math.max(0, Math.ceil(seconds))
  const m = Math.floor(s / 60)
  return m ? `${m}m ${s % 60}s` : `${s}s`
}
