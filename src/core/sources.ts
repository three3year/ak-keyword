// 資料來源:遊戲資料與頭像所在的公開 GitHub 資料庫。建置腳本的下載位置與頁尾連結都從這裡衍生。

export interface DataSource {
  /** GitHub 上的「擁有者/資料庫」,例如 Kengxxiao/ArknightsGameData。 */
  name: string
  /** 下載用的分支。 */
  branch: string
  /** 資料所在的資料夾(相對資料庫根目錄)。 */
  dir: string
}

export const DATA_SOURCES = {
  cn: { name: 'Kengxxiao/ArknightsGameData', branch: 'master', dir: 'zh_CN/gamedata/excel' },
  tw: { name: 'arkntools/arknights-data-tw-for-maa', branch: 'main', dir: '' },
  avatar: { name: 'yuanyan3060/ArknightsGameResource', branch: 'main', dir: 'avatar' },
} as const satisfies Record<string, DataSource>

/** 資料庫首頁。 */
export function repoUrl(source: DataSource): string {
  return `https://github.com/${source.name}`
}

/** 資料夾內檔案的原始內容下載位置(不含結尾斜線)。 */
export function rawBase(source: DataSource): string {
  return [`https://raw.githubusercontent.com/${source.name}/${source.branch}`, source.dir].filter(Boolean).join('/')
}
