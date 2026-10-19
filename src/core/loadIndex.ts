import type { SearchIndex } from './types'

/** 以相對路徑載入索引,放在任何子路徑下都能運作。 */
export async function loadIndex(): Promise<SearchIndex> {
  const res = await fetch(new URL('data/index.json', document.baseURI))
  if (!res.ok) throw new Error(`索引載入失敗:${res.status}`)
  return (await res.json()) as SearchIndex
}
