const UGC_API_BASE = 'https://services.facepunch.com/sbox/package'

export const PACKAGE_TYPES = [
  'model', 'sound', 'material', 'map', 'game',
  'clothing', 'library', 'vsnd', 'prefab', 'shader',
] as const

export type PackageType = (typeof PACKAGE_TYPES)[number]

export interface PackageOrg {
  Ident: string
  Title: string
  Description?: string
  Thumb?: string
  Twitter?: string
  WebUrl?: string
  Discord?: string
}

export interface UgcPackage {
  Org: PackageOrg
  Ident: string
  FullIdent: string
  Title: string
  Summary?: string
  Thumb?: string
  ThumbWide?: string
  ThumbTall?: string
  VideoThumb?: string
  TypeName: string
  Updated: string
  Created: string
  UsageStats?: Record<string, unknown>
  Tags?: string[]
  Favourited?: number
  VotesUp?: number
  Collections?: number
  Referenced?: number
  Public?: boolean
}

export interface SearchPackagesResponse {
  Packages: UgcPackage[]
  TotalCount: number
  Facets: unknown[]
  Tags?: Record<string, number>
  Orders?: Array<{ Name: string; Title: string; Icon: string }>
}

export interface SearchPackagesParams {
  query: string
  type?: PackageType
  category?: string
  tag?: string
  order?: string
  take?: number
  skip?: number
}

export async function searchPackages(params: SearchPackagesParams): Promise<SearchPackagesResponse> {
  const url = new URL(`${UGC_API_BASE}/find`)

  url.searchParams.set('q', params.query)
  if (params.type) url.searchParams.set('type', params.type)
  if (params.category) url.searchParams.set('category', params.category)
  if (params.tag) url.searchParams.set('tag', params.tag)
  if (params.order) url.searchParams.set('order', params.order)
  if (params.take) url.searchParams.set('take', String(params.take))
  if (params.skip) url.searchParams.set('skip', String(params.skip))

  const res = await fetch(url.toString())
  if (!res.ok) {
    throw new Error(`UGC API error: ${res.status} ${res.statusText}`)
  }

  return res.json() as Promise<SearchPackagesResponse>
}
