// 懸停/點擊說明的共用狀態:整個頁面只有一個說明框。
import { reactive } from 'vue'

export interface TipState {
  open: boolean
  /** 關鍵字 id(術語或補充關鍵字的定義)。 */
  keyword?: string
  /** 純文字說明(例如潛能加成「潛能 5 獲得」)。 */
  text?: string
  /** 點擊打開的說明不隨滑鼠離開而關閉。 */
  pinned: boolean
  /** 說明框是否提供「加入/移出選擇」按鈕(觸控裝置點命中敘述的詞)。 */
  toggle: boolean
  x: number
  y: number
  below: boolean
}

export const tip = reactive<TipState>({ open: false, pinned: false, toggle: false, x: 0, y: 0, below: true })

export function showTip(el: Element, content: { keyword?: string; text?: string }, opts: { pinned?: boolean; toggle?: boolean } = {}) {
  const rect = el.getBoundingClientRect()
  const below = rect.top < window.innerHeight / 2
  Object.assign(tip, {
    open: true,
    keyword: content.keyword,
    text: content.text,
    pinned: opts.pinned ?? false,
    toggle: opts.toggle ?? false,
    x: rect.left + rect.width / 2,
    y: below ? rect.bottom + 6 : rect.top - 6,
    below,
  })
}

export function hideTip() {
  tip.open = false
  tip.pinned = false
}

/** 觸控裝置(沒有懸停)上,懸停說明改為點擊顯示。 */
export function isTouch(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches
}
