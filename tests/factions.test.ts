import { describe, expect, test } from 'vitest'
import { type BuildInput, buildIndex } from '../build/buildIndex'
import { branchName, operatorDetail } from '../src/core/query'
import type { DetailAttributes, Server } from '../src/core/types'
import { operator, server } from './fixtures'

const NAMES = {
  rhodes: '罗德岛',
  elite: '罗德岛-精英干员',
  yan: '炎',
  lungmen: '炎-龙门',
  lgd: '龙门近卫局',
  penguin: '企鹅物流',
  victoria: '维多利亚',
  glasgow: '格拉斯哥帮',
}

function build(raw: BuildInput, id: string, on: Server = 'cn'): { attributes: DetailAttributes; warnings: string[] } {
  const { index, operatorFiles, warnings } = buildIndex(raw)
  const file = operatorFiles.find((f) => f.id === id)!
  const op = index.operators.find((o) => o.id === id)!
  return { attributes: operatorDetail(file, { server: on, conditions: [], branchName: branchName(index, op) }).attributes, warnings }
}

function factions(raw: BuildInput, id: string, on: Server = 'cn'): Pick<DetailAttributes, 'faction' | 'hiddenFactions'> {
  const { faction, hiddenFactions } = build(raw, id, on).attributes
  return { faction, hiddenFactions }
}

describe('幹員詳情的勢力', () => {
  test('所屬勢力:有值的層依國家、組織、團隊順序以「 · 」串起,空的層略過', () => {
    const cn = server({
      factionNames: NAMES,
      operators: {
        char_010_chen: operator({ name: '陈', faction: { nationId: 'lungmen', groupId: 'lgd' } }),
        char_009_exu: operator({ name: '能天使', faction: { nationId: 'lungmen', teamId: 'penguin' } }),
        char_011_x: operator({ name: '甲', faction: { nationId: 'rhodes', groupId: 'elite', teamId: 'penguin' } }),
      },
    })
    expect(factions({ cn }, 'char_010_chen').faction).toBe('炎-龙门 · 龙门近卫局')
    expect(factions({ cn }, 'char_009_exu').faction).toBe('炎-龙门 · 企鹅物流')
    expect(factions({ cn }, 'char_011_x').faction).toBe('罗德岛 · 罗德岛-精英干员 · 企鹅物流')
  })

  test('隱藏勢力:兩個以「、」分隔、各自內部以「 · 」串起;沒有隱藏勢力時沒有這一項', () => {
    const cn = server({
      factionNames: NAMES,
      operators: {
        char_017_huang: operator({
          name: '煌',
          faction: { nationId: 'rhodes', groupId: 'elite' },
          hiddenFactions: [{ nationId: 'yan' }, { nationId: 'victoria', groupId: 'glasgow' }],
        }),
        char_010_chen: operator({ name: '陈', faction: { nationId: 'lungmen', groupId: 'lgd' } }),
      },
    })
    expect(factions({ cn }, 'char_017_huang').hiddenFactions).toBe('炎、维多利亚 · 格拉斯哥帮')
    expect(factions({ cn }, 'char_010_chen')).toEqual({ faction: '炎-龙门 · 龙门近卫局' })
  })

  test('兩服勢力不同時各輸出各自的;台服名稱來自對照表;台服省略空鍵照常輸出', () => {
    const hongxue = (style: 'array' | 'object', hidden: string) =>
      operator({ name: '鸿雪', style, faction: { nationId: 'rhodes' }, hiddenFactions: [{ nationId: hidden }] })
    const cn = server({ factionNames: { ...NAMES, sargon: '萨尔贡', ursus: '乌萨斯' }, operators: { char_4041_chnut: hongxue('array', 'sargon') } })
    const tw = server({ operators: { char_4041_chnut: hongxue('object', 'ursus') } })
    const twFactionNames = { rhodes: '羅德島', sargon: '薩爾貢', ursus: '烏薩斯' }
    expect(factions({ cn, tw, twFactionNames }, 'char_4041_chnut', 'cn')).toEqual({ faction: '罗德岛', hiddenFactions: '萨尔贡' })
    expect(factions({ cn, tw, twFactionNames }, 'char_4041_chnut', 'tw')).toEqual({ faction: '羅德島', hiddenFactions: '烏薩斯' })
  })

  test('台服勢力 ID 不在對照表:輸出陸服的簡體名稱,建置警告多一條', () => {
    const op = (style: 'array' | 'object') => operator({ name: '甲', style, faction: { nationId: 'lungmen', groupId: 'lgd' } })
    const cn = server({ factionNames: NAMES, operators: { char_011_x: op('array') } })
    const tw = server({ operators: { char_011_x: op('object') } })
    const full = build({ cn, tw, twFactionNames: { lungmen: '炎-龍門', lgd: '龍門近衛局' } }, 'char_011_x', 'tw')
    const missing = build({ cn, tw, twFactionNames: { lungmen: '炎-龍門' } }, 'char_011_x', 'tw')
    expect(full.attributes.faction).toBe('炎-龍門 · 龍門近衛局')
    expect(missing.attributes.faction).toBe('炎-龍門 · 龙门近卫局')
    expect(missing.warnings).toHaveLength(full.warnings.length + 1)
  })

  test('陸服勢力 ID 不在名稱表:輸出勢力 ID 本身,建置警告多一條', () => {
    const cnOf = (factionNames: Record<string, string>) =>
      server({ factionNames, operators: { char_011_x: operator({ name: '甲', faction: { nationId: 'lungmen', groupId: 'sees' } }) } })
    const full = build({ cn: cnOf({ ...NAMES, sees: '希斯' }) }, 'char_011_x')
    const missing = build({ cn: cnOf(NAMES) }, 'char_011_x')
    expect(full.attributes.faction).toBe('炎-龙门 · 希斯')
    expect(missing.attributes.faction).toBe('炎-龙门 · sees')
    expect(missing.warnings).toHaveLength(full.warnings.length + 1)
  })
})
