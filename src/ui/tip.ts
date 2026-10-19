// 提示框(關鍵字的定義、潛能加成的來源)的共用狀態:整個頁面只有一個提示框。
import { reactive } from 'vue'

export interface TipState {
  open: boolean
  /** 關鍵字 id(術語或補充關鍵字的定義)。 */
  keyword?: string
  /** 純文字提示(例如潛能加成「潛能 5 獲得」)。 */
  text?: string
  /** 點擊打開的提示框不隨滑鼠離開而關閉。 */
  pinned: boolean
  x: number
  y: number
  below: boolean
}

export const tip = reactive<TipState>({ open: false, pinned: false, x: 0, y: 0, below: true })

export function showTip(el: Element, content: { keyword?: string; text?: string }, opts: { pinned?: boolean } = {}) {
  const rect = el.getBoundingClientRect()
  const below = rect.top < window.innerHeight / 2
  Object.assign(tip, {
    open: true,
    keyword: content.keyword,
    text: content.text,
    pinned: opts.pinned ?? false,
    x: rect.left + rect.width / 2,
    y: below ? rect.bottom + 6 : rect.top - 6,
    below,
  })
}

export function hideTip() {
  tip.open = false
  tip.pinned = false
}

/** 觸控裝置(沒有懸停)上,懸停提示改為點擊顯示。 */
export function isTouch(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches
}
