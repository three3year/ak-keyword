<script setup lang="ts">
import type { ResultOperator } from '../core/types'
import RichText from './RichText.vue'

defineProps<{
  op: ResultOperator
  selected: string[]
}>()
</script>

<template>
  <article class="card" data-testid="result-card">
    <header class="card-head">
      <h3 class="op-name">{{ op.name }}</h3>
    </header>
    <section v-for="(e, i) in op.entries" :key="i" class="entry">
      <div class="entry-head">
        <span class="source">{{ e.source }}</span>
        <span v-if="e.name" class="entry-name">{{ e.name }}</span>
        <span v-if="e.only" class="badge only">{{ e.only }}</span>
      </div>
      <div class="stages" :class="{ single: e.stages.length === 1 }">
        <div v-for="(s, j) in e.stages" :key="j" class="stage" :class="{ miss: !s.hit }">
          <div class="stage-label">{{ s.label }}</div>
          <RichText class="stage-text" :runs="s.runs" :selected="selected" />
        </div>
      </div>
    </section>
  </article>
</template>
