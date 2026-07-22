import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { BotProfilePicker } from './BotProfilePicker'

describe('BotProfilePicker', () => {
  it('makes the named local opponent roster and the selected opening cue visible', () => {
    const markup = renderToStaticMarkup(
      <BotProfilePicker selectedId="rowan-pike" customEngine={false} onSelect={vi.fn()} />,
    )

    expect(markup).toContain('Choose a local opponent')
    expect(markup).toContain('Mira Vale')
    expect(markup).toContain('Rowan Pike')
    expect(markup).toContain('Nia Cross')
    expect(markup).toContain('aria-pressed="true"')
    expect(markup).toContain('Claims central space')
  })

  it('explains when custom engine limits take precedence', () => {
    const markup = renderToStaticMarkup(
      <BotProfilePicker selectedId="mira-vale" customEngine onSelect={vi.fn()} />,
    )

    expect(markup).toContain('Custom UCI limits override this opponent’s default strength')
  })
})
