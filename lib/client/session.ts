// Per-browser credentials (so a student/teacher can reconnect after a refresh or lost connection).
// localStorage may be unavailable (private mode etc.), so every access is guarded.

export interface PlayerSession { playerId: string; playerToken: string; nickname: string; car: number }
export interface TeacherSession { teacherToken: string }

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch { return null }
}
function write(key: string, value: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(value)) } catch { /* ignore */ }
}
function remove(key: string) {
  try { window.localStorage.removeItem(key) } catch { /* ignore */ }
}

export const getPlayerSession = (code: string) => read<PlayerSession>(`mr:player:${code}`)
export const savePlayerSession = (code: string, s: PlayerSession) => { write(`mr:player:${code}`, s); write('mr:last', { role: 'player', code }) }
export const clearPlayerSession = (code: string) => { remove(`mr:player:${code}`); if (getLast()?.code === code) remove('mr:last') }

export const getTeacherSession = (code: string) => read<TeacherSession>(`mr:teacher:${code}`)
export const saveTeacherSession = (code: string, s: TeacherSession) => { write(`mr:teacher:${code}`, s); write('mr:last', { role: 'teacher', code }) }
export const clearTeacherSession = (code: string) => remove(`mr:teacher:${code}`)

export const getLast = () => read<{ role: 'player' | 'teacher'; code: string }>('mr:last')
