<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { loadIndex } from './core/loadIndex'
import { query } from './core/query'
import type { IndexKeyword, SearchIndex } from './core/types'
import KeywordPanel from './components/KeywordPanel.vue'
import KeywordTip from './components/KeywordTip.vue'
import ResultCard from './components/ResultCard.vue'
import { hideTip, isTouch, showTip, tip } from './ui/tip'

const index = shallowRef<SearchIndex>()
const error = ref('')
const selected = ref<string[]>([])

onMounted(async () => {
  try {
    index.value = await loadIndex()
  } catch (e) {
    error.value = String(e)
  }
})

const keywordMap = computed(() => new Map<string, IndexKeyword>((index.value?.keywords ?? []).map((k) => [k.id, k])))
const results = computed(() => (index.value ? query(index.value, { keywords: selected.value, server: 'cn' }) : []))

function toggle(id: string) {
  selected.value = selected.value.includes(id) ? selected.value.filter((k) => k !== id) : [...selected.value, id]
}

function clear() {
  selected.value = []
}

// ---- 說明框:以事件委派處理所有帶 data-k(關鍵字)與 data-p(潛能加成)的元素 ----

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
  } else if (el.dataset.k && inText) {
    // 命中敘述裡的詞:桌機直接切換選取;觸控裝置先顯示定義,再由說明框切換
    if (isTouch()) showTip(el, { keyword: el.dataset.k }, { pinned: true, toggle: true })
    else {
      hideTip()
      toggle(el.dataset.k)
    }
  }
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') hideTip()
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="app" @mouseover="onOver" @mouseout="onOut" @click="onClick">
    <header class="top">
      <h1>明日方舟關鍵字搜尋</h1>
    </header>
    <p v-if="error" class="error">{{ error }}</p>
    <main v-else-if="index" class="layout">
      <aside class="panel">
        <KeywordPanel :index="index" :selected="selected" @toggle="toggle" @clear="clear" />
      </aside>
      <section class="results">
        <div v-if="selected.length > 0" class="chips">
          <span v-for="id in selected" :key="id" class="chip">
            <span :data-k="id" class="chip-name">{{ keywordMap.get(id)?.name ?? id }}</span>
            <button class="chip-x" :aria-label="`移除 ${keywordMap.get(id)?.name ?? id}`" @click.stop="toggle(id)">×</button>
          </span>
        </div>
        <p v-if="selected.length === 0" class="hint">點選關鍵字開始搜尋</p>
        <ResultCard v-for="op in results" :key="op.id" :op="op" :selected="selected" />
      </section>
    </main>
    <p v-else class="hint">載入中…</p>
    <KeywordTip :keywords="keywordMap" :selected="selected" @toggle="toggle" />
  </div>
</template>
