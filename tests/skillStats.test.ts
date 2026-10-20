import { describe, expect, test } from 'vitest'
import { buildIndex } from '../build/buildIndex'
import { query, skillFacts, spLabel } from '../src/core/query'
import { applying, basicSkill, COMMON_TERMS, masteredSkill, operator, server } from './fixtures'

const cold = (more: object = {}) => ({ description: '使敌人<$ba.cold>寒冷</>', ...more })

function stageStats(skill: ReturnType<typeof masteredSkill>, tw?: ReturnType<typeof masteredSkill>) {
  const cn = server({ terms: COMMON_TERMS, operators: { char_001_x: operator({ name: '甲', skills: [skill.skillId] }) }, skills: [skill] })
  const twRaw = tw && server({ terms: COMMON_TERMS, operators: { char_001_x: operator({ name: '甲', skills: [tw.skillId] }) }, skills: [tw] })
  const { index } = buildIndex({ cn, tw: twRaw })
  const of = (sv: 'cn' | 'tw') => query(index, { conditions: applying('ba.cold'), server: sv })[0].entries[0]
  return { cn: of('cn'), tw: twRaw ? of('tw') : undefined }
}

describe('技能的技力', () => {
  test('回復類型、觸發方式、初始技力、所需技力對應原始資料,等級7 與專精3 各自正確', () => {
    const { cn } = stageStats(
      masteredSkill(
        'sk_1',
        '冰封',
        cold({ sp: { spType: 'INCREASE_WHEN_ATTACK', initSp: 2, spCost: 9 }, skillType: 'AUTO' }),
        cold({ sp: { spType: 'INCREASE_WHEN_ATTACK', initSp: 3, spCost: 8 }, skillType: 'AUTO' }),
      ),
    )
    expect(cn.stages.map((s) => [s.label, s.stats])).toEqual([
      ['等級7', { trigger: 'auto', sp: { type: 'attack', init: 2, cost: 9 } }],
      ['專精3', { trigger: 'auto', sp: { type: 'attack', init: 3, cost: 8 } }],
    ])
  })

  test('自動回復與受擊回復、手動觸發', () => {
    const time = stageStats(basicSkill('sk_t', '甲', cold({ sp: { spType: 'INCREASE_WITH_TIME', initSp: 0, spCost: 100 } })))
    expect(time.cn.stages[0].stats).toEqual({ trigger: 'manual', sp: { type: 'time', init: 0, cost: 100 } })
    const hit = stageStats(basicSkill('sk_h', '乙', cold({ sp: { spType: 'INCREASE_WHEN_TAKEN_DAMAGE', initSp: 5, spCost: 20 } })))
    expect(hit.cn.stages[0].stats?.sp?.type).toBe('hit')
  })

  test('持續時間只保留大於 0 的值,充能次數只保留大於 1 的值,彈藥技能帶彈藥旗標', () => {
    const { cn } = stageStats(
      masteredSkill('sk_1', '冰封', cold({ duration: -1, ammo: true }), cold({ duration: 25, sp: { maxChargeTime: 3 } })),
    )
    expect(cn.stages.map((s) => s.stats)).toEqual([
      { trigger: 'manual', sp: { type: 'time', init: 0, cost: 30 }, ammo: true },
      { trigger: 'manual', sp: { type: 'time', init: 0, cost: 30 }, duration: 25, charges: 3 },
    ])
    const zero = stageStats(basicSkill('sk_z', '零', cold({ duration: 0 })))
    expect(zero.cn.stages[0].stats?.duration).toBeUndefined()
  })

  test('被動技能與沒有回復類型(spType 8)的技能沒有回復類型與技力', () => {
    const passive = stageStats(basicSkill('sk_p', '被動', cold({ skillType: 'PASSIVE', sp: { spType: 'INCREASE_WITH_TIME', spCost: 10 } })))
    expect(passive.cn.stages[0].stats).toEqual({ trigger: 'passive' })
    const none = stageStats(basicSkill('sk_n', '召喚物技', cold({ skillType: 'AUTO', duration: 10, sp: { spType: 8 } })))
    expect(none.cn.stages[0].stats).toEqual({ trigger: 'auto', duration: 10 })
  })

  test('不認得的觸發方式發警告', () => {
    const skill = basicSkill('sk_x', '怪', cold({ skillType: 'NEW_TYPE' }))
    const cn = server({ terms: COMMON_TERMS, operators: { char_001_x: operator({ name: '甲', skills: ['sk_x'] }) }, skills: [skill] })
    expect(buildIndex({ cn }).warnings.filter((w) => w.includes('sk_x') && w.includes('NEW_TYPE'))).toHaveLength(1)
  })

  test('台服用台服自己的技力', () => {
    const { cn, tw } = stageStats(
      masteredSkill('sk_1', '冰封', cold({ sp: { spCost: 40 } }), cold({ sp: { spCost: 35 } })),
      masteredSkill('sk_1', '冰封', cold({ sp: { spCost: 45 } }), cold({ sp: { spCost: 35 } }), 'object'),
    )
    expect(cn.stages.map((s) => s.stats?.sp?.cost)).toEqual([40, 35])
    expect(tw!.stages.map((s) => s.stats?.sp?.cost)).toEqual([45, 35])
  })

  test('天賦與特性沒有技力', () => {
    const cn = server({
      terms: COMMON_TERMS,
      operators: { char_001_x: operator({ name: '甲', trait: '攻击使敌人<$ba.cold>寒冷</>', talents: [{ name: '冷', description: '使敌人<$ba.cold>寒冷</>' }] }) },
    })
    const [r] = query(buildIndex({ cn }).index, { conditions: applying('ba.cold'), server: 'cn' })
    expect(r.entries.map((e) => [e.source, e.icon, e.stages[0].stats])).toEqual([
      ['特性', undefined, undefined],
      ['天賦1', undefined, undefined],
    ])
  })
})

