<script setup lang="ts">
import { EFFECT_TYPE_LABELS, EFFECT_TYPES, type EffectType, type Server } from '../core/types'

const server = defineModel<Server>('server', { required: true })
const effectTypes = defineModel<EffectType[]>('effectTypes', { required: true })

const SERVERS: { value: Server; label: string }[] = [
  { value: 'cn', label: '國服' },
  { value: 'tw', label: '台服' },
]
</script>

<template>
  <div class="filters">
    <div class="segmented" role="radiogroup" aria-label="伺服器">
      <button
        v-for="s in SERVERS"
        :key="s.value"
        role="radio"
        :aria-checked="server === s.value"
        :class="{ on: server === s.value }"
        @click="server = s.value"
      >
        {{ s.label }}
      </button>
    </div>
    <fieldset class="filter">
      <legend>效果類型</legend>
      <label v-for="t in EFFECT_TYPES" :key="t" class="check" :class="`fx-${t}`">
        <input v-model="effectTypes" type="checkbox" :value="t" />
        {{ EFFECT_TYPE_LABELS[t] }}
      </label>
    </fieldset>
  </div>
</template>
