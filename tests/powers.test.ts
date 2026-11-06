import { describe, expect, test } from 'vitest'
import { type BuildInput, buildIndex } from '../build/buildIndex'
import type { OperatorDetail, Server } from '../src/core/types'
import { operator, operatorDetailOf, server } from './fixtures'

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

function powers(raw: BuildInput, id: string, on: Server = 'cn'): Pick<OperatorDetail, 'power' | 'hiddenPowers'> {
  const { power, hiddenPowers } = operatorDetailOf(raw, id, { server: on })
  return { power, hiddenPowers }
}

describe('幹員詳情的勢力', () => {
  test('勢力:有值的層依國家、組織、團隊順序以「 · 」串起,空的層略過', () => {
    const cn = server({
      powerNames: NAMES,
      operators: {
        char_010_chen: operator({ name: '陈', power: { nationId: 'lungmen', groupId: 'lgd' } }),
        char_009_exu: operator({ name: '能天使', power: { nationId: 'lungmen', teamId: 'penguin' } }),
        char_011_x: operator({ name: '甲', power: { nationId: 'rhodes', groupId: 'elite', teamId: 'penguin' } }),
      },
    })
    expect(powers({ cn }, 'char_010_chen').power).toBe('炎-龙门 · 龙门近卫局')
    expect(powers({ cn }, 'char_009_exu').power).toBe('炎-龙门 · 企鹅物流')
    expect(powers({ cn }, 'char_011_x').power).toBe('罗德岛 · 罗德岛-精英干员 · 企鹅物流')
  })

  test('隱藏勢力:兩個以「、」分隔、各自內部以「 · 」串起;沒有隱藏勢力時沒有這一項', () => {
    const cn = server({
      powerNames: NAMES,
      operators: {
        char_017_huang: operator({
          name: '煌',
          power: { nationId: 'rhodes', groupId: 'elite' },
          hiddenPowers: [{ nationId: 'yan' }, { nationId: 'victoria', groupId: 'glasgow' }],
        }),
        char_010_chen: operator({ name: '陈', power: { nationId: 'lungmen', groupId: 'lgd' } }),
      },
    })
    expect(powers({ cn }, 'char_017_huang').hiddenPowers).toBe('炎、维多利亚 · 格拉斯哥帮')
    expect(powers({ cn }, 'char_010_chen')).toEqual({ power: '炎-龙门 · 龙门近卫局' })
  })

  test('兩服勢力不同時各輸出各自的;台服名稱來自對照表;台服省略空鍵照常輸出', () => {
    const hongxue = (style: 'array' | 'object', hidden: string) =>
      operator({ name: '鸿雪', style, power: { nationId: 'rhodes' }, hiddenPowers: [{ nationId: hidden }] })
    const cn = server({ powerNames: { ...NAMES, sargon: '萨尔贡', ursus: '乌萨斯' }, operators: { char_4041_chnut: hongxue('array', 'sargon') } })
    const tw = server({ operators: { char_4041_chnut: hongxue('object', 'ursus') } })
    const twPowerNames = { rhodes: '羅德島', sargon: '薩爾貢', ursus: '烏薩斯' }
    expect(powers({ cn, tw, twPowerNames }, 'char_4041_chnut', 'cn')).toEqual({ power: '罗德岛', hiddenPowers: '萨尔贡' })
    expect(powers({ cn, tw, twPowerNames }, 'char_4041_chnut', 'tw')).toEqual({ power: '羅德島', hiddenPowers: '烏薩斯' })
  })

  test('台服勢力 ID 不在對照表:輸出陸服的簡體名稱,建置警告多一條', () => {
    const op = (style: 'array' | 'object') => operator({ name: '甲', style, power: { nationId: 'lungmen', groupId: 'lgd' } })
    const cn = server({ powerNames: NAMES, operators: { char_011_x: op('array') } })
    const tw = server({ operators: { char_011_x: op('object') } })
    const full: BuildInput = { cn, tw, twPowerNames: { lungmen: '炎-龍門', lgd: '龍門近衛局' } }
    const missing: BuildInput = { cn, tw, twPowerNames: { lungmen: '炎-龍門' } }
    expect(powers(full, 'char_011_x', 'tw').power).toBe('炎-龍門 · 龍門近衛局')
    expect(powers(missing, 'char_011_x', 'tw').power).toBe('炎-龍門 · 龙门近卫局')
    expect(buildIndex(missing).warnings).toHaveLength(buildIndex(full).warnings.length + 1)
  })

  test('陸服勢力 ID 不在名稱表:輸出勢力 ID 本身,建置警告多一條', () => {
    const cnOf = (powerNames: Record<string, string>) =>
      server({ powerNames, operators: { char_011_x: operator({ name: '甲', power: { nationId: 'lungmen', groupId: 'sees' } }) } })
    const full: BuildInput = { cn: cnOf({ ...NAMES, sees: '希斯' }) }
    const missing: BuildInput = { cn: cnOf(NAMES) }
    expect(powers(full, 'char_011_x').power).toBe('炎-龙门 · 希斯')
    expect(powers(missing, 'char_011_x').power).toBe('炎-龙门 · sees')
    expect(buildIndex(missing).warnings).toHaveLength(buildIndex(full).warnings.length + 1)
  })
})
