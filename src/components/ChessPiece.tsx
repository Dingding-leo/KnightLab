import { memo, type CSSProperties, type ReactElement } from 'react'
import type { Color, PieceSymbol } from 'chess.js'

export interface ChessPieceProps {
  color: Color
  type: PieceSymbol
  className?: string
}

type PiecePalette = {
  fill: string
  shade: string
  outline: string
  detail: string
}

const palettes: Record<Color, PiecePalette> = {
  w: {
    fill: '#fffdf4',
    shade: '#d8cfbd',
    outline: '#1c2831',
    detail: '#5e625c',
  },
  b: {
    fill: '#26353e',
    shade: '#0d171d',
    outline: '#050a0e',
    detail: '#a9b5b6',
  },
}

function Foot({ shoulder = 35 }: { shoulder?: number }) {
  return (
    <>
      <path
        className="piece__main"
        d={`M${shoulder} 64h${100 - shoulder * 2}c1 5 4 9 8 13H27c4-4 7-8 8-13Z`}
      />
      <path className="piece__shade" d="M27 77h46l7 10c2 3 0 6-4 6H24c-4 0-6-3-4-6l7-10Z" fill="var(--piece-shade)" />
      <path className="piece__line" d="M27 77h46M22 88h56" fill="none" stroke="var(--piece-detail)" />
    </>
  )
}

function Pawn() {
  return (
    <>
      <circle className="piece__main" cx="50" cy="23" r="13" />
      <path className="piece__shade" d="M36 40c0-5 5-8 14-8s14 3 14 8c0 4-3 7-7 9 1 6 4 11 8 15H35c4-4 7-9 8-15-4-2-7-5-7-9Z" fill="var(--piece-shade)" />
      <path className="piece__line" d="M38 43c7 3 17 3 24 0" fill="none" stroke="var(--piece-detail)" />
      <Foot />
    </>
  )
}

function Knight() {
  return (
    <>
      <path
        className="piece__main"
        d="M31 65c2-13 9-22 20-29l-8-8-10 5 4-15 14-9c2 5 7 9 14 13 10 6 14 17 12 29-1 6-4 11-9 16L31 65Z"
      />
      <path className="piece__shade" d="M47 32c10 5 16 12 17 21 0 5-2 10-6 14h10c5-5 8-10 9-16 2-12-2-23-12-29-7-4-12-8-14-13l-7 5 10 11-7 7Z" fill="var(--piece-shade)" />
      <circle className="piece__detail" cx="58" cy="28" fill="var(--piece-detail)" r="2.6" stroke="none" />
      <path className="piece__line" d="M37 18c5 2 9 5 12 9M47 45c7-4 15-3 20 2M32 65h40" fill="none" stroke="var(--piece-detail)" />
      <Foot shoulder={31} />
    </>
  )
}

function Bishop() {
  return (
    <>
      <path className="piece__main" d="M50 8c-9 9-15 18-14 27 0 8 6 14 14 14s14-6 14-14C65 26 59 17 50 8Z" />
      <path className="piece__shade" d="M55 16c4 7 5 13 4 19-1 6-5 10-11 12 9 2 16-4 16-12 1-7-3-14-9-19Z" fill="var(--piece-shade)" />
      <path className="piece__line" d="m55 18-12 21" fill="none" stroke="var(--piece-detail)" />
      <path className="piece__main" d="M39 49h22l8 15H31l8-15Z" />
      <path className="piece__line" d="M36 57h28" fill="none" stroke="var(--piece-detail)" />
      <Foot shoulder={31} />
    </>
  )
}

function Rook() {
  return (
    <>
      <path className="piece__main" d="M22 12h14v10h9V12h10v10h9V12h14v24H22V12Z" />
      <path className="piece__shade" d="M27 36h46l-6 28H33l-6-28Z" fill="var(--piece-shade)" />
      <path className="piece__main" d="M27 36h46v9H27z" />
      <path className="piece__line" d="M31 47h38M34 60h32" fill="none" stroke="var(--piece-detail)" />
      <Foot shoulder={31} />
    </>
  )
}

function Queen() {
  return (
    <>
      <circle className="piece__main" cx="20" cy="16" r="5" />
      <circle className="piece__main" cx="35" cy="10" r="5" />
      <circle className="piece__main" cx="50" cy="8" r="5" />
      <circle className="piece__main" cx="65" cy="10" r="5" />
      <circle className="piece__main" cx="80" cy="16" r="5" />
      <path className="piece__main" d="m22 21 12 26 8-25 8 27 8-27 8 25 12-26-8 39H30l-8-39Z" />
      <path className="piece__shade" d="M30 52h40l-2 12H32l-2-12Z" fill="var(--piece-shade)" />
      <path className="piece__line" d="M30 52h40M32 60h36" fill="none" stroke="var(--piece-detail)" />
      <Foot shoulder={32} />
    </>
  )
}

function King() {
  return (
    <>
      <path className="piece__main" d="M46 6h8v9h9v8h-9v9h-8v-9h-9v-8h9V6Z" />
      <path className="piece__main" d="M50 29c-14 0-23 9-22 20 1 8 7 11 12 16h20c5-5 11-8 12-16 1-11-8-20-22-20Z" />
      <path className="piece__shade" d="M57 31c7 4 10 10 9 18-1 7-6 11-12 16h6c5-5 11-8 12-16 1-9-5-16-15-18Z" fill="var(--piece-shade)" />
      <path className="piece__line" d="M36 42c8 3 20 3 28 0M36 58h28" fill="none" stroke="var(--piece-detail)" />
      <Foot shoulder={32} />
    </>
  )
}

const shapes: Record<PieceSymbol, () => ReactElement> = {
  p: Pawn,
  n: Knight,
  b: Bishop,
  r: Rook,
  q: Queen,
  k: King,
}

export const ChessPiece = memo(function ChessPiece({ color, type, className }: ChessPieceProps) {
  const Shape = shapes[type]
  const palette = palettes[color]
  const style = {
    '--piece-fill': palette.fill,
    '--piece-shade': palette.shade,
    '--piece-outline': palette.outline,
    '--piece-detail': palette.detail,
  } as CSSProperties

  return (
    <svg
      aria-hidden="true"
      className={['piece', `piece--${color}`, `piece--${type}`, className].filter(Boolean).join(' ')}
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
      style={style}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g
        className="piece__art"
        fill="var(--piece-fill)"
        stroke="var(--piece-outline)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3.2"
      >
        <Shape />
      </g>
    </svg>
  )
})
