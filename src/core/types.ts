// 索引建置與瀏覽器查詢之間唯一的交界:索引 JSON 的形狀,以及查詢的輸入與輸出。

export type Server = 'cn' | 'tw'

/** 敘述與關鍵字的關係:施加、利用、反制。一段敘述對同一關鍵字可同時有多種。 */
export type EffectType = 'apply' | 'exploit' | 'counter'

export const EFFECT_TYPES: EffectType[] = ['apply', 'exploit', 'counter']

/** 去重並依 EFFECT_TYPES 順序排列。 */
export function sortTypes(types: Iterable<EffectType>): EffectType[] {
  const set = new Set(types)
  return EFFECT_TYPES.filter((t) => set.has(t))
}

export const EFFECT_TYPE_LABELS: Record<EffectType, string> = {
  apply: '施加',
  exploit: '利用',
  counter: '反制',
}

/** 敘述中的一段文字。k:關鍵字 id(高亮);s:樣式;p:潛能加成由第幾潛能獲得(「潛能 5 獲得」)。 */
export interface Run {
  t: string
  k?: string
  s?: string
  p?: string
}

/** 遊戲職業,依遊戲內順序。 */
export const PROFESSIONS = ['PIONEER', 'WARRIOR', 'TANK', 'SNIPER', 'CASTER', 'MEDIC', 'SUPPORT', 'SPECIAL'] as const
export type Profession = (typeof PROFESSIONS)[number]

export const PROFESSION_LABELS: Record<Profession, string> = {
  PIONEER: '先鋒',
  WARRIOR: '近衛',
  TANK: '重裝',
  SNIPER: '狙擊',
  CASTER: '術師',
  MEDIC: '醫療',
  SUPPORT: '輔助',
  SPECIAL: '特種',
}

// ---------- 索引 ----------

export interface IndexText {
  runs: Run[]
  /** 這段文字含有的關鍵字與其效果類型(依 EFFECT_TYPES 順序);判定不出時為空清單,關鍵字照樣高亮。 */
  hits: Record<string, EffectType[]>
}

export type StageKind = 'lv7' | 'm3' | 'max' | 'base' | 'module'

export interface IndexStage {
  kind: StageKind
  /** kind 為 max(沒有專精的技能)時的最高等級。 */
  level?: number
  /** 模組3 階段所屬的模組 id。 */
  module?: string
  /** 國服文字(比對用)。模組3 階段只有國服文字。 */
  cn: IndexText
  /** 台服同一段敘述;台服沒有時省略。 */
  tw?: IndexText
  /** 台服文字與國服的術語、數值、補充關鍵字一致,國服模式可顯示台服文字。 */
  twSame?: boolean
}

export type EntryKind = 'skill' | 'talent' | 'trait'

export interface IndexEntry {
  kind: EntryKind
  /** 技能或天賦的編號(1 起算);模組新增的天賦接續幹員原有天賦。特性沒有編號。 */
  no?: number
  name?: string
  /** 召喚物 id;敘述屬於召喚物時才有。 */
  summon?: string
  stages: IndexStage[]
}

export interface IndexModule {
  id: string
  name: string
  /** 例如 SUM-X */
  code: string
  inTw: boolean
}

export interface IndexSummon {
  id: string
  name: string
  inTw: boolean
}

export interface IndexOperator {
  id: string
  name: string
  rarity: number
  profession: Profession
  subProfession: string
  /** 越大越新。 */
  release: number
  inTw: boolean
  avatar?: string
  modules: IndexModule[]
  summons: IndexSummon[]
  entries: IndexEntry[]
}

export interface IndexKeyword {
  id: string
  name: string
  kind: 'term' | 'supplement'
  group: string
  definition: Run[]
}

/** 某個伺服器遊戲資料的版號,加上建置時下載這份資料的時間。 */
export interface DataVersion {
  version: string
  /** ISO 8601,帶時區。 */
  downloadedAt: string
}

export interface SearchIndex {
  versions: { cn: DataVersion; tw?: DataVersion }
  groups: string[]
  keywords: IndexKeyword[]
  subProfessions: Record<string, { name: string; profession: Profession }>
  operators: IndexOperator[]
}

// ---------- 查詢 ----------

/** 搜尋條件:效果類型 + 關鍵字,例如施加-暈眩。 */
export interface SearchCondition {
  keyword: string
  type: EffectType
}

export interface QueryOptions {
  /** 搜尋條件一律 OR:幹員滿足任一條件就列入,包括同一關鍵字的多種效果類型。 */
  conditions: SearchCondition[]
  server: Server
  rarities?: number[]
  professions?: Profession[]
}

export interface ResultStage {
  /** 例如「等級7」「專精3」「無模組」「模組3 · SUM-X」;沒有其他階段可對照的無模組階段為空字串。 */
  label: string
  runs: Run[]
  /** 這個階段符合任一搜尋條件。 */
  hit: boolean
  /** 關鍵字 → 這個階段符合的搜尋條件的效果類型;沒有符合的關鍵字不列。 */
  effects: Record<string, EffectType[]>
  /** 模組3 階段的模組不在台服模組清單,只有國服資料。 */
  cnData?: boolean
  /** 模組3 階段的模組全名(標籤只寫模組代碼)。 */
  module?: string
  /** 不存在的階段:模組新增的天賦沒有無模組階段,仍列出一個沒有文字、未命中的「無模組」供對照。 */
  absent?: boolean
}

export interface ResultEntry {
  /** 敘述來源,例如「技能2」「天賦1」「特性」「召喚物技能1」。 */
  source: string
  /** 敘述來源種類,供介面決定文字框顏色。 */
  kind: EntryKind
  name?: string
  summon?: string
  /** 各階段依序排列;介面預設顯示第一個命中的階段。 */
  stages: ResultStage[]
}

export interface ResultOperator {
  id: string
  name: string
  rarity: number
  profession: Profession
  subProfession: string
  avatar?: string
  entries: ResultEntry[]
}
