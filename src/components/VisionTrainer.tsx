import { useMemo, useState } from 'react'
import type { Square } from 'chess.js'

const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
const ranks = [8, 7, 6, 5, 4, 3, 2, 1] as const

function randomSquare(previous?: Square): Square {
  const choices = files.flatMap((file) => ranks.map((rank) => `${file}${rank}` as Square))
  const filtered = choices.filter((square) => square !== previous)
  return filtered[Math.floor(Math.random() * filtered.length)]
}

export function VisionTrainer() {
  const [target, setTarget] = useState<Square>(() => randomSquare())
  const [score, setScore] = useState(0)
  const [attempts, setAttempts] = useState(0)
  const [feedback, setFeedback] = useState('Find the named coordinate without labels.')
  const squares = useMemo(() => ranks.flatMap((rank) => files.map((file) => `${file}${rank}` as Square)), [])

  const choose = (square: Square) => {
    const correct = square === target
    setAttempts((value) => value + 1)
    if (correct) {
      setScore((value) => value + 1)
      setFeedback('Correct. Next square ready.')
      setTarget((current) => randomSquare(current))
    } else {
      setFeedback(`${square} is not ${target}. Try again.`)
    }
  }

  return (
    <article className="trainer-card vision-trainer">
      <div>
        <span className="eyebrow">Vision sprint</span>
        <h3>Click {target}</h3>
        <p>{feedback}</p>
        <div className="vision-score">Score {score} / {attempts}</div>
      </div>
      <div className="vision-board" aria-label={`Find ${target}`}>
        {squares.map((square) => {
          const fileIndex = files.indexOf(square[0] as (typeof files)[number])
          const rank = Number(square[1])
          const light = (fileIndex + rank) % 2 === 0
          return (
            <button
              type="button"
              key={square}
              className={light ? 'vision-square vision-square--light' : 'vision-square vision-square--dark'}
              onClick={() => choose(square)}
              aria-label={square}
            />
          )
        })}
      </div>
    </article>
  )
}
