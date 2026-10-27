'use client'
import { sound } from '@/lib/client/sound'
import { useSoundPrefs } from '@/lib/client/useSound'

/** Two small switches: background music and sound effects. */
export function SoundToggle() {
  const { music, sfx } = useSoundPrefs()
  return (
    <div className="snd" role="group" aria-label="Sound settings">
      <button type="button" aria-pressed={music} aria-label={music ? 'Turn music off' : 'Turn music on'} title="Music" className={music ? 'on' : ''} onClick={() => { sound.setMusic(!music); sound.init() }}>♪</button>
      <button type="button" aria-pressed={sfx} aria-label={sfx ? 'Turn sound effects off' : 'Turn sound effects on'} title="Sound effects" className={sfx ? 'on' : ''} onClick={() => { sound.setSfx(!sfx); sound.init() }}>{sfx ? '🔊' : '🔈'}</button>
    </div>
  )
}
