<script setup lang="ts">
import { computed } from 'vue'
import { keywordGroups } from '../core/query'
import type { SearchIndex, Server } from '../core/types'

const props = defineProps<{
  index: SearchIndex
  server: Server
  selected: string[]
}>()
const emit = defineEmits<{ toggle: [id: string] }>()

const groups = computed(() => keywordGroups(props.index, props.server))
</script>

<template>
  <div class="kw-panel">
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
