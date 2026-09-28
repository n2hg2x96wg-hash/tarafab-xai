// A translation file mirrors the English one; every key is optional so a
// partial translation still type-checks and falls back to English.
export type DeepPartial<T> = { [K in keyof T]?: T[K] extends string ? string : DeepPartial<T[K]> }

type Join<K, P> = K extends string ? (P extends string ? `${K}.${P}` : never) : never
export type Paths<T> = { [K in keyof T & string]: T[K] extends string ? K : Join<K, Paths<T[K]>> }[keyof T & string]
