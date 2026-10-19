<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { loadIndex } from './core/loadIndex'
import { filterOptions, query } from './core/query'
import {
  EFFECT_TYPE_LABELS,
  PROFESSION_LABELS,
  type EffectType,
  type IndexKeyword,
  type Profession,
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
const selected = ref<string[]>([])
// 預設只勾「施加」:最常問的「誰能上 X」一打開就是答案
const effectTypes = ref<EffectType[]>(['apply'])
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
const options = computed(() => (index.value ? filterOptions(index.value) : { rarities: [], professions: [] }))
const results = computed(() =>
  index.value
    ? query(index.value, {
        keywords: selected.value,
        server: server.value,
        effectTypes: effectTypes.value,
        rarities: rarities.value,
        professions: professions.value,
        subProfessions: branch.value ? [branch.value] : [],
      })
    : [],
)

/** 沒有結果時列出目前生效的條件,讓使用者知道要放寬哪一項。 */
const conditions = computed(() => {
  const list = [
    `關鍵字:${selected.value.map((k) => keywordMap.value.get(k)?.name ?? k).join('、')}`,
    `伺服器:${server.value === 'tw' ? '台服' : '國服'}`,
    `效果類型:${effectTypes.value.length ? effectTypes.value.map((t) => EFFECT_TYPE_LABELS[t]).join('、') : '(未勾選)'}`,
  ]
  if (rarities.value.length) list.push(`星級:${[...rarities.value].sort((a, b) => b - a).map((r) => `${r}★`).join('、')}`)
  if (professions.value.length) list.push(`職業:${professions.value.map((p) => PROFESSION_LABELS[p]).join('、')}`)
  if (branch.value) list.push(`分支:${index.value?.subProfessions[branch.value]?.name ?? branch.value}`)
  return list
})

function toggle(id: string) {
  selected.value = selected.value.includes(id) ? selected.value.filter((k) => k !== id) : [...selected.value, id]
}

function clear() {
  selected.value = []
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
          v-model:effect-types="effectTypes"
          v-model:rarities="rarities"
          v-model:professions="professions"
          v-model:branch="branch"
          :options="options"
        />
        <div v-if="selected.length > 0" class="chips">
          <span v-for="id in selected" :key="id" class="chip">
            <span :data-k="id" class="chip-name">{{ keywordMap.get(id)?.name ?? id }}</span>
            <button class="chip-x" :aria-label="`移除 ${keywordMap.get(id)?.name ?? id}`" @click.stop="toggle(id)">×</button>
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
              <li v-for="c in conditions" :key="c">{{ c }}</li>
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
      資料版本:國服 {{ index.versions.cn }}<template v-if="index.versions.tw"> · 台服 {{ index.versions.tw }}</template>
      <span class="footer-note">遊戲資料來自 Kengxxiao/ArknightsGameData 與 arkntools/arknights-data-tw-for-maa</span>
    </footer>
    <KeywordTip :keywords="keywordMap" :selected="selected" @toggle="toggle" />
  </div>
</template>
