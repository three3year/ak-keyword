<script setup lang="ts">
/** 階段切換:一顆膠囊裡並排各階段,選中的那格高亮。結果卡每段敘述一個,幹員詳情每個分頁一個。 */
defineProps<{ options: { label: string; disabled: boolean; title?: string }[] }>()

const index = defineModel<number>({ required: true })
</script>

<template>
  <div class="stage-switch" role="group" aria-label="階段">
    <button
      v-for="(o, j) in options"
      :key="j"
      type="button"
      class="stage-btn"
      :class="{ on: j === index }"
      :aria-pressed="j === index"
      :disabled="o.disabled"
      :title="o.disabled ? o.title : undefined"
      @click="index = j"
    >
      {{ o.label }}
    </button>
  </div>
</template>
