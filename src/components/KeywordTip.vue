<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import type { IndexKeyword } from '../core/types'
import { hideTip, tip } from '../ui/tip'
import RichText from './RichText.vue'

const props = defineProps<{
  keywords: Map<string, IndexKeyword>
  selected: string[]
}>()
const emit = defineEmits<{ toggle: [id: string] }>()

const left = ref(0)
const kw = computed(() => (tip.keyword ? props.keywords.get(tip.keyword) : undefined))

// 提示框不超出視窗左右
watchEffect(() => {
  const width = Math.min(320, window.innerWidth - 16)
  left.value = Math.max(8, Math.min(tip.x - width / 2, window.innerWidth - width - 8))
})
</script>

<template>
  <div
    v-if="tip.open && (kw || tip.text)"
    class="tip"
    role="tooltip"
    data-testid="tip"
    :style="{ left: `${left}px`, top: `${tip.y}px`, transform: tip.below ? 'none' : 'translateY(-100%)' }"
    @click.stop
  >
    <template v-if="kw">
      <div class="tip-title">
        <strong>{{ kw.name }}</strong>
        <span v-if="kw.kind === 'supplement'" class="badge unofficial">非官方</span>
      </div>
      <div class="tip-body"><RichText :runs="kw.definition" :selected="[]" /></div>
      <button v-if="tip.toggle" class="tip-action" @click="emit('toggle', kw.id), hideTip()">
        {{ selected.includes(kw.id) ? '移出選擇' : '加入選擇' }}
      </button>
    </template>
    <div v-else class="tip-body">{{ tip.text }}</div>
  </div>
</template>
