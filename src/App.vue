<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { loadIndex } from './core/loadIndex'
import { query } from './core/query'
import type { SearchIndex } from './core/types'
import ResultCard from './components/ResultCard.vue'

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

const results = computed(() => (index.value ? query(index.value, { keywords: selected.value, server: 'cn' }) : []))

function toggle(id: string) {
  selected.value = selected.value.includes(id) ? selected.value.filter((k) => k !== id) : [...selected.value, id]
}
</script>

<template>
  <div class="app">
    <header class="top">
      <h1>明日方舟關鍵字搜尋</h1>
    </header>
    <p v-if="error" class="error">{{ error }}</p>
    <main v-else-if="index" class="layout">
      <aside class="panel">
        <div class="kw-list">
          <button
            v-for="k in index.keywords"
            :key="k.id"
            class="kw"
            :class="{ on: selected.includes(k.id) }"
            :aria-pressed="selected.includes(k.id)"
            @click="toggle(k.id)"
          >
            {{ k.name }}
          </button>
        </div>
      </aside>
      <section class="results">
        <p v-if="selected.length === 0" class="hint">點選關鍵字開始搜尋</p>
        <ResultCard v-for="op in results" :key="op.id" :op="op" :selected="selected" />
      </section>
    </main>
    <p v-else class="hint">載入中…</p>
  </div>
</template>
