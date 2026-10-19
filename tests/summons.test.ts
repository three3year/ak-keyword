import { describe, expect, test } from 'vitest'
import { buildIndex } from '../build/buildIndex'
import { query } from '../src/core/query'
import { applying, COMMON_TERMS, basicSkill, masteredSkill, operator, plain, server } from './fixtures'

const cold = { description: '使敌人<$ba.cold>寒冷</>' }

describe('召喚物', () => {
  test('召喚物的技能與天賦算在所屬幹員名下,標「召喚物」與召喚物名稱', () => {
    const cn = server({
      terms: COMMON_TERMS,
      operators: {
        char_300_owner: operator({ name: '召喚師', skills: ['sk_owner_1'], tokens: ['token_300_ice'] }),
        token_300_ice: operator({
          name: '冰灵',
          profession: 'TOKEN',
          skills: ['sktok_ice_1'],
          talents: [{ name: '冰体', description: '攻击使敌人<$ba.cold>寒冷</>' }],
        }),
      },
      skills: [
        masteredSkill('sk_owner_1', '召唤', { description: '召唤冰灵' }, { description: '召唤冰灵' }),
        basicSkill('sktok_ice_1', '冰息', { description: '吐息使敌人<$ba.cold>寒冷</>' }),
      ],
    })
    const results = query(buildIndex({ cn }).index, { conditions: applying('ba.cold'), server: 'cn' })
    expect(results.map((r) => r.name)).toEqual(['召喚師'])
    expect(results[0].entries.map((e) => [e.source, e.summon, e.name, plain(e.stages[0].runs)])).toEqual([
      ['召喚物天賦1', '冰灵', '冰体', '攻击使敌人寒冷'],
      ['召喚物技能1', '冰灵', '冰息', '吐息使敌人寒冷'],
    ])
  })

  test('技能指定召喚的召喚物與天賦帶出的召喚物也歸到幹員', () => {
    const cn = server({
      terms: COMMON_TERMS,
      operators: {
        char_301_a: operator({ name: '技能召喚', skills: ['sk_a_1'], skillTokens: { sk_a_1: 'token_301_a' } }),
        char_302_b: operator({ name: '天賦召喚', talents: [{ name: '造物', description: '可以部署机器', tokenKey: 'token_302_b' }] }),
        token_301_a: operator({ name: '甲物', profession: 'TOKEN', skills: ['sktok_1'] }),
        token_302_b: operator({ name: '乙物', profession: 'TOKEN', skills: ['sktok_1'] }),
      },
      skills: [masteredSkill('sk_a_1', '召', { description: '召唤' }, { description: '召唤' }), basicSkill('sktok_1', '冷', cold)],
    })
    const results = query(buildIndex({ cn }).index, { conditions: applying('ba.cold'), server: 'cn' })
    expect(results.map((r) => [r.name, r.entries[0].summon])).toEqual([
      ['技能召喚', '甲物'],
      ['天賦召喚', '乙物'],
    ])
  })

  test('多個召喚物的同一段命中敘述合併成一筆,列出所有召喚物名', () => {
    const cn = server({
      terms: COMMON_TERMS,
      operators: {
        char_304_m: operator({ name: '多召喚', tokens: ['token_304_a', 'token_304_b'] }),
        token_304_a: operator({ name: '甲型', profession: 'TOKEN', talents: [{ name: '冷却', description: '攻击使敌人<$ba.cold>寒冷</>' }] }),
        token_304_b: operator({ name: '乙型', profession: 'TOKEN', talents: [{ name: '冷却', description: '攻击使敌人<$ba.cold>寒冷</>' }] }),
      },
    })
    const [r] = query(buildIndex({ cn }).index, { conditions: applying('ba.cold'), server: 'cn' })
    expect(r.entries.map((e) => [e.source, e.summon])).toEqual([['召喚物天賦1', '甲型、乙型']])
  })

  test('不屬於任何幹員的召喚物(例如活動限定)不收錄', () => {
    const cn = server({
      terms: COMMON_TERMS,
      operators: {
        char_303_x: operator({ name: '無關', skills: [] }),
        token_999_event: operator({ name: '活动装置', profession: 'TOKEN', skills: ['sktok_ev'] }),
      },
      skills: [basicSkill('sktok_ev', '活动', cold)],
    })
    expect(query(buildIndex({ cn }).index, { conditions: applying('ba.cold'), server: 'cn' })).toEqual([])
  })
})

describe('阿米婭形態', () => {
  test('每個職業形態各成一位幹員,技能與職業依形態而定', () => {
    const cn = server({
      terms: COMMON_TERMS,
      operators: { char_002_amiya: operator({ name: '阿米娅', profession: 'CASTER', skills: ['sk_amiya_1'] }) },
      patches: {
        char_002_amiya: {
          char_1001_amiya2: operator({ name: '阿米娅', profession: 'WARRIOR', sub: 'artsfghter', skills: ['sk_amiya2_1'] }),
          char_1037_amiya3: operator({ name: '阿米娅', profession: 'MEDIC', sub: 'physician', skills: ['sk_amiya3_1'] }),
        },
      },
      skills: [
        masteredSkill('sk_amiya_1', '术', cold, cold),
        masteredSkill('sk_amiya2_1', '剑', cold, cold),
        masteredSkill('sk_amiya3_1', '医', { description: '治疗' }, { description: '治疗' }),
      ],
    })
    const prtsPages = { char_002_amiya: '阿米娅', char_1001_amiya2: '阿米娅(近卫)', char_1037_amiya3: '阿米娅(医疗)' }
    const results = query(buildIndex({ cn, prtsPages }).index, { conditions: applying('ba.cold'), server: 'cn' })
    expect(results.map((r) => [r.id, r.name, r.profession, r.entries[0].name])).toEqual([
      ['char_1001_amiya2', '阿米娅(近衛)', 'WARRIOR', '剑'],
      ['char_002_amiya', '阿米娅(術師)', 'CASTER', '术'],
    ])
  })
})
