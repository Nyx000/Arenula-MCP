import { z } from 'zod'

export const SearchDocsInput = z.object({
  query: z.string().min(1).describe('Search terms'),
  limit: z.number().min(1).max(25).default(10).describe('Max results'),
})

export const GetPageInput = z.object({
  url: z
    .string()
    .url()
    .refine(
      (u) =>
        u.includes('sbox.game') ||
        u.includes('docs.facepunch.com') ||
        u.includes('wiki.facepunch.com'),
      'URL must be from sbox.game, docs.facepunch.com, or wiki.facepunch.com',
    )
    .describe('Documentation page URL (prefer sbox.game/dev/doc/...path.md for raw markdown)'),
  start_index: z
    .number()
    .min(0)
    .default(0)
    .describe('Start index for chunked reading'),
  max_length: z
    .number()
    .min(100)
    .max(20000)
    .default(5000)
    .describe('Max content length in characters'),
})

export const GetApiTypeInput = z.object({
  type_name: z
    .string()
    .min(1)
    .describe('Type name (e.g. GameObject, Component, SceneFile)'),
  include_methods: z
    .boolean()
    .default(true)
    .describe('Include methods in output'),
  include_properties: z
    .boolean()
    .default(true)
    .describe('Include properties in output'),
})

export type SearchDocsParams = z.infer<typeof SearchDocsInput>
export type GetPageParams = z.infer<typeof GetPageInput>
export type GetApiTypeParams = z.infer<typeof GetApiTypeInput>
