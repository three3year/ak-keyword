// 一次性:列出票 05 要重判的配對
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildIndex, type Overrides } from './buildIndex'
const ROOT = join(import.meta.dirname, '..')
const raw = (s: string, f: string) => JSON.parse(readFileSync(join(ROOT, '.cache', 'raw', s, f + '.json'), 'utf8'))
const load = (s: string, files: string[]) => {
  const o: any = { downloadedAt: '' }
  const map: Record<string, string> = { character_table: 'characterTable', skill_table: 'skillTable', gamedata_const: 'gamedataConst', uniequip_table: 'uniequipTable', battle_equip_table: 'battleEquipTable', char_patch_table: 'charPatchTable', item_table: 'itemTable' }
  for (const f of files) o[map[f]] = raw(s, f)
  return o
}
const cn = load('cn', ['character_table', 'skill_table', 'gamedata_const', 'uniequip_table', 'battle_equip_table', 'char_patch_table', 'item_table'])
const tw = load('tw', ['character_table', 'skill_table', 'gamedata_const', 'uniequip_table', 'char_patch_table'])
const data = (f: string) => JSON.parse(readFileSync(join(ROOT, 'data', f), 'utf8'))
const input = { cn, tw, groups: data('keyword-groups.json'), supplements: data('supplementary-keywords.json'), excludedTerms: data('excluded-terms.json') }
const overrides: Overrides = data('effect-overrides.json')
const { pending: noOverride, index } = buildIndex({ ...input, overrides: {} })
const { pending } = buildIndex({ ...input, overrides })
const dropped = JSON.parse(readFileSync(join(ROOT, 'review', 'migration', 'dropped-other.json'), 'utf8'))
const names = new Map(index.keywords.map((k) => [k.id, k.name]))
const multi = noOverride.filter((p) => p.ruleTypes.length > 1)
const other = pending.filter((p) => dropped[p.key])
const rest = pending.filter((p) => !dropped[p.key])
const fmt = (p: any, cat: string) => ({ cat, key: p.key, keyword: `${names.get(p.keyword)}(${p.keyword})`, rule: p.ruleTypes, old: overrides[p.key]?.types ?? (dropped[p.key] ? 'other' : undefined), oldNote: dropped[p.key]?.note, text: p.text, where: p.where[0] })
const all = [...other.map((p) => fmt(p, 'other')), ...multi.filter((p) => !dropped[p.key]).map((p) => fmt(p, 'multi')), ...rest.map((p) => fmt(p, 'pending'))]
writeFileSync(join(ROOT, 'review', 'rereview-0002.json'), JSON.stringify(all, null, 1))
console.log('other', other.length, 'multi', multi.length, 'multi∩other', multi.filter((p) => dropped[p.key]).length, 'other pending not dropped', rest.length, 'dropped total', Object.keys(dropped).length)
