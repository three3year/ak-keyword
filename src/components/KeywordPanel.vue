<script setup lang="ts">
import { computed, ref } from 'vue'
import { keywordGroups } from '../core/query'
import type { SearchIndex } from '../core/types'

const props = defineProps<{
  index: SearchIndex
  selected: string[]
}>()
const emit = defineEmits<{ toggle: [id: string]; clear: [] }>()

const filter = ref('')
const groups = computed(() => keywordGroups(props.index, filter.value))
</script>

<template>
  <div class="kw-panel">
    <div class="kw-tools">
      <input v-model="filter" class="kw-filter" type="search" placeholder="過濾關鍵字…" aria-label="過濾關鍵字" />
      <button class="btn" :disabled="selected.length === 0" @click="emit('clear')">清除</button>
    </div>
    <p v-if="groups.length === 0" class="hint small">沒有符合的關鍵字</p>
    <section v-for="g in groups" :key="g.name" class="kw-group">
      <h2 class="kw-group-name">{{ g.name }}</h2>
      <div class="kw-list">
        <button
          v-for="k in g.keywords"
          :key="k.id"
          class="kw"
          :class="{ on: selected.includes(k.id), sup: k.unofficial }"
          :data-k="k.id"
          :aria-pressed="selected.includes(k.id)"
          @click="emit('toggle', k.id)"
        >
          {{ k.name }}
        </button>
      </div>
    </section>
  </div>
</template>
