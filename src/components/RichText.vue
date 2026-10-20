<script setup lang="ts">
import type { Run } from '../core/types'

/** 高亮:selected 裡的關鍵字(結果卡),或查詢輸出已標好的關鍵字(幹員詳情)。 */
defineProps<{
  runs: Run[]
  selected: string[]
}>()
</script>

<template>
  <span class="rich"
    ><template v-for="(r, i) in runs" :key="i"
      ><mark v-if="r.k && (r.h || selected.includes(r.k))" class="hl" :data-k="r.k">{{ r.t }}</mark
      ><span v-else-if="r.k" class="term" :data-k="r.k">{{ r.t }}</span
      ><span v-else-if="r.p" class="s-pot bonus" :data-p="r.p" tabindex="0">{{ r.t }}</span
      ><span v-else :class="r.s ? `s-${r.s}` : undefined">{{ r.t }}</span></template
    ></span
  >
</template>
