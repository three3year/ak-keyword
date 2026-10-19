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
