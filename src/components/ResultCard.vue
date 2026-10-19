<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { EFFECT_TYPE_LABELS, PROFESSION_LABELS, type IndexKeyword, type ResultEntry, type ResultOperator } from '../core/types'
import RichText from './RichText.vue'

const props = defineProps<{
  op: ResultOperator
  selected: string[]
  keywords: Map<string, IndexKeyword>
  branchName: string
}>()

// 卡片狀態(目前分頁、各分頁目前階段)只存在這張卡內;查詢結果重算(op 換成新物件)時回到預設
const tab = ref(0)
const stageOf = ref<Record<number, number>>({})
watch(
  () => props.op,
  () => {
    tab.value = 0
    stageOf.value = {}
  },
)

/** 預設顯示第一個命中的階段。 */
function defaultStage(e: ResultEntry): number {
  return Math.max(0, e.stages.findIndex((s) => s.hit))
}

const entry = computed(() => props.op.entries[tab.value] ?? props.op.entries[0])
const stageIndex = computed(() => stageOf.value[tab.value] ?? defaultStage(entry.value))
const stage = computed(() => entry.value.stages[stageIndex.value] ?? entry.value.stages[0])
const id = useId()

function onAvatarError(e: Event) {
  const img = e.target as HTMLImageElement
  if (!img.src.endsWith('avatar-placeholder.svg')) img.src = 'avatar-placeholder.svg'
}
</script>

<template>
  <article class="card" data-testid="result-card">
    <header class="card-head">
      <img
        class="avatar"
        :src="op.avatar ?? 'avatar-placeholder.svg'"
        :alt="op.name"
        width="48"
        height="48"
        loading="lazy"
        @error="onAvatarError"
      />
      <div class="op-meta">
        <h3 class="op-name">{{ op.name }}</h3>
        <div class="op-sub">
          <span class="stars" :class="`r${op.rarity}`" :aria-label="`${op.rarity} 星`">{{ '★'.repeat(op.rarity) }}</span>
          <span>{{ PROFESSION_LABELS[op.profession] }} · {{ branchName }}</span>
        </div>
      </div>
    </header>
    <div v-if="op.entries.length > 1" class="tabs" role="tablist" :aria-label="`${op.name}的命中敘述`">
      <button
        v-for="(e, i) in op.entries"
        :id="`${id}-tab-${i}`"
        :key="i"
        type="button"
        role="tab"
        class="tab"
        :class="{ on: i === tab }"
        :aria-selected="i === tab"
        :aria-controls="`${id}-panel`"
        @click="tab = i"
      >
        {{ e.source }}
      </button>
    </div>
    <section
      :id="`${id}-panel`"
      class="entry"
      :role="op.entries.length > 1 ? 'tabpanel' : undefined"
      :aria-labelledby="op.entries.length > 1 ? `${id}-tab-${tab}` : undefined"
      data-testid="entry"
    >
      <div v-if="entry.stages.length > 1" class="stage-switch" role="group" aria-label="階段">
        <button
          v-for="(s, j) in entry.stages"
          :key="j"
          type="button"
          class="stage-btn"
          :class="{ on: j === stageIndex }"
          :aria-pressed="j === stageIndex"
          :disabled="!s.hit"
          @click="stageOf[tab] = j"
        >
          {{ s.label }}
        </button>
      </div>
      <div class="entry-head">
        <span v-if="op.entries.length === 1" class="source">{{ entry.source }}</span>
        <span v-if="entry.name" class="entry-name">{{ entry.name }}</span>
        <span v-if="entry.summon" class="badge summon">{{ entry.summon }}</span>
        <span v-if="stage.module" class="badge module">{{ stage.module }}</span>
        <span v-if="stage.cnData" class="badge" title="台服沒有模組數值資料,文字與數值取自國服">國服資料</span>
        <span v-for="(fx, k) in stage.effects" :key="k" class="fx" :class="`fx-${fx}`">
          {{ selected.length > 1 ? `${keywords.get(k)?.name ?? k}:` : '' }}{{ EFFECT_TYPE_LABELS[fx] }}
        </span>
      </div>
      <div class="stage">
        <RichText class="stage-text" :runs="stage.runs" :selected="selected" />
      </div>
    </section>
  </article>
</template>
