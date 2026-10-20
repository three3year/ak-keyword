<script setup lang="ts">
import { computed } from 'vue'
import { spLabel } from '../core/query'
import { SP_TYPE_LABELS, type SkillStats } from '../core/types'

const props = defineProps<{
  icon?: string
  stats?: SkillStats
  /** 幹員詳情用較大的圖示。 */
  large?: boolean
}>()

const PLACEHOLDER = 'skill-icon-placeholder.svg'
const sp = computed(() => props.stats?.sp)

function onError(e: Event) {
  const img = e.target as HTMLImageElement
  if (!img.src.endsWith(PLACEHOLDER)) img.src = PLACEHOLDER
}
</script>

<template>
  <!-- 技能圖示,下緣靠右疊上技力:播放鍵、初始技力、回復類型圖示、所需技力;沒有回復類型的技能不疊字 -->
  <div class="skill-icon" :class="{ large }" data-testid="skill-icon">
    <img :src="icon ?? PLACEHOLDER" alt="" loading="lazy" @error="onError" />
    <span v-if="sp" class="sp-overlay" role="img" :aria-label="spLabel(sp)">
      <svg class="sp-play" viewBox="0 0 8 8" aria-hidden="true"><path d="M1 0.5v7l6-3.5z" fill="currentColor" /></svg>
      <span aria-hidden="true">{{ sp.init }}</span>
      <span class="sp-type" :class="`sp-${sp.type}`" :title="SP_TYPE_LABELS[sp.type]" aria-hidden="true">
        <!-- 自動回復:時鐘;攻擊回復:劍;受擊回復:盾 -->
        <svg v-if="sp.type === 'time'" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="M5 2.6V5h2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" /></svg>
        <svg v-else-if="sp.type === 'attack'" viewBox="0 0 10 10"><path d="M8.8 1.2L4 6l.9.9 4.8-4.8V1.2zM2 6.4l1.6 1.6-1.2 1.2-.6-.6-.8.8-.6-.6.8-.8-.6-.6z" fill="currentColor" /><path d="M2.4 5.2l2.4 2.4" stroke="currentColor" stroke-width="1.2" /></svg>
        <svg v-else viewBox="0 0 10 10"><path d="M5 .6l4 1.5v2.6C9 7.2 7.3 8.8 5 9.5 2.7 8.8 1 7.2 1 4.7V2.1z" fill="currentColor" /></svg>
      </span>
      <span aria-hidden="true">{{ sp.cost }}</span>
    </span>
  </div>
</template>
