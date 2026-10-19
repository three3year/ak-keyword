<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { loadIndex } from './core/loadIndex'
import { availableTypes, filterOptions, footerItems, query } from './core/query'
import {
  EFFECT_TYPE_LABELS,
  EFFECT_TYPES,
  PROFESSION_LABELS,
  type EffectType,
  type IndexKeyword,
  type Profession,
  type SearchCondition,
  type SearchIndex,
  type Server,
} from './core/types'
import FilterBar from './components/FilterBar.vue'
import KeywordPanel from './components/KeywordPanel.vue'
import KeywordTip from './components/KeywordTip.vue'
import ResultCard from './components/ResultCard.vue'
import { loadServer, saveServer } from './ui/storage'
import { hideTip, isTouch, showTip, tip } from './ui/tip'

const index = shallowRef<SearchIndex>()
const error = ref('')
/** 已選關鍵字(依加入順序)與各自亮著的效果類型;每亮一顆就是一個搜尋條件。 */
const selection = ref<{ keyword: string; types: EffectType[] }[]>([])
const selected = computed(() => selection.value.map((s) => s.keyword))
const conditions = computed<SearchCondition[]>(() => selection.value.flatMap((s) => s.types.map((type) => ({ keyword: s.keyword, type }))))
const server = ref<Server>(loadServer())
watch(server, saveServer)
const rarities = ref<number[]>([])
const professions = ref<Profession[]>([])
const branch = ref('')
// 窄螢幕上關鍵字面板收合成抽屜
const drawerOpen = ref(false)

onMounted(async () => {
  try {
    index.value = await loadIndex()
  } catch (e) {
    error.value = String(e)
  }
})

const keywordMap = computed(() => new Map<string, IndexKeyword>((index.value?.keywords ?? []).map((k) => [k.id, k])))
const footer = computed(() => (index.value ? footerItems(index.value) : []))
const options = computed(() => (index.value ? filterOptions(index.value) : { rarities: [], professions: [] }))
const results = computed(() =>
  index.value
    ? query(index.value, {
        conditions: conditions.value,
        server: server.value,
        rarities: rarities.value,
        professions: professions.value,
        subProfessions: branch.value ? [branch.value] : [],
      })
    : [],
)

/** 各已選關鍵字在目前伺服器有資料的效果類型;沒資料的類型鈕反灰。 */
const available = computed(
  () => new Map(selection.value.map((s) => [s.keyword, index.value ? availableTypes(index.value, server.value, s.keyword) : []])),
)

/** 沒資料的類型鈕不能點;但已亮著的(例如切換伺服器後才沒資料)仍可關掉。 */
function hasData(id: string, type: EffectType): boolean {
  return !!available.value.get(id)?.includes(type)
}

/** 沒有結果時列出目前生效的條件,讓使用者知道要放寬哪一項。 */
const emptyConditions = computed(() => {
  const list = [
    `搜尋條件:${conditions.value.map((c) => `${EFFECT_TYPE_LABELS[c.type]}-${keywordName(c.keyword)}`).join('、')}`,
    `伺服器:${server.value === 'tw' ? '台服' : '國服'}`,
  ]
  if (rarities.value.length) list.push(`星級:${[...rarities.value].sort((a, b) => b - a).map((r) => `${r}★`).join('、')}`)
  if (professions.value.length) list.push(`職業:${professions.value.map((p) => PROFESSION_LABELS[p]).join('、')}`)
  if (branch.value) list.push(`分支:${index.value?.subProfessions[branch.value]?.name ?? branch.value}`)
  return list
})

function keywordName(id: string): string {
  return keywordMap.value.get(id)?.name ?? id
}

/** 面板、命中敘述、提示框的點選:未選就加入並只亮「施加」(最常問的「誰能上 X」),已選就移除。 */
function toggle(id: string) {
  if (selected.value.includes(id)) remove(id)
  else selection.value = [...selection.value, { keyword: id, types: ['apply'] }]
}

function remove(id: string) {
  selection.value = selection.value.filter((s) => s.keyword !== id)
}

/** chip 上的類型鈕:切換該類型;關掉最後一顆等於移除 chip。 */
function toggleType(id: string, type: EffectType) {
  selection.value = selection.value
    .map((s) => {
      if (s.keyword !== id) return s
      const on = s.types.includes(type) ? s.types.filter((t) => t !== type) : [...s.types, type]
      return { keyword: id, types: EFFECT_TYPES.filter((t) => on.includes(t)) }
    })
    .filter((s) => s.types.length > 0)
}

function clear() {
  selection.value = []
}

// ---- 提示框:以事件委派處理所有帶 data-k(關鍵字)與 data-p(潛能加成)的元素 ----

function target(e: Event): HTMLElement | null {
  return (e.target as HTMLElement | null)?.closest?.('[data-k],[data-p]') ?? null
}

function onOver(e: MouseEvent) {
  if (isTouch() || tip.pinned) return
  const el = target(e)
  if (!el) return
  if (el.dataset.k) showTip(el, { keyword: el.dataset.k })
  else if (el.dataset.p) showTip(el, { text: el.dataset.p })
}

