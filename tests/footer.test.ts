import { describe, expect, test } from 'vitest'
import { buildIndex } from '../build/buildIndex'
import { footerItems } from '../src/core/query'
import { operator, server } from './fixtures'

const cn = () => server({ version: '78.2.0', downloadedAt: '2026-10-19T04:14:00Z', operators: { char_700_a: operator({ name: '甲' }) } })
const tw = () => server({ version: '51.4.0', downloadedAt: '2026-10-18T17:05:30Z', operators: { char_700_a: operator({ name: '甲' }) } })

describe('頁尾項目', () => {
  test('國服、台服各列版號、台灣時間的下載時間與資料來源,頭像只有資料來源', () => {
    const { index } = buildIndex({ cn: cn(), tw: tw() })
    expect(footerItems(index)).toEqual([
      { label: '國服', version: '78.2.0', downloadedAt: '2026-10-19 12:14(UTC+8)', source: { name: 'Kengxxiao/ArknightsGameData', url: 'https://github.com/Kengxxiao/ArknightsGameData' } },
      { label: '台服', version: '51.4.0', downloadedAt: '2026-10-19 01:05(UTC+8)', source: { name: 'arkntools/arknights-data-tw-for-maa', url: 'https://github.com/arkntools/arknights-data-tw-for-maa' } },
      { label: '頭像', source: { name: 'yuanyan3060/ArknightsGameResource', url: 'https://github.com/yuanyan3060/ArknightsGameResource' } },
    ])
  })

  test('沒有台服資料時不列台服', () => {
    const { index } = buildIndex({ cn: cn() })
    expect(footerItems(index).map((i) => i.label)).toEqual(['國服', '頭像'])
  })
})
