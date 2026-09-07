/** Pack extra metadata into assets.notes until jsonb column exists. */

export const FYM_META_PREFIX = 'FYM1:'

export type PackedMeta = Record<string, unknown> & { human?: string }

export function packNotes(human?: string | null, extra?: Record<string, unknown> | null): string | null {
  const cleanExtra: Record<string, unknown> = {}
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (k === 'human') continue
      if (v === undefined || v === null || v === '') continue
      cleanExtra[k] = v
    }
  }
  const humanTrim = human?.trim() || undefined
  if (Object.keys(cleanExtra).length === 0) return humanTrim ?? null
  const payload: PackedMeta = { ...cleanExtra }
  if (humanTrim) payload.human = humanTrim
  return FYM_META_PREFIX + JSON.stringify(payload)
}

export function unpackNotes(notes?: string | null): { human?: string; extra: Record<string, unknown> } {
  if (!notes) return { extra: {} }
  if (!notes.startsWith(FYM_META_PREFIX)) return { human: notes, extra: {} }
  try {
    const parsed = JSON.parse(notes.slice(FYM_META_PREFIX.length)) as PackedMeta
    const { human, ...rest } = parsed
    return { human: typeof human === 'string' ? human : undefined, extra: rest }
  } catch {
    return { human: notes, extra: {} }
  }
}
