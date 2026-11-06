import { describe, expect, test } from 'vitest'
import type { BuildInput } from '../build/buildIndex'
import type { DetailAttributes, Server } from '../src/core/types'
import { AMIYA_PRTS_PAGES, operator, operatorDetailOf, server } from './fixtures'

const attributes = (raw: BuildInput, id: string, on: Server = 'cn'): DetailAttributes => operatorDetailOf(raw, id, { server: on }).attributes

describe('幹員詳情的屬性', () => {
  test('6★ 幹員取精2 90級的八項屬性,生命、攻擊、防禦附信賴加成', () => {
    const cn = server({
      operators: {
        char_017_huang: operator({
          name: '煌',
          rarity: 6,
          phases: [
            { blockCnt: 2 },
            { blockCnt: 2 },
            { maxHp: 2821, atk: 765, def: 370, magicResistance: 5, cost: 24, blockCnt: 3, baseAttackTime: 1.2, respawnTime: 70 },
          ],
          trust: { maxHp: 200, atk: 60, def: 45 },
        }),
      },
    })
    expect(attributes({ cn }, 'char_017_huang')).toEqual({
      levelLabel: '精2 90級',
      cost: 24,
      block: 3,
      intervalSeconds: 1.2,
      redeploySeconds: 70,
      hp: { value: 2821, trust: 200 },
      atk: { value: 765, trust: 60 },
      def: { value: 370, trust: 45 },
      res: 5,
    })
  })

  test('沒有精2 的幹員取它能到的最高階段:3★ 精1 55級,1★ 精0 30級', () => {
    const cn = server({
      operators: {
        char_120_three: operator({ name: '三星', rarity: 3, phases: [{ atk: 300 }, { atk: 455 }] }),
        char_121_one: operator({ name: '一星', rarity: 1, phases: [{ atk: 120 }] }),
      },
    })
    const three = attributes({ cn }, 'char_120_three')
    expect([three.levelLabel, three.atk.value]).toEqual(['精1 55級', 455])
    const one = attributes({ cn }, 'char_121_one')
    expect([one.levelLabel, one.atk.value]).toEqual(['精0 30級', 120])
  })

  test('信賴不加的項目沒有加成;潛能的屬性加成不算進去', () => {
    const cn = server({
      operators: {
        char_130_x: operator({
          name: '甲',
          phases: [{}, {}, { maxHp: 2000, atk: 500, def: 300 }],
          trust: { atk: 80 },
          potentialAttributes: { maxHp: 300, atk: 30 },
        }),
      },
    })
    const a = attributes({ cn }, 'char_130_x')
    expect([a.hp, a.atk, a.def]).toEqual([{ value: 2000 }, { value: 500, trust: 80 }, { value: 300 }])
  })

  test('兩服屬性不同時各輸出各自的值;台服未實裝的幹員輸出陸服的值', () => {
    const cn = server({
      operators: {
        char_140_alanna: operator({ name: '阿兰娜', phases: [{}, {}, { respawnTime: 70 }] }),
        char_141_new: operator({ name: '新人', phases: [{}, {}, { cost: 13 }] }),
      },
    })
    const tw = server({ operators: { char_140_alanna: operator({ name: '阿蘭娜', phases: [{}, {}, { respawnTime: 80 }] }) } })
    expect(attributes({ cn, tw }, 'char_140_alanna', 'cn').redeploySeconds).toBe(70)
    expect(attributes({ cn, tw }, 'char_140_alanna', 'tw').redeploySeconds).toBe(80)
    expect(attributes({ cn, tw }, 'char_141_new', 'cn').cost).toBe(13)
  })

  test('阿米婭的職業形態各自取自己的屬性', () => {
    const cn = server({
      operators: { char_002_amiya: operator({ name: '阿米娅', phases: [{}, {}, { atk: 600 }] }) },
      patches: { char_002_amiya: { char_1001_amiya2: operator({ name: '阿米娅', profession: 'WARRIOR', phases: [{}, {}, { atk: 700 }] }) } },
    })
    expect(attributes({ cn, prtsPages: AMIYA_PRTS_PAGES }, 'char_002_amiya').atk.value).toBe(600)
    expect(attributes({ cn, prtsPages: AMIYA_PRTS_PAGES }, 'char_1001_amiya2').atk.value).toBe(700)
  })
})
