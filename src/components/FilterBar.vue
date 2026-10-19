<script setup lang="ts">
import { EFFECT_TYPE_LABELS, EFFECT_TYPES, type EffectType } from '../core/types'

const effectTypes = defineModel<EffectType[]>('effectTypes', { required: true })
</script>

<template>
  <div class="filters">
    <fieldset class="filter">
      <legend>效果類型</legend>
      <label v-for="t in EFFECT_TYPES" :key="t" class="check" :class="`fx-${t}`">
        <input v-model="effectTypes" type="checkbox" :value="t" />
        {{ EFFECT_TYPE_LABELS[t] }}
      </label>
    </fieldset>
  </div>
</template>
