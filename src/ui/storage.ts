// 記住使用者的選擇。瀏覽器儲存可能不可用(隱私模式、封鎖網站資料),存取失敗時回傳預設值。
import type { Server } from '../core/types'

const SERVER_KEY = 'aks.server'

export function loadServer(): Server {
  try {
    const v = window.localStorage.getItem(SERVER_KEY)
    return v === 'tw' ? 'tw' : 'cn'
  } catch {
    return 'cn'
  }
}

export function saveServer(server: Server): void {
  try {
    window.localStorage.setItem(SERVER_KEY, server)
  } catch {
    // 存不了就算了,網頁照常運作
  }
}

/** 外觀:跟隨系統、亮色、暗色。 */
export type Appearance = 'system' | 'light' | 'dark'

// index.html 頁首有同一套讀取規則,在畫面出現前套用記住的外觀;改這裡時一併改那裡
const APPEARANCE_KEY = 'aks.appearance'

export function loadAppearance(): Appearance {
  try {
    const v = window.localStorage.getItem(APPEARANCE_KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function saveAppearance(appearance: Appearance): void {
  try {
    window.localStorage.setItem(APPEARANCE_KEY, appearance)
  } catch {
    // 存不了就算了,網頁照常運作
  }
}
