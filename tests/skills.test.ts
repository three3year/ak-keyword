import { describe, expect, test } from 'vitest'
import { buildIndex } from '../build/buildIndex'
import { query } from '../src/core/query'
import { COMMON_TERMS, basicSkill, highlights, masteredSkill, operator, plain, server } from './fixtures'

describe('技能敘述的寒冷直通', () => {
  test('點寒冷列出技能含寒冷的幹員,佔位符填入實際數值,等級7與專精3並列', () => {
    const cn = server({
      terms: COMMON_TERMS,
      operators: {
        char_001_ice: operator({ name: '冰原', skills: ['sk_ice_1'] }),
        char_002_fire: operator({ name: '火山', skills: ['sk_fire_1'] }),
      },
      skills: [
        masteredSkill(
          'sk_ice_1',
          '冰封',
          { description: '攻击使敌人<$ba.cold>寒冷</>{duration}秒', values: {}, duration: 3 },
          { description: '攻击使敌人<$ba.cold>寒冷</>{duration}秒', values: {}, duration: 5 },
        ),
        masteredSkill('sk_fire_1', '燃烧', { description: '攻击力+{atk:0%}', values: { atk: 0.5 } }, { description: '攻击力+{atk:0%}', values: { atk: 0.8 } }),
      ],
    })

    const { index } = buildIndex({ cn })
    const results = query(index, { keywords: ['ba.cold'], server: 'cn' })

    expect(results.map((r) => r.name)).toEqual(['冰原'])
    const [entry] = results[0].entries
    expect(entry.source).toBe('技能1')
    expect(entry.name).toBe('冰封')
    expect(entry.stages.map((s) => [s.label, plain(s.runs)])).toEqual([
      ['等級7', '攻击使敌人寒冷3秒'],
      ['專精3', '攻击使敌人寒冷5秒'],
    ])
    expect(highlights(entry.stages[0].runs)).toEqual([['寒冷', 'ba.cold']])
    expect(entry.only).toBeUndefined()
  })

  test('效果只在專精3 出現時標「僅專精3」', () => {
    const cn = server({
      terms: COMMON_TERMS,
      operators: { char_001_ice: operator({ name: '冰原', skills: ['sk_ice_1'] }) },
      skills: [masteredSkill('sk_ice_1', '冰封', { description: '攻击力提升' }, { description: '攻击力提升并使敌人<$ba.cold>寒冷</>' })],
    })
    const [r] = query(buildIndex({ cn }).index, { keywords: ['ba.cold'], server: 'cn' })
    expect(r.entries[0].only).toBe('僅專精3')
    expect(r.entries[0].stages.map((s) => s.hit)).toEqual([false, true])
  })

  test('沒有專精的技能只顯示最高等級', () => {
    const cn = server({
      terms: COMMON_TERMS,
      operators: { char_003_low: operator({ name: '低星', rarity: 3, skills: ['sk_low_1'] }) },
      skills: [basicSkill('sk_low_1', '冷风', { description: '使敌人<$ba.cold>寒冷</>{duration}秒', duration: 2 })],
    })
    const [r] = query(buildIndex({ cn }).index, { keywords: ['ba.cold'], server: 'cn' })
    expect(r.entries[0].stages.map((s) => [s.label, plain(s.runs)])).toEqual([['等級7', '使敌人寒冷2秒']])
    expect(r.entries[0].only).toBeUndefined()
  })

  test('只收錄可取得的幹員,不收錄召喚物、陷阱與預備干員', () => {
    const cold = { description: '使敌人<$ba.cold>寒冷</>' }
    const cn = server({
      terms: COMMON_TERMS,
      operators: {
        char_001_ice: operator({ name: '冰原', skills: ['sk_1'] }),
        token_001_ice: operator({ name: '冰晶', profession: 'TOKEN', skills: ['sk_1'] }),
        trap_001_ice: operator({ name: '冰陷阱', profession: 'TRAP', skills: ['sk_1'] }),
        char_504_rguard: operator({ name: '预备干员', notObtainable: true, skills: ['sk_1'] }),
      },
      skills: [masteredSkill('sk_1', '冰', cold, cold)],
    })
    expect(query(buildIndex({ cn }).index, { keywords: ['ba.cold'], server: 'cn' }).map((r) => r.name)).toEqual(['冰原'])
  })
})

describe('敘述解析', () => {
  function parse(description: string, values: Record<string, number | string> = {}, duration = 0) {
    const cn = server({
      terms: COMMON_TERMS,
      operators: { char_001_x: operator({ name: '甲', skills: ['sk_x_1'] }) },
      skills: [basicSkill('sk_x_1', '技', { description: `<$ba.stun>晕眩</>${description}`, values, duration })],
    })
    const { index, warnings } = buildIndex({ cn })
    const [r] = query(index, { keywords: ['ba.stun'], server: 'cn' })
    return { runs: r.entries[0].stages[0].runs, warnings }
  }

  test('各種佔位符格式都換成實際數值', () => {
    const { runs, warnings } = parse(
      '：{atk:0%}，{rate:0.0}，{cnt}，{-def:0%}，{attack@prob:0%}，{trigger.time}，{ATK_SCALE:0.0%}，{t:0}，{duration}秒',
      { atk: 0.55, rate: 1.25, cnt: 3, def: -0.3, 'attack@prob': 0.2, 'trigger.time': 1.5, atk_scale: 0.125, t: 2.6 },
      12,
    )
    expect(plain(runs)).toBe('晕眩：55%，1.3，3，30%，20%，1.5，12.5%，3，12秒')
    expect(warnings).toEqual([])
  })

  test('巢狀標記:樣式標記裡的術語仍被高亮', () => {
    const { runs } = parse('，<@ba.rem>技能结束后<$ba.cold>寒冷</>{t}秒</>', { t: 3 })
    expect(plain(runs)).toBe('晕眩，技能结束后寒冷3秒')
    expect(highlights(runs)).toEqual([
      ['晕眩', 'ba.stun'],
      ['寒冷', 'ba.cold'],
    ])
  })

  test('術語標記包住【】時,括號不算在高亮內', () => {
    const { runs } = parse('并使其陷入<$ba.magicfragile>【法术脆弱】</>')
    expect(plain(runs)).toBe('晕眩并使其陷入【法术脆弱】')
    expect(highlights(runs)).toEqual([
      ['晕眩', 'ba.stun'],
      ['法术脆弱', 'ba.magicfragile'],
    ])
  })

  test('不是標記的角括號保留為純文字,不產生警告', () => {
    const { runs, warnings } = parse('，<替身>部署后获得<@ba.kw>护盾</>')
    expect(plain(runs)).toBe('晕眩，<替身>部署后获得护盾')
    expect(warnings).toEqual([])
  })

  test('敘述裡字面的 \\n 轉成換行', () => {
    const { runs } = parse('，持续3秒\\n<@ba.rem>不可叠加</>')
    expect(plain(runs)).toBe('晕眩，持续3秒\n不可叠加')
  })

  test('無法辨識的標記與找不到數值的佔位符會產生警告,列出技能 id 與原文', () => {
    const { warnings } = parse('{missing:0%}<#bad>x')
    expect(warnings).toHaveLength(2)
    expect(warnings[0]).toContain('sk_x_1')
    expect(warnings[0]).toContain('{missing:0%}')
    expect(warnings[1]).toContain('無法辨識的標記 <#bad>')
    expect(warnings[1]).toContain('<$ba.stun>晕眩</>{missing:0%}<#bad>x')
  })
})
