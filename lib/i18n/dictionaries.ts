import type { Locale } from './config'
import type { DeepPartial } from './types'
import en from './locales/en'
import fr from './locales/fr'
import es from './locales/es'
import de from './locales/de'
import pt from './locales/pt'
import it from './locales/it'

export type Dictionary = typeof en
export const dictionaries: Record<Locale, DeepPartial<Dictionary>> = { en, fr, es, de, pt, it }
export { en }
