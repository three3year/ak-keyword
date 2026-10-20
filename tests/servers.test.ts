import { describe, expect, test } from 'vitest'
import { type SupplementKeyword, buildIndex } from '../build/buildIndex'
import { keywordGroups, query } from '../src/core/query'
import { applying, COMMON_TERMS, highlights, masteredSkill, operator, plain, server } from './fixtures'

const TW_TERMS: Record<string, [string, string]> = {
  'ba.cold': ['寒冷', '攻擊速度下降,如果在持續時間內再次受到寒冷效果則會變為<$ba.frozen>凍結</>'],
  'ba.frozen': ['凍結', '無法行動'],
  'ba.levitate': ['浮空', '無法移動和攻擊'],
}

const coldCn = (sec: number) => ({ description: '攻击使敌人<$ba.cold>寒冷</>{t}秒', values: { t: sec } })
const coldTw = (sec: number) => ({ description: '攻擊使敵人<$ba.cold>寒冷</>{t}秒', values: { t: sec } })

/** 陸服三位幹員;台服只有前兩位,且「改版者」的數值已過期。 */
function servers() {
  const cn = server({
    version: '78.2.0',
    terms: COMMON_TERMS,
    operators: {
      char_600_same: operator({ name: '冰原', skills: ['sk_same'] }),
      char_601_diff: operator({ name: '改版者', skills: ['sk_diff'] }),
      char_602_new: operator({ name: '新幹员', skills: ['sk_new'] }),
    },
    skills: [
      masteredSkill('sk_same', '冰封', coldCn(3), coldCn(5)),
      masteredSkill('sk_diff', '冰刃', coldCn(3), coldCn(6)),
      masteredSkill('sk_new', '新技', coldCn(3), coldCn(5)),
    ],
  })
  const tw = server({
    version: '51.4.0',
    terms: TW_TERMS,
    operators: {
      char_600_same: operator({ name: '冰原台', skills: ['sk_same'], style: 'object' }),
      char_601_diff: operator({ name: '改版者台', skills: ['sk_diff'], style: 'object' }),
    },
    skills: [
      masteredSkill('sk_same', '冰封台', coldTw(3), coldTw(5), 'object'),
      masteredSkill('sk_diff', '冰刃台', coldTw(3), coldTw(5), 'object'),
    ],
  })
  return { cn, tw }
}

describe('台服模式', () => {
  test('只列台服已實裝的幹員,比對與顯示都用台服資料', () => {
    const { index } = buildIndex(servers())
    const results = query(index, { conditions: applying('ba.cold'), server: 'tw' })
    expect(results.map((r) => r.name)).toEqual(['冰原台', '改版者台'])
    const diff = results[1].entries[0]
    expect(diff.name).toBe('冰刃台')
    expect(diff.stages.map((s) => plain(s.runs))).toEqual(['攻擊使敵人寒冷3秒', '攻擊使敵人寒冷5秒'])
  })

  test('台服敘述也能命中陸服沒有的關鍵字', () => {
    const cn = server({ terms: COMMON_TERMS, operators: { char_610_x: operator({ name: '甲', skills: ['sk'] }) }, skills: [masteredSkill('sk', '技', { description: '攻击' }, { description: '攻击' })] })
    const tw = server({
      terms: TW_TERMS,
      operators: { char_610_x: operator({ name: '甲', skills: ['sk'] }) },
      skills: [masteredSkill('sk', '技', { description: '攻擊使敵人<$ba.levitate>浮空</>' }, { description: '攻擊使敵人<$ba.levitate>浮空</>' })],
    })
    const { index } = buildIndex({ cn, tw })
    expect(query(index, { conditions: applying('ba.levitate'), server: 'tw' }).map((r) => r.name)).toEqual(['甲'])
    expect(query(index, { conditions: applying('ba.levitate'), server: 'cn' })).toEqual([])
  })
})

describe('陸服模式', () => {
  test('列出所有陸服幹員,幹員名優先用台服名', () => {
    const { index } = buildIndex(servers())
    expect(query(index, { conditions: applying('ba.cold'), server: 'cn' }).map((r) => r.name)).toEqual(['冰原台', '改版者台', '新幹员'])
  })

  test('台服同一段敘述的術語與數值都一致時顯示繁中', () => {
    const { index } = buildIndex(servers())
    const same = query(index, { conditions: applying('ba.cold'), server: 'cn' })[0].entries[0]
    expect(same.stages.map((s) => plain(s.runs))).toEqual(['攻擊使敵人寒冷3秒', '攻擊使敵人寒冷5秒'])
    expect(highlights(same.stages[0].runs)).toEqual([['寒冷', 'ba.cold']])
  })

  test('數值不一致的階段顯示陸服簡中,一致的階段仍顯示繁中', () => {
    const { index } = buildIndex(servers())
    const diff = query(index, { conditions: applying('ba.cold'), server: 'cn' })[1].entries[0]
    expect(diff.stages.map((s) => plain(s.runs))).toEqual(['攻擊使敵人寒冷3秒', '攻击使敌人寒冷6秒'])
  })

  test('台服沒有的幹員顯示陸服簡中', () => {
    const { index } = buildIndex(servers())
    const fresh = query(index, { conditions: applying('ba.cold'), server: 'cn' })[2]
    expect(fresh.entries[0].name).toBe('新技')
    expect(plain(fresh.entries[0].stages[0].runs)).toBe('攻击使敌人寒冷3秒')
  })

  test('台服未實裝的幹員標「台服未實裝」,台服已有的幹員不標;只有職業條件時也一樣', () => {
    const { index } = buildIndex(servers())
    const bySearch = query(index, { conditions: applying('ba.cold'), server: 'cn' })
    expect(bySearch.map((r) => [r.name, r.twUnreleased ?? false])).toEqual([['冰原台', false], ['改版者台', false], ['新幹员', true]])
    const byProfession = query(index, { conditions: [], server: 'cn', professions: ['CASTER'] })
    expect(byProfession.map((r) => [r.name, r.twUnreleased ?? false])).toEqual([['冰原台', false], ['改版者台', false], ['新幹员', true]])
  })

  test('台服一致的敘述沿用陸服的效果類型,不重複列入待複核', () => {
    const { pending } = buildIndex(servers())
    // 陸服 3 段不同的文字(3 秒、5 秒、6 秒);台服只有「改版者」專精3 的 5 秒版本與陸服不一致
    expect(pending.map((p) => p.text).sort()).toEqual(['攻击使敌人寒冷3秒', '攻击使敌人寒冷5秒', '攻击使敌人寒冷6秒', '攻擊使敵人寒冷5秒'].sort())
  })
})

