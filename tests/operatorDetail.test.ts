import { describe, expect, test } from 'vitest'
import { attachOperatorFiles, buildIndex } from '../build/buildIndex'
import type { RawServer } from '../build/raw'
import { branchName, operatorDetail } from '../src/core/query'
import type { DetailEntry, OperatorDetail, SearchCondition, Server } from '../src/core/types'
import { applying, basicSkill, COMMON_TERMS, highlights, masteredSkill, operator, plain, server } from './fixtures'

function detail(raw: { cn: RawServer; tw?: RawServer }, id: string, opts: { server?: Server; conditions?: SearchCondition[] } = {}): OperatorDetail {
  const { index, operatorFiles } = buildIndex(raw)
  const file = operatorFiles.find((f) => f.id === id)!
  const op = index.operators.find((o) => o.id === id)!
  return operatorDetail(file, { server: opts.server ?? 'cn', conditions: opts.conditions ?? [], branchName: branchName(index, op) })
}

const entriesOf = (d: OperatorDetail, label: string): DetailEntry[] => d.tabs.find((t) => t.label === label)?.entries ?? []

/** 特性、兩段天賦(只有天賦1 有關鍵字)、兩個技能(只有技能2 有關鍵字)。 */
function caster() {
  return server({
    terms: COMMON_TERMS,
    operators: {
      char_001_x: operator({
        name: '冰原',
        trait: '攻击造成法术伤害',
        talents: [
          { name: '冰心', description: '攻击使敌人<$ba.cold>寒冷</>' },
          { name: '博学', description: '攻击力+10%' },
        ],
        skills: ['sk_1', 'sk_2'],
      }),
    },
    skills: [
      masteredSkill('sk_1', '强力击', { description: '攻击力+50%', sp: { spCost: 9 } }, { description: '攻击力+80%', sp: { spCost: 8 } }),
      masteredSkill('sk_2', '冰封', { description: '攻击力提升' }, { description: '攻击力提升并使敌人<$ba.cold>寒冷</>' }),
    ],
  })
}

