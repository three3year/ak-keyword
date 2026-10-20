import type { OperatorFile, SearchIndex } from './types'

/** 以相對路徑載入索引,放在任何子路徑下都能運作。 */
export async function loadIndex(): Promise<SearchIndex> {
  const res = await fetch(new URL('data/index.json', document.baseURI))
  if (!res.ok) throw new Error(`索引載入失敗:${res.status}`)
  return (await res.json()) as SearchIndex
}

/** 已下載(或下載中)的幹員檔:這次瀏覽期間留在記憶體;下載失敗的不留,重試時重新下載。 */
const operatorFiles = new Map<string, Promise<OperatorFile>>()

/** 載入幹員檔;path 是索引裡幹員的 detail。 */
export function loadOperator(path: string): Promise<OperatorFile> {
  let pending = operatorFiles.get(path)
  if (!pending) {
    pending = fetch(new URL(path, document.baseURI)).then(async (res) => {
      if (!res.ok) throw new Error(`幹員資料載入失敗:${res.status}`)
      return (await res.json()) as OperatorFile
    })
    pending.catch(() => operatorFiles.delete(path))
    operatorFiles.set(path, pending)
  }
  return pending
}
