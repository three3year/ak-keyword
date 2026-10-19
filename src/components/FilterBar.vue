<script setup lang="ts">
import type { FilterOptions } from '../core/query'
import type { Profession } from '../core/types'

defineProps<{ options: FilterOptions }>()

const rarities = defineModel<number[]>('rarities', { required: true })
const professions = defineModel<Profession[]>('professions', { required: true })

function toggleProfession(p: Profession) {
  professions.value = professions.value.includes(p) ? professions.value.filter((x) => x !== p) : [...professions.value, p]
}
</script>

<template>
  <div class="filters">
    <fieldset class="filter">
      <legend>星級</legend>
      <label v-for="r in options.rarities" :key="r" class="check">
        <input v-model="rarities" type="checkbox" :value="r" />
        {{ r }}★
      </label>
    </fieldset>
    <fieldset class="filter">
      <legend>職業</legend>
      <button
        v-for="p in options.professions"
        :key="p.id"
        class="pill"
        :class="{ on: professions.includes(p.id) }"
        :aria-pressed="professions.includes(p.id)"
        @click="toggleProfession(p.id)"
      >
        {{ p.name }}
      </button>
    </fieldset>
  </div>
</template>
