export interface SboxApiData {
  Types: SboxType[]
}

export interface SboxType {
  Name: string
  FullName: string
  Namespace: string
  Group: 'class' | 'struct' | 'enum' | 'interface'
  Assembly: string
  BaseType?: string
  DeclaringType?: string
  DocId: string
  Documentation?: { Summary: string }
  IsPublic: boolean
  IsClass?: boolean
  IsEnum?: boolean
  IsInterface?: boolean
  IsValueType?: boolean
  IsAbstract?: boolean
  IsSealed?: boolean
  IsStatic?: boolean
  IsAttribute?: boolean
  IsExtension?: boolean
  Constructors?: SboxMethod[]
  Methods?: SboxMethod[]
  Properties?: SboxProperty[]
  Fields?: SboxField[]
  Attributes?: SboxAttribute[]
}

export interface SboxMethod {
  Name: string
  FullName: string
  DeclaringType: string
  ReturnType: string
  Parameters?: SboxParameter[]
  Documentation?: { Summary: string }
  DocId: string
  IsPublic?: boolean
  IsStatic?: boolean
  IsVirtual?: boolean
  Attributes?: SboxAttribute[]
  l?: { File: string; Line: number }
}

export interface SboxProperty {
  Name: string
  FullName: string
  PropertyType: string
  Documentation?: { Summary: string }
  DocId: string
  IsPublic?: boolean
  Attributes?: SboxAttribute[]
  Loc?: { File: string; Line: number }
}

export interface SboxField {
  Name: string
  FullName: string
  FieldType: string
  Documentation?: { Summary: string }
  DocId: string
  IsPublic?: boolean
  IsStatic?: boolean
  Attributes?: SboxAttribute[]
}

export interface SboxParameter {
  Name: string
  Type: string
  Default?: string
  In?: boolean
}

export interface SboxAttribute {
  FullName: string
  ConstructorArguments?: string[]
}

export interface CacheConfig {
  url: string
  etag?: string
  lastFetched?: string
}

export interface FlatMember {
  name: string
  fullName: string
  kind: 'method' | 'property' | 'field'
  declaringType: string
  returnType: string
  signature?: string
  summary?: string
  isStatic?: boolean
}
