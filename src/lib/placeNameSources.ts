// Mirrors PlaceNameSource in src/app/api/search/route.ts, most to least
// reliable. Kept in its own module (not a "use server" file, which can only
// export async functions) so it can be shared by actions.ts, route.ts, and
// admin/page.tsx without a circular import.
export const PLACENAME_SOURCES = [
  'correction',
  'explicit_description',
  'title_match',
  'address_match',
  'comment_match',
  'address_fallback',
] as const

export type MinConfidenceSource = (typeof PLACENAME_SOURCES)[number]
