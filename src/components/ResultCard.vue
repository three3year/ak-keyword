<script setup lang="ts">
import { EFFECT_TYPE_LABELS, type IndexKeyword, type ResultOperator } from '../core/types'
import RichText from './RichText.vue'

defineProps<{
  op: ResultOperator
  selected: string[]
  keywords: Map<string, IndexKeyword>
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
        <span v-if="e.summon" class="badge summon">{{ e.summon }}</span>
        <span v-if="e.name" class="entry-name">{{ e.name }}</span>
        <span v-if="e.only" class="badge only">{{ e.only }}</span>
      </div>
      <div class="stages" :class="{ single: e.stages.length === 1 }">
        <div v-for="(s, j) in e.stages" :key="j" class="stage" :class="{ miss: !s.hit }">
          <div v-if="s.label || s.cnData" class="stage-label">
            <span>{{ s.label }}</span>
            <span v-if="s.cnData" class="badge" title="台服沒有模組數值資料,文字與數值取自國服">國服資料</span>
            <span v-for="(fx, k) in s.effects" :key="k" class="fx" :class="`fx-${fx}`">
              {{ selected.length > 1 ? `${keywords.get(k)?.name ?? k}:` : '' }}{{ EFFECT_TYPE_LABELS[fx] }}
            </span>
          </div>
          <RichText class="stage-text" :runs="s.runs" :selected="selected" />
        </div>
      </div>
    </section>
  </article>
</template>