describe('技能圖示', () => {
  test('有 iconId 時用 iconId,沒有時用 skillId', () => {
    const withIcon = { ...masteredSkill('sk_a', '甲', cold(), cold()), iconId: 'sk_shared' }
    const cn = server({
      terms: COMMON_TERMS,
      operators: { char_001_x: operator({ name: '甲', skills: ['sk_a', 'sk_b'] }) },
      skills: [withIcon, masteredSkill('sk_b', '乙', cold(), cold())],
    })
    const [r] = query(buildIndex({ cn }).index, { conditions: applying('ba.cold'), server: 'cn' })
    expect(r.entries.map((e) => e.icon)).toEqual(['skill-icons/sk_shared.webp', 'skill-icons/sk_b.webp'])
  })

  test('台服模式沿用陸服的 iconId', () => {
    const cn = server({
      terms: COMMON_TERMS,
      operators: { char_001_x: operator({ name: '甲', skills: ['sk_a'] }) },
      skills: [{ ...masteredSkill('sk_a', '甲', cold(), cold()), iconId: 'sk_icon' }],
    })
    const tw = server({ terms: COMMON_TERMS, operators: { char_001_x: operator({ name: '甲', skills: ['sk_a'] }) }, skills: [masteredSkill('sk_a', '甲', cold(), cold(), 'object')] })
    const [r] = query(buildIndex({ cn, tw }).index, { conditions: applying('ba.cold'), server: 'tw' })
    expect(r.entries[0].icon).toBe('skill-icons/sk_icon.webp')
  })

  test('檔名裡不能放進網址的字元換成底線', () => {
    const cn = server({
      terms: COMMON_TERMS,
      operators: { char_001_x: operator({ name: '甲', skills: ['skcom_up[1]'] }) },
      skills: [masteredSkill('skcom_up[1]', '甲', cold(), cold())],
    })
    const [r] = query(buildIndex({ cn }).index, { conditions: applying('ba.cold'), server: 'cn' })
    expect(r.entries[0].icon).toBe('skill-icons/skcom_up_1_.webp')
  })
})

describe('技力的文字', () => {
  test('技能頭部的文字欄位依序是回復類型、觸發方式、初始技力、所需技力、持續、充能、彈藥', () => {
    expect(skillFacts({ trigger: 'manual', sp: { type: 'time', init: 0, cost: 100 }, duration: 25 })).toEqual([
      '自動回復',
      '手動觸發',
      '初始技力 0',
      '所需技力 100',
      '持續 25 秒',
    ])
    expect(skillFacts({ trigger: 'auto', sp: { type: 'attack', init: 1, cost: 4 }, charges: 3, ammo: true })).toEqual([
      '攻擊回復',
      '自動觸發',
      '初始技力 1',
      '所需技力 4',
      '充能 3 次',
      '彈藥',
    ])
  })

  test('被動技能只有「被動」;沒有回復類型的技能沒有技力', () => {
    expect(skillFacts({ trigger: 'passive' })).toEqual(['被動'])
    expect(skillFacts({ trigger: 'auto', duration: 10 })).toEqual(['自動觸發', '持續 10 秒'])
  })

  test('疊字的無障礙文字', () => {
    expect(spLabel({ type: 'time', init: 0, cost: 100 })).toBe('自動回復,初始技力 0,所需技力 100')
  })
})