describe('幹員詳情', () => {
  test('每段敘述一個分頁,依序是特性、各天賦、各技能,標籤是敘述來源;預設特性;沒有關鍵字的敘述也列出', () => {
    const d = detail({ cn: caster() }, 'char_001_x')
    expect(d.tabs.map((t) => [t.kind, t.label])).toEqual([
      ['trait', '特性'],
      ['talent', '天賦1'],
      ['talent', '天賦2'],
      ['skill', '技能1'],
      ['skill', '技能2'],
    ])
    expect(d.defaultTab).toBe(0)
    expect(entriesOf(d, '特性').map((e) => [e.source, plain(e.stages[0].runs)])).toEqual([['特性', '攻击造成法术伤害']])
    expect(entriesOf(d, '天賦2').map((e) => [e.source, e.name])).toEqual([['天賦2', '博学']])
    expect(entriesOf(d, '技能1').map((e) => [e.source, e.name, e.stages.map((s) => s.label)])).toEqual([['技能1', '强力击', ['等級7', '專精3']]])
  })

  test('沒有技能的幹員沒有技能分頁', () => {
    const cn = server({
      terms: COMMON_TERMS,
      operators: { char_002_low: operator({ name: '低星', rarity: 1, trait: '不占部署位', talents: [{ name: '支援', description: '攻击力+10%' }] }) },
    })
    const d = detail({ cn }, 'char_002_low')
    expect(d.tabs.map((t) => t.label)).toEqual(['特性', '天賦1'])
    expect(d.defaultTab).toBe(0)
  })

  test('技能召喚的召喚物只接在召喚它的技能分頁,幹員本身那段在前,召喚物技能在召喚物天賦之前', () => {
    const cn = server({
      terms: COMMON_TERMS,
      operators: {
        char_300_owner: operator({
          name: '召喚師',
          trait: '攻击造成法术伤害',
          skills: ['sk_owner_1', 'sk_owner_2'],
          skillTokens: { sk_owner_2: 'token_300_ice' },
          talents: [{ name: '主天赋', description: '攻击力+10%' }],
        }),
        token_300_ice: operator({
          name: '冰灵',
          profession: 'TOKEN',
          skills: [null, 'sktok_ice_1'],
          talents: [{ name: '冰体', description: '防御力+10%' }],
        }),
      },
      skills: [
        masteredSkill('sk_owner_1', '强击', { description: '攻击力提升' }, { description: '攻击力提升' }),
        masteredSkill('sk_owner_2', '召唤', { description: '召唤冰灵' }, { description: '召唤冰灵' }),
        basicSkill('sktok_ice_1', '冰息', { description: '吐息', skillType: 'AUTO', sp: { spType: 8 } }),
      ],
    })
    const d = detail({ cn }, 'char_300_owner')
    expect(d.tabs.map((t) => [t.label, t.entries.map((e) => [e.source, e.name, e.summon])])).toEqual([
      ['特性', [['特性', 'corecaster', undefined]]],
      ['天賦1', [['天賦1', '主天赋', undefined]]],
      ['技能1', [['技能1', '强击', undefined]]],
      [
        '技能2',
        [
          ['技能2', '召唤', undefined],
          ['召喚物技能2', '冰息', '冰灵'],
          ['召喚物套用天賦1', '冰体', '冰灵'],
        ],
      ],
    ])
    expect(entriesOf(d, '技能2')[1].stages.map((s) => s.label)).toEqual(['等級7'])
  })

  test('同一召喚物被兩個技能召喚時,兩個技能分頁都有', () => {
    const cn = server({
      terms: COMMON_TERMS,
      operators: {
        char_300_owner: operator({
          name: '召喚師',
          skills: ['sk_owner_1', 'sk_owner_2', 'sk_owner_3'],
          skillTokens: { sk_owner_1: 'token_300_ice', sk_owner_3: 'token_300_ice' },
        }),
        // 召喚物技能表依幹員技能排,每格放同一個技能
        token_300_ice: operator({ name: '冰灵', profession: 'TOKEN', skills: ['sktok_ice_1', 'sktok_ice_1', 'sktok_ice_1'] }),
      },
      skills: [
        masteredSkill('sk_owner_1', '召唤', { description: '召唤冰灵' }, { description: '召唤冰灵' }),
        masteredSkill('sk_owner_2', '强击', { description: '攻击力提升' }, { description: '攻击力提升' }),
        masteredSkill('sk_owner_3', '再召唤', { description: '召唤冰灵' }, { description: '召唤冰灵' }),
        basicSkill('sktok_ice_1', '冰息', { description: '吐息' }),
      ],
    })
    const d = detail({ cn }, 'char_300_owner')
    expect(['技能1', '技能2', '技能3'].map((l) => entriesOf(d, l).map((e) => e.summon ?? e.source))).toEqual([
      ['技能1', '冰灵'],
      ['技能2'],
      ['技能3', '冰灵'],
    ])
  })

  test('天賦帶出的召喚物接在那個天賦分頁,沒有技能的幹員也一樣', () => {
    const cn = server({
      terms: COMMON_TERMS,
      operators: {
        char_302_b: operator({
          name: '天賦召喚',
          rarity: 5,
          trait: '攻击造成法术伤害',
          talents: [
            { name: '指挥', description: '攻击力+10%' },
            { name: '造物', description: '可以部署机器', tokenKey: 'token_302_b' },
          ],
        }),
        token_302_b: operator({ name: '乙物', profession: 'TOKEN', skills: ['sktok_1'], talents: [{ name: '机体', description: '防御力+10%' }] }),
      },
      skills: [basicSkill('sktok_1', '冲撞', { description: '撞击' })],
    })
    const d = detail({ cn }, 'char_302_b')
    expect(d.tabs.map((t) => [t.label, t.entries.map((e) => e.source)])).toEqual([
      ['特性', ['特性']],
      ['天賦1', ['天賦1']],
      ['天賦2', ['天賦2', '召喚物技能1', '召喚物套用天賦1']],
    ])
  })

  test('同一召喚物由技能召喚、也由天賦帶出時,召喚物技能接在對應的幹員技能分頁', () => {
    const cn = server({
      terms: COMMON_TERMS,
      operators: {
        char_303_c: operator({
          name: '雙來源',
          skills: ['sk_c_1'],
          skillTokens: { sk_c_1: 'token_303_c' },
          talents: [{ name: '造物', description: '可以部署机器', tokenKey: 'token_303_c' }],
        }),
        token_303_c: operator({ name: '丙物', profession: 'TOKEN', skills: ['sktok_1'] }),
      },
      skills: [masteredSkill('sk_c_1', '召', { description: '召唤' }, { description: '召唤' }), basicSkill('sktok_1', '冲撞', { description: '撞击' })],
    })
    const d = detail({ cn }, 'char_303_c')
    expect(['天賦1', '技能1'].map((l) => entriesOf(d, l).map((e) => e.source))).toEqual([
      ['天賦1'],
      ['技能1', '召喚物技能1'],
    ])
  })

  test('天賦帶出的召喚物:召喚物特性與天賦接在每個技能分頁,召喚物技能表第 N 格只接在幹員技能 N 分頁', () => {
    const cn = server({
      terms: COMMON_TERMS,
      operators: {
        char_306_t: operator({
          name: '影者',
          skills: ['sk_t_1', 'sk_t_2', 'sk_t_3'],
          talents: [{ name: '分身', description: '部署分身', tokenKey: 'token_306_t' }],
        }),
        token_306_t: operator({
          name: '虚影',
          profession: 'TOKEN',
          trait: '攻击造成真实伤害',
          skills: ['sktok_t_1', null, 'sktok_t_3'],
          talents: [{ name: '幻象', description: '防御力+10%' }],
        }),
      },
      skills: [
        ...['sk_t_1', 'sk_t_2', 'sk_t_3'].map((id) => masteredSkill(id, id, { description: '攻击力提升' }, { description: '攻击力提升' })),
        basicSkill('sktok_t_1', '暗夜', { description: '冲击' }),
        basicSkill('sktok_t_3', '突袭', { description: '突击' }),
      ],
    })
    const d = detail({ cn }, 'char_306_t')
    expect(['天賦1', '技能1', '技能2', '技能3'].map((l) => entriesOf(d, l).map((e) => [e.source, e.name]))).toEqual([
      [['天賦1', '分身']],
      [['技能1', 'sk_t_1'], ['召喚物技能1', '暗夜'], ['召喚物特性', undefined], ['召喚物套用天賦1', '幻象']],
      [['技能2', 'sk_t_2'], ['召喚物特性', undefined], ['召喚物套用天賦1', '幻象']],
      [['技能3', 'sk_t_3'], ['召喚物技能3', '突袭'], ['召喚物特性', undefined], ['召喚物套用天賦1', '幻象']],
    ])
  })

  test('技能召喚的召喚物只收召喚它那格的召喚物技能', () => {
    const cn = server({
      terms: COMMON_TERMS,
      operators: {
        char_307_e: operator({
          name: '鹰主',
          skills: ['sk_e_1', 'sk_e_2'],
          skillTokens: { sk_e_1: 'token_307_e1', sk_e_2: 'token_307_e2' },
        }),
        token_307_e1: operator({ name: '雪鹰', profession: 'TOKEN', skills: ['sktok_e_1', 'sktok_e_2'] }),
        token_307_e2: operator({ name: '雪鹰', profession: 'TOKEN', skills: ['sktok_e_1', 'sktok_e_2'] }),
      },
      skills: [
        masteredSkill('sk_e_1', '谋略', { description: '召唤' }, { description: '召唤' }),
        masteredSkill('sk_e_2', '变革', { description: '召唤' }, { description: '召唤' }),
        basicSkill('sktok_e_1', '开局', { description: '' }),
        basicSkill('sktok_e_2', '变革已至', { description: '直线攻击' }),
      ],
    })
    const { warnings } = buildIndex({ cn })
    expect(warnings).toEqual([])
    const d = detail({ cn }, 'char_307_e')
    expect(['技能1', '技能2'].map((l) => entriesOf(d, l).map((e) => [e.source, e.name]))).toEqual([
      [['技能1', '谋略'], ['召喚物技能1', '开局']],
      [['技能2', '变革'], ['召喚物技能2', '变革已至']],
    ])
  })

  test('只有特性的召喚物:召喚物特性接在召喚它的技能分頁,文字是召喚物自己的特性敘述', () => {
    const cn = server({
      terms: COMMON_TERMS,
      operators: {
        char_309_v: operator({ name: '盟主', skills: ['sk_v_1', 'sk_v_2'], skillTokens: { sk_v_2: 'token_309_v' } }),
        token_309_v: operator({ name: '雄狮', profession: 'TOKEN', trait: '能够阻挡一个敌人', skills: [null, null] }),
      },
      skills: [
        masteredSkill('sk_v_1', '强击', { description: '攻击力提升' }, { description: '攻击力提升' }),
        masteredSkill('sk_v_2', '召狮', { description: '召唤' }, { description: '召唤' }),
      ],
    })
    const d = detail({ cn }, 'char_309_v')
    expect(['技能1', '技能2'].map((l) => entriesOf(d, l).map((e) => [e.source, e.summon, plain(e.stages[0].runs)]))).toEqual([
      [['技能1', undefined, '攻击力提升']],
      [
        ['技能2', undefined, '召唤'],
        ['召喚物特性', '雄狮', '能够阻挡一个敌人'],
      ],
    ])
  })

  test('技能召喚的召喚物在對應格沒有技能時發建置警告', () => {
    const cn = server({
      terms: COMMON_TERMS,
      operators: {
        char_308_w: operator({ name: '错位', skills: ['sk_w_1', 'sk_w_2'], skillTokens: { sk_w_2: 'token_308_w' } }),
        token_308_w: operator({ name: '箱子', profession: 'TOKEN', skills: ['sktok_w'] }),
      },
      skills: [
        masteredSkill('sk_w_1', '强击', { description: '攻击力提升' }, { description: '攻击力提升' }),
        masteredSkill('sk_w_2', '召', { description: '召唤' }, { description: '召唤' }),
        basicSkill('sktok_w', '爆炸', { description: '爆炸' }),
      ],
    })
    expect(buildIndex({ cn }).warnings.filter((w) => w.includes('token_308_w'))).toHaveLength(1)
  })

  test('對應不到技能或天賦的召喚物:建置發警告,接在最後一個分頁', () => {
    const cn = server({
      terms: COMMON_TERMS,
      operators: {
        char_304_m: operator({ name: '無來源', skills: ['sk_m_1'], tokens: ['token_304_a'] }),
        token_304_a: operator({ name: '甲型', profession: 'TOKEN', talents: [{ name: '冷却', description: '攻击力+10%' }] }),
      },
      skills: [masteredSkill('sk_m_1', '强击', { description: '攻击力提升' }, { description: '攻击力提升' })],
    })
    const { warnings } = buildIndex({ cn })
    expect(warnings.filter((w) => w.includes('token_304_a'))).toHaveLength(1)
    const d = detail({ cn }, 'char_304_m')
    expect(d.tabs.at(-1)!.entries.map((e) => [e.source, e.summon])).toEqual([
      ['技能1', undefined],
      ['召喚物套用天賦1', '甲型'],
    ])
  })

  test('特性的名稱是分支名稱', () => {
    const cn = caster()
    cn.uniequipTable = { equipDict: {}, subProfDict: { corecaster: { subProfessionId: 'corecaster', subProfessionName: '中坚术师' } } }
    expect(entriesOf(detail({ cn }, 'char_001_x'), '特性').map((e) => [e.source, e.name])).toEqual([['特性', '中坚术师']])
  })

  test('召喚物的同一段技能文字相同但技力不同時不合併', () => {
    const cn = server({
      terms: COMMON_TERMS,
      operators: {
        char_304_m: operator({ name: '多召喚', trait: '攻击造成法术伤害', tokens: ['token_304_a', 'token_304_b'] }),
        token_304_a: operator({ name: '甲型', profession: 'TOKEN', skills: ['sktok_a'] }),
        token_304_b: operator({ name: '乙型', profession: 'TOKEN', skills: ['sktok_b'] }),
      },
      skills: [
        basicSkill('sktok_a', '冲击', { description: '攻击力提升', sp: { spCost: 10 } }),
        basicSkill('sktok_b', '冲击', { description: '攻击力提升', sp: { spCost: 20 } }),
      ],
    })
    const skills = detail({ cn }, 'char_304_m').tabs.at(-1)!.entries.filter((e) => e.summon)
    expect(skills.map((e) => [e.summon, e.stages[0].stats?.sp?.cost])).toEqual([
      ['甲型', 10],
      ['乙型', 20],
    ])
  })

  test('模組新增的天賦:無模組階段不存在,預設停在第一個模組3', () => {
    const cn = server({
      terms: COMMON_TERMS,
      operators: { char_200_m: operator({ name: '模組者', talents: [{ name: '原天赋', description: '攻击力+10%' }] }) },
      modules: [
        { id: 'uniequip_002_m', charId: 'char_200_m', name: '甲模組', code: 'CCR-X', talents: [{ index: -1, name: '寒流', description: '攻击力+5%' }] },
        { id: 'uniequip_003_m', charId: 'char_200_m', name: '乙模組', code: 'CCR-Y', talents: [{ index: -1, name: '寒流', description: '攻击力+6%' }] },
      ],
    })
    const [added] = entriesOf(detail({ cn }, 'char_200_m'), '天賦2')
    expect([added.source, added.name]).toEqual(['天賦2', '寒流'])
    expect(added.stages.map((s) => [s.label, s.absent ?? false, s.module])).toEqual([
      ['無模組', true, undefined],
      ['模組3 · CCR-X', false, '甲模組'],
      ['模組3 · CCR-Y', false, '乙模組'],
    ])
    expect(added.defaultStage).toBe(1)
  })

  test('預設階段是最低的存在階段,即使只有專精3 命中', () => {
    const d = detail({ cn: caster() }, 'char_001_x', { conditions: applying('ba.cold') })
    const [frozen] = entriesOf(d, '技能2')
    expect(frozen.stages.map((s) => s.hit)).toEqual([false, true])
    expect(frozen.defaultStage).toBe(0)
  })

  test('命中目前搜尋條件的階段有高亮、命中旗標與效果類型;未命中的階段沒有', () => {
    const d = detail({ cn: caster() }, 'char_001_x', { conditions: applying('ba.cold') })
    const [frozen] = entriesOf(d, '技能2')
    const [lv7, m3] = frozen.stages
    expect([m3.hit, m3.effects]).toEqual([true, { 'ba.cold': ['apply'] }])
    expect(lit(m3.runs)).toEqual(['寒冷'])
    expect([lv7.hit, lv7.effects, lit(lv7.runs)]).toEqual([false, {}, []])
    const [skill1] = entriesOf(d, '技能1')
    expect(skill1.stages.map((s) => s.hit)).toEqual([false, false])
  })

  test('同一關鍵字的效果類型不符合搜尋條件時,不算命中也不高亮;其他關鍵字照樣標關鍵字但不高亮', () => {
    const cn = server({
      terms: COMMON_TERMS,
      operators: { char_001_x: operator({ name: '甲', talents: [{ name: '冰', description: '对<$ba.cold>寒冷</>敌人造成伤害，并使其<$ba.stun>晕眩</>' }] }) },
    })
    const [talent] = entriesOf(detail({ cn }, 'char_001_x', { conditions: applying('ba.cold', 'ba.stun') }), '天賦1')
    expect(talent.stages[0].effects).toEqual({ 'ba.stun': ['apply'] })
    expect(lit(talent.stages[0].runs)).toEqual(['晕眩'])
    expect(highlights(talent.stages[0].runs)).toEqual([
      ['寒冷', 'ba.cold'],
      ['晕眩', 'ba.stun'],
    ])
  })

  test('沒有搜尋條件時沒有命中、效果類型與高亮', () => {
    const d = detail({ cn: caster() }, 'char_001_x')
    for (const tab of d.tabs)
      for (const e of tab.entries)
        for (const s of e.stages) expect([s.hit, s.effects, lit(s.runs)]).toEqual([false, {}, []])
  })

  test('技能各階段帶技力與圖示,沒有關鍵字的技能也一樣', () => {
    const [skill1] = entriesOf(detail({ cn: caster() }, 'char_001_x'), '技能1')
    expect(skill1.icon).toBe('skill-icons/sk_1.webp')
    expect(skill1.stages.map((s) => s.stats?.sp?.cost)).toEqual([9, 8])
  })

  test('台服:用台服文字與技力;台服沒有的模組不列出,陸服模式標「台服未實裝」', () => {
    const cn = server({
      terms: COMMON_TERMS,
      operators: { char_630_m: operator({ name: '模組者', trait: '攻击造成法术伤害', skills: ['sk_1'] }) },
      skills: [masteredSkill('sk_1', '强击', { description: '攻击力+50%' }, { description: '攻击力+80%', sp: { spCost: 30 } })],
      modules: [
        { id: 'uniequip_002_m', charId: 'char_630_m', name: '甲模组', code: 'CCR-X', trait: { add: '攻击使敌人<$ba.cold>寒冷</>' } },
        { id: 'uniequip_003_m', charId: 'char_630_m', name: '乙模组', code: 'CCR-Y', trait: { add: '攻击力提升' } },
      ],
    })
    const tw = server({
      terms: COMMON_TERMS,
      operators: { char_630_m: operator({ name: '模組者', trait: '攻擊造成法術傷害', skills: ['sk_1'], style: 'object' }) },
      skills: [masteredSkill('sk_1', '強擊', { description: '攻擊力+50%' }, { description: '攻擊力+80%', sp: { spCost: 28 } }, 'object')],
    })
    tw.uniequipTable = {
      equipDict: { uniequip_002_m: { uniEquipId: 'uniequip_002_m', uniEquipName: '甲模組', typeIcon: 'ccr-x', charId: 'char_630_m', type: 'ADVANCED' } },
    }
    const twDetail = detail({ cn, tw }, 'char_630_m', { server: 'tw' })
    expect(entriesOf(twDetail, '特性')[0].stages.map((s) => [s.label, plain(s.runs)])).toEqual([
      ['無模組', '攻擊造成法術傷害'],
      ['模組3 · CCR-X', '攻击造成法术伤害\n攻击使敌人寒冷'],
    ])
    const [twSkill] = entriesOf(twDetail, '技能1')
    expect([twSkill.name, plain(twSkill.stages[1].runs), twSkill.stages[1].stats?.sp?.cost]).toEqual(['強擊', '攻擊力+80%', 28])

    const cnDetail = detail({ cn, tw }, 'char_630_m', { server: 'cn' })
    expect(entriesOf(cnDetail, '特性')[0].stages.map((s) => [s.label, s.twUnreleased ?? false])).toEqual([
      ['無模組', false],
      ['模組3 · CCR-X', false],
      ['模組3 · CCR-Y', true],
    ])
    expect(entriesOf(cnDetail, '技能1')[0].stages[1].stats?.sp?.cost).toBe(30)
  })

  test('台服未實裝的幹員:模組3 階段不標「台服未實裝」', () => {
    const cn = server({
      terms: COMMON_TERMS,
      operators: { char_631_n: operator({ name: '新模組者', trait: '攻击造成法术伤害' }) },
      modules: [{ id: 'uniequip_002_n', charId: 'char_631_n', name: '新模组', code: 'CCR-X', trait: { add: '攻击使敌人<$ba.cold>寒冷</>' } }],
    })
    const tw = server({ terms: COMMON_TERMS, operators: {} })
    const d = detail({ cn, tw }, 'char_631_n', { server: 'cn' })
    expect(entriesOf(d, '特性')[0].stages.map((s) => [s.label, s.twUnreleased ?? false])).toEqual([
      ['無模組', false],
      ['模組3 · CCR-X', false],
    ])
  })

  test('只存在陸服的幹員:幹員檔沒有台服文字', () => {
    const tw = server({ terms: COMMON_TERMS, operators: {} })
    const { operatorFiles } = buildIndex({ cn: caster(), tw })
    const [file] = operatorFiles
    expect(file.inTw).toBe(false)
    expect(file.entries.every((e) => e.stages.every((s) => !s.tw))).toBe(true)
  })
})

describe('幹員檔的位置', () => {
  test('每位幹員帶指向自己幹員檔的路徑,檔名帶內容雜湊,內容一變路徑就變', () => {
    const first = buildIndex({ cn: caster() })
    const files = attachOperatorFiles(first.index, first.operatorFiles)
    const [op] = first.index.operators
    expect(op.detail).toMatch(/^data\/operators\/char_001_x\.[0-9a-f]{8}\.json$/)
    expect(JSON.parse(files.get(op.detail!)!)).toEqual(first.operatorFiles[0])

    const raw = caster()
    raw.skillTable.sk_1.levels[9].description = '攻击力+90%'
    const second = buildIndex({ cn: raw })
    attachOperatorFiles(second.index, second.operatorFiles)
    expect(second.index.operators[0].detail).not.toBe(op.detail)
  })
})

/** 被標成高亮的文字。 */
function lit(runs: { t: string; h?: true }[]): string[] {
  return runs.filter((r) => r.h).map((r) => r.t)
}
