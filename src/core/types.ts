// 索引建置與瀏覽器查詢之間唯一的交界:索引 JSON 的形狀,以及查詢的輸入與輸出。

export type Server = 'cn' | 'tw'

/** 敘述與關鍵字的關係:施加、利用、抵抗、其他。 */
export type EffectType = 'apply' | 'exploit' | 'resist' | 'other'

export const EFFECT_TYPES: EffectType[] = ['apply', 'exploit', 'resist', 'other']

export const EFFECT_TYPE_LABELS: Record<EffectType, string> = {
  apply: '施加',
  exploit: '利用',
  resist: '抵抗',
  other: '其他',
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
  /** 這段文字含有的關鍵字與其效果類型。 */
  hits: Record<string, EffectType>
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
  /** 技能或天賦的編號(1 起算);模組新增的天賦沒有編號。 */
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

export interface QueryOptions {
  keywords: string[]
  server: Server
  /** 省略時不篩選效果類型。 */
  effectTypes?: EffectType[]
  rarities?: number[]
  professions?: Profession[]
  subProfessions?: string[]
}

export interface ResultStage {
  /** 例如「等級7」「專精3」「無模組」「模組3 · SUM-X」;沒有其他階段可對照的無模組階段為空字串。 */
  label: string
  runs: Run[]
  /** 這個階段含有已選關鍵字(效果類型符合勾選)。 */
  hit: boolean
  /** 已選關鍵字在這個階段的效果類型。 */
  effects: Record<string, EffectType>
  /** 文字取自國服資料(模組3 階段)。 */
  cnData?: boolean
  /** 模組3 階段的模組全名(標籤只寫模組代碼)。 */
  module?: string
}

export interface ResultEntry {
  /** 敘述來源,例如「技能2」「天賦1」「特性」「召喚物技能1」。 */
  source: string
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
