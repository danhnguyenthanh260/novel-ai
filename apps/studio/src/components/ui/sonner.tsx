"use client"

import * as React from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const textGlyph = (glyph: string) => (
  <span aria-hidden="true" className="text-sm leading-none">
    {glyph}
  </span>
)

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      icons={{
        success: textGlyph("✓"),
        info: textGlyph("i"),
        warning: textGlyph("!"),
        error: textGlyph("×"),
        loading: textGlyph("…"),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