describe('名稱與補充關鍵字', () => {
  test('關鍵字名稱與定義優先用台服', () => {
    const { index } = buildIndex(servers())
    const cold = keywordGroups(index, 'tw').flatMap((g) => g.rows.flat()).find((k) => k.name === '寒冷')!
    expect(plain(cold.definition)).toBe('攻擊速度下降,如果在持續時間內再次受到寒冷效果則會變為凍結')
  })

  test('補充關鍵字在台服敘述上以繁中字串比對', () => {
    const supplements: SupplementKeyword[] = [{ id: 'knockback', name: '擊退', cn: ['推开'], tw: ['推開'], definition: '推' }]
    const cn = server({ terms: COMMON_TERMS, operators: { char_620_p: operator({ name: '推', skills: ['sk'] }) }, skills: [masteredSkill('sk', '技', { description: '将敌人推开' }, { description: '将敌人推开' })] })
    const tw = server({ terms: TW_TERMS, operators: { char_620_p: operator({ name: '推', skills: ['sk'] }) }, skills: [masteredSkill('sk', '技', { description: '將敵人推開' }, { description: '將敵人推開' })] })
    const { index } = buildIndex({ cn, tw, supplements })
    const [twResult] = query(index, { conditions: applying('sup.knockback'), server: 'tw' })
    expect(highlights(twResult.entries[0].stages[0].runs)).toEqual([['推開', 'sup.knockback']])
    const [cnResult] = query(index, { conditions: applying('sup.knockback'), server: 'cn' })
    expect(highlights(cnResult.entries[0].stages[0].runs)).toEqual([['推開', 'sup.knockback']])
  })
})

describe('模組3 階段的伺服器處理', () => {
  test('模組3 一律取陸服文字,台服已有幹員身上台服模組清單沒有的模組標「台服未實裝」;台服模式只列台服已實裝的模組', () => {
    const cn = server({
      terms: COMMON_TERMS,
      operators: { char_630_m: operator({ name: '模組者', trait: '攻击造成法术伤害' }) },
      modules: [
        { id: 'uniequip_002_m', charId: 'char_630_m', name: '甲模组', code: 'CCR-X', trait: { add: '攻击使敌人<$ba.cold>寒冷</>' } },
        { id: 'uniequip_003_m', charId: 'char_630_m', name: '乙模组', code: 'CCR-Y', trait: { add: '攻击使敌人<$ba.cold>寒冷</>2秒' } },
      ],
    })
    const tw = server({ terms: TW_TERMS, operators: { char_630_m: operator({ name: '模組者', trait: '攻擊造成法術傷害' }) } })
    tw.uniequipTable = {
      equipDict: { uniequip_002_m: { uniEquipId: 'uniequip_002_m', uniEquipName: '甲模組', typeIcon: 'ccr-x', charId: 'char_630_m', type: 'ADVANCED' } },
    }
    const { index } = buildIndex({ cn, tw })

    const [twEntry] = query(index, { conditions: applying('ba.cold'), server: 'tw' })[0].entries
    expect(twEntry.stages.map((s) => [s.label, plain(s.runs), s.twUnreleased ?? false])).toEqual([
      ['無模組', '攻擊造成法術傷害', false],
      ['模組3 · CCR-X', '攻击造成法术伤害\n攻击使敌人寒冷', false],
    ])
    expect(twEntry.stages[1].module).toBe('甲模組')

    const [cnEntry] = query(index, { conditions: applying('ba.cold'), server: 'cn' })[0].entries
    expect(cnEntry.stages.map((s) => [s.label, s.module, s.twUnreleased ?? false])).toEqual([
      ['無模組', undefined, false],
      ['模組3 · CCR-X', '甲模組', false],
      ['模組3 · CCR-Y', '乙模组', true],
    ])
  })

  test('台服未實裝的幹員只在幹員本身標「台服未實裝」,模組3 階段都不標', () => {
    const cn = server({
      terms: COMMON_TERMS,
      operators: { char_631_n: operator({ name: '新模組者', trait: '攻击造成法术伤害' }) },
      modules: [{ id: 'uniequip_002_n', charId: 'char_631_n', name: '新模组', code: 'CCR-X', trait: { add: '攻击使敌人<$ba.cold>寒冷</>' } }],
    })
    const tw = server({ terms: TW_TERMS, operators: {} })
    const { index } = buildIndex({ cn, tw })
    const [result] = query(index, { conditions: applying('ba.cold'), server: 'cn' })
    expect(result.twUnreleased).toBe(true)
    expect(result.entries[0].stages.map((s) => [s.label, s.twUnreleased ?? false])).toEqual([
      ['無模組', false],
      ['模組3 · CCR-X', false],
    ])
  })
})
