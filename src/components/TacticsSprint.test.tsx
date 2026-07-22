import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { createTacticProgress } from '../tactics/tactics'
import { TacticsSprint } from './TacticsSprint'

describe('Tactics Sprint', () => {
  it('gives a new player an immediate, non-spoiling local first puzzle', () => {
    const markup = renderToStaticMarkup(
      <TacticsSprint
        progress={createTacticProgress()}
        onRecordAttempt={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    expect(markup).toContain('Tactics Sprint')
    expect(markup).toContain('Puzzle 1 of 3')
    expect(markup).toContain('Black to move')
    expect(markup).toContain('Find the saved local solution')
    expect(markup).toContain('Hint')
    expect(markup).toContain('Reveal line')
    expect(markup).toContain('tabindex="0"')

    // The first puzzle’s line, topic, and title remain out of the DOM until
    // the player completes or explicitly reveals it. Board coordinates stay
    // accessible, but the UI never labels one as the answer before a hint.
    expect(markup).not.toContain('Qh4#')
    expect(markup).not.toContain('Open King')
    expect(markup).not.toContain('mate-in-one')
    expect(markup).not.toContain('Solution:')
  })
})
