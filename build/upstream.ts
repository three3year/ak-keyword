// 比對索引與上游的資料版本。純函式,不連網;下載上游版號的是 build/checkUpstream.ts。
import type { Server } from '../src/core/types'

export interface VersionStatus {
  server: Server
  /** 索引裡的版號;索引沒有這個伺服器的資料時為 undefined。 */
  current: string | undefined
  upstream: string
  /** 版號字串和索引不同就算有新版(不比大小)。 */
  updated: boolean
}

/** 兩服各自比較索引版號與上游版號,彼此不比較。 */
export function compareVersions(current: Partial<Record<Server, string>>, upstream: Record<Server, string>): VersionStatus[] {
  return (['cn', 'tw'] as const).map((server) => ({
    server,
    current: current[server],
    upstream: upstream[server],
    updated: current[server] !== upstream[server],
  }))
}
