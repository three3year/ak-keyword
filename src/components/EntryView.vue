<script setup lang="ts">
import { computed } from 'vue'
import { skillFacts } from '../core/query'
import { EFFECT_TYPE_LABELS, type IndexKeyword, type ResultEntry } from '../core/types'
import RichText from './RichText.vue'
import SkillIcon from './SkillIcon.vue'

/** 一段敘述:階段切換、名稱與標籤、文字;技能另有圖示(幹員詳情再在圖示下方加一行技力文字)。結果卡與幹員詳情共用。 */
const props = defineProps<{
  entry: ResultEntry
  selected: string[]
  keywords: Map<string, IndexKeyword>
  /** 幹員詳情:所有存在的階段都能切換,標出敘述來源,高亮只看查詢輸出標好的關鍵字。 */
  detail?: boolean
}>()

const stageIndex = defineModel<number>('stage', { required: true })
const stage = computed(() => props.entry.stages[stageIndex.value] ?? props.entry.stages[0])
// 模組3 階段在敘述名後接模組名,例如「及鋒而試-筆跡」;特性的名稱是分支名稱,例如「術戰者-筆跡」
const entryName = computed(() => [props.entry.name, stage.value.module].filter(Boolean).join('-'))
const facts = computed(() => (props.detail && stage.value.stats ? skillFacts(stage.value.stats) : []))
</script>

<template>
  <!-- 技能:圖示在左,右邊由上而下是階段切換、名稱與標籤;天賦與特性沒有圖示 -->
  <div :class="{ 'skill-head': entry.kind === 'skill' }">
    <SkillIcon v-if="entry.kind === 'skill'" :icon="entry.icon" :stats="stage.stats" :large="detail" />
    <div class="head-main">
      <div v-if="entry.stages.length > 1" class="stage-switch" role="group" aria-label="階段">
        <button
          v-for="(s, j) in entry.stages"
          :key="j"
          type="button"
          class="stage-btn"
          :class="{ on: j === stageIndex }"
          :aria-pressed="j === stageIndex"
          :disabled="detail ? s.absent : !s.hit"
          @click="stageIndex = j"
        >
          {{ s.label }}
        </button>
      </div>
      <div class="entry-head">
        <span v-if="detail" class="entry-source">{{ entry.source }}</span>
        <span v-if="entryName" class="entry-name">{{ entryName }}</span>
        <span v-if="entry.summon" class="badge summon" :title="`召喚物名稱:這段敘述屬於召喚物「${entry.summon}」`">{{ entry.summon }}</span>
        <span v-if="stage.twUnreleased" class="badge" title="台服尚未實裝這個模組,文字與數值取自陸服">台服未實裝</span>
        <template v-for="(types, k) in stage.effects" :key="k">
          <span v-for="fx in types" :key="fx" class="fx" :class="`fx-${fx}`">
            {{ selected.length > 1 ? `${keywords.get(k)?.name ?? k}:` : '' }}{{ EFFECT_TYPE_LABELS[fx] }}
          </span>
        </template>
      </div>
    </div>
  </div>
  <!-- 幹員詳情的技力文字:圖示與右側那一區之下另起一整行,放不下時只在欄位之間換行 -->
  <div v-if="facts.length" class="skill-facts" data-testid="skill-facts">
    <template v-for="(f, i) in facts" :key="i">{{ i > 0 ? '・' : '' }}<span class="fact">{{ f }}</span></template>
  </div>
  <RichText class="stage-text" :runs="stage.runs" :selected="detail ? [] : selected" />
</template>
