import { Fragment } from 'react'
import type { ReactNode } from 'react'

export function RichText({
  text,
  parts,
}: {
  text: string
  parts: Record<string, ReactNode>
}) {
  return text
    .split(/\{(\w+)\}/)
    .map((piece, index) => (
      <Fragment key={index}>{index % 2 ? parts[piece] : piece}</Fragment>
    ))
}
