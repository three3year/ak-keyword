import { describe, expect, test } from 'vitest'
import { buildIndex } from '../build/buildIndex'
import { query } from '../src/core/query'
import { AMIYA_PRTS_PAGES, applying, COMMON_TERMS, masteredSkill, operator, server } from './fixtures'

const cold = { description: '使敌人<$ba.cold>寒冷</>' }
const coldSkill = masteredSkill('sk_cold', '冰', cold, cold)
const prts = (page: string) => `https://prts.wiki/w/${encodeURIComponent(page)}`

/** 阿米婭:三個職業形態的國服名都是「阿米娅」。 */
function amiya() {
  return server({
    terms: COMMON_TERMS,
    operators: { char_002_amiya: operator({ name: '阿米娅', profession: 'CASTER', skills: ['sk_cold'] }) },
    patches: {
      char_002_amiya: {
        char_1001_amiya2: operator({ name: '阿米娅', profession: 'WARRIOR', sub: 'artsfghter', skills: ['sk_cold'] }),
        char_1037_amiya3: operator({ name: '阿米娅', profession: 'MEDIC', sub: 'physician', skills: ['sk_cold'] }),
      },
    },
    skills: [coldSkill],
  })
}

describe('PRTS 連結', () => {
  test('一般幹員連到國服名的頁面,頁名經網址編碼', () => {
    const cn = server({ terms: COMMON_TERMS, operators: { char_800_a: operator({ name: '新幹员', skills: ['sk_cold'] }) }, skills: [coldSkill] })
    const [r] = query(buildIndex({ cn }).index, { conditions: applying('ba.cold'), server: 'cn' })
    expect(r.prtsUrl).toBe('https://prts.wiki/w/%E6%96%B0%E5%B9%B9%E5%91%98')
  })

  test('台服譯名與國服名不同時,兩種伺服器模式的網址都用國服名', () => {
    const cn = server({ terms: COMMON_TERMS, operators: { char_801_b: operator({ name: '冰原', skills: ['sk_cold'] }) }, skills: [coldSkill] })
    const tw = server({ terms: COMMON_TERMS, operators: { char_801_b: operator({ name: '冰原台', skills: ['sk_cold'] }) }, skills: [coldSkill] })
    const { index } = buildIndex({ cn, tw })
    for (const s of ['tw', 'cn'] as const) {
      const [r] = query(index, { conditions: applying('ba.cold'), server: s })
      expect([r.name, r.prtsUrl]).toEqual(['冰原台', prts('冰原')])
    }
  })

  test('國服名重複的幹員依對照連到各自的頁面', () => {
    const { index } = buildIndex({ cn: amiya(), prtsPages: AMIYA_PRTS_PAGES })
    expect(query(index, { conditions: applying('ba.cold'), server: 'cn' }).map((r) => [r.id, r.prtsUrl])).toEqual([
      ['char_1001_amiya2', prts('阿米娅(近卫)')],
      ['char_002_amiya', prts('阿米娅')],
      ['char_1037_amiya3', prts('阿米娅(医疗)')],
    ])
  })

  test('國服名重複又不在對照裡時建置失敗,指出是哪些幹員', () => {
    const { char_1037_amiya3: _, ...partial } = AMIYA_PRTS_PAGES
    expect(() => buildIndex({ cn: amiya(), prtsPages: partial })).toThrow(/char_1037_amiya3/)
    expect(() => buildIndex({ cn: amiya() })).toThrow(/阿米娅.*char_002_amiya.*char_1001_amiya2.*char_1037_amiya3/)
  })
})
