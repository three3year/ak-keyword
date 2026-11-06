// 重算 operator-attributes 規格「其他備註」的資料統計
// 用法:node stats.cjs <repo> <handbook_team_table.json>
const fs = require('fs')
const path = require('path')
const [repo, teamPath] = process.argv.slice(2)
const team = JSON.parse(fs.readFileSync(teamPath, 'utf8'))
const PROF = ['SNIPER', 'CASTER', 'WARRIOR', 'PIONEER', 'MEDIC', 'SUPPORT', 'TANK', 'SPECIAL']
const load = (s, t) => JSON.parse(fs.readFileSync(path.join(repo, '.cache/raw', s, t + '.json'), 'utf8'))

function operators(s) {
  const ct = load(s, 'character_table')
  const patch = load(s, 'char_patch_table').patchChars
  const all = { ...ct, ...patch }
  return Object.fromEntries(Object.entries(all).filter(([k, c]) => k.startsWith('char_') && PROF.includes(c.profession) && !c.isNotObtainable))
}
const tiers = (p) => [p.nationId, p.groupId, p.teamId].filter(Boolean)
const faction = (c) => JSON.stringify({ main: tiers(c), sub: (c.subPower ?? []).map(tiers) })
const top = (c) => c.phases.at(-1).attributesKeyFrames.at(-1).data
const KEYS = ['maxHp', 'atk', 'def', 'magicResistance', 'cost', 'blockCnt', 'baseAttackTime', 'respawnTime']

const ops = { cn: operators('cn'), tw: operators('tw') }
for (const s of ['cn', 'tw']) {
  const o = Object.values(ops[s])
  const ids = new Set()
  for (const c of o) { tiers(c).forEach((x) => ids.add(x)); (c.subPower ?? []).forEach((p) => tiers(p).forEach((x) => ids.add(x))) }
  const varies = (k) => o.filter((c) => new Set(c.phases.map((p) => p.attributesKeyFrames.at(-1).data[k])).size > 1).length
  const favorLv = new Set(o.flatMap((c) => c.favorKeyFrames.map((f) => f.level)))
  const favorAttrs = new Set(o.flatMap((c) => KEYS.filter((k) => c.favorKeyFrames.at(-1).data[k])))
  console.log(s, {
    operators: o.length,
    factionIds: ids.size,
    missingInTable: [...ids].filter((i) => !team[i]),
    noFaction: o.filter((c) => tiers(c).length === 0).length,
    withSub: o.filter((c) => c.subPower?.length).length,
    maxSub: Math.max(...o.map((c) => c.subPower?.length ?? 0)),
    blockCntVaries: varies('blockCnt'), attackTimeVaries: varies('baseAttackTime'), respawnVaries: varies('respawnTime'),
    favorLevels: [...favorLv], favorAttrs: [...favorAttrs],
  })
}
console.log('table entries', Object.keys(team).length)
const shared = Object.keys(ops.tw).filter((k) => ops.cn[k])
const statDiff = shared.flatMap((k) => KEYS.filter((x) => top(ops.cn[k])[x] !== top(ops.tw[k])[x]).map((x) => `${ops.cn[k].name} ${x} cn=${top(ops.cn[k])[x]} tw=${top(ops.tw[k])[x]}`))
console.log('shared', shared.length, 'statDiff', statDiff)
const facDiff = shared.filter((k) => faction(ops.cn[k]) !== faction(ops.tw[k]))
console.log('factionDiff', facDiff.length)
const hx = shared.find((k) => ops.cn[k].name === '鸿雪')
if (hx) console.log('鸿雪', faction(ops.cn[hx]), faction(ops.tw[hx]))