function onOut(e: MouseEvent) {
  if (tip.pinned) return
  if (target(e)) hideTip()
}

function onClick(e: MouseEvent) {
  const el = target(e)
  if (!el) {
    if (tip.pinned) hideTip()
    return
  }
  const inText = !!el.closest('.rich')
  if (el.dataset.p) {
    showTip(el, { text: el.dataset.p }, { pinned: true })
  } else if (el.dataset.k && el.classList.contains('chip-name')) {
    showTip(el, { keyword: el.dataset.k }, { pinned: true })
  } else if (el.dataset.k && el.classList.contains('kw') && isTouch()) {
    // 觸控裝置沒有懸停:點面板的關鍵字按鈕時,除了切換選取也顯示定義
    showTip(el, { keyword: el.dataset.k }, { pinned: true })
  } else if (el.dataset.k && inText) {
    // 命中敘述裡的詞:桌機直接切換選取;觸控裝置先顯示定義,再由提示框切換
    if (isTouch()) showTip(el, { keyword: el.dataset.k }, { pinned: true, toggle: true })
    else {
      hideTip()
      toggle(el.dataset.k)
    }
  }
}

function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  hideTip()
  drawerOpen.value = false
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="app" @mouseover="onOver" @mouseout="onOut" @click="onClick">
    <header class="top">
      <h1>明日方舟關鍵字搜尋</h1>
      <button v-if="index" class="btn drawer-btn" :aria-expanded="drawerOpen" @click.stop="drawerOpen = !drawerOpen">
        關鍵字<template v-if="selected.length">({{ selected.length }})</template>
      </button>
    </header>
    <p v-if="error" class="error">{{ error }}</p>
    <main v-else-if="index" class="layout">
      <div v-if="drawerOpen" class="backdrop" @click="drawerOpen = false"></div>
      <aside class="panel" :class="{ open: drawerOpen }" aria-label="關鍵字面板">
        <div class="drawer-head">
          <strong>關鍵字</strong>
          <button class="btn" @click="drawerOpen = false">完成</button>
        </div>
        <KeywordPanel :index="index" :selected="selected" @toggle="toggle" @clear="clear" />
      </aside>
      <section class="results">
        <FilterBar
          v-model:server="server"
          v-model:rarities="rarities"
          v-model:professions="professions"
          v-model:branch="branch"
          :options="options"
        />
        <div v-if="selection.length > 0" class="chips">
          <span v-for="s in selection" :key="s.keyword" class="chip" data-testid="chip">
            <span :data-k="s.keyword" class="chip-name">{{ keywordName(s.keyword) }}</span>
            <span class="chip-types" role="group" :aria-label="`${keywordName(s.keyword)}的效果類型`">
              <button
                v-for="t in EFFECT_TYPES"
                :key="t"
                type="button"
                class="chip-type"
                :class="[`fx-${t}`, { on: s.types.includes(t), empty: !hasData(s.keyword, t) }]"
                :aria-pressed="s.types.includes(t)"
                :disabled="!hasData(s.keyword, t) && !s.types.includes(t)"
                :title="hasData(s.keyword, t) ? undefined : `目前伺服器沒有${EFFECT_TYPE_LABELS[t]}-${keywordName(s.keyword)}的敘述`"
                @click.stop="toggleType(s.keyword, t)"
              >
                {{ EFFECT_TYPE_LABELS[t] }}
              </button>
            </span>
            <button class="chip-x" :aria-label="`移除 ${keywordName(s.keyword)}`" @click.stop="remove(s.keyword)">×</button>
          </span>
        </div>
        <p v-if="selected.length === 0" class="hint">點選關鍵字開始搜尋</p>
        <template v-else>
          <div class="result-meta">
            <span data-testid="result-count">共 {{ results.length }} 位幹員</span>
            <span class="sort-note" title="遊戲資料沒有實裝時間,實裝順序以潛能信物編號近似">排序:星級 → 職業 → 實裝新到舊(近似)</span>
          </div>
          <div v-if="results.length === 0" class="empty" data-testid="empty">
            <strong>沒有符合的幹員</strong>
            <ul>
              <li v-for="c in emptyConditions" :key="c">{{ c }}</li>
            </ul>
          </div>
          <ResultCard
            v-for="op in results"
            :key="op.id"
            :op="op"
            :selected="selected"
            :keywords="keywordMap"
            :branch-name="index.subProfessions[op.subProfession]?.name ?? op.subProfession"
          />
        </template>
      </section>
    </main>
    <p v-else class="hint">載入中…</p>
    <footer v-if="index" class="footer">
      <template v-for="(item, i) in footer" :key="item.label">
        <template v-if="i > 0"> · </template>
        <a :href="item.source.url" target="_blank" rel="noopener noreferrer" :title="`資料來源:${item.source.name}`">{{ item.label }}</a>
        <template v-if="item.version">{{ ` ${item.version} · ${item.downloadedAt}` }}</template>
      </template>
    </footer>
    <KeywordTip :keywords="keywordMap" :selected="selected" @toggle="toggle" />
  </div>
</template>
