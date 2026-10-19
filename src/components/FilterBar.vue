<script setup lang="ts">
import { computed } from 'vue'
import type { FilterOptions } from '../core/query'
import type { Profession, Server } from '../core/types'

const props = defineProps<{ options: FilterOptions }>()

const server = defineModel<Server>('server', { required: true })
const rarities = defineModel<number[]>('rarities', { required: true })
const professions = defineModel<Profession[]>('professions', { required: true })
const branch = defineModel<string>('branch', { required: true })

const SERVERS: { value: Server; label: string }[] = [
  { value: 'cn', label: '國服' },
  { value: 'tw', label: '台服' },
]

// 分支選單只列已選職業的分支(沒選職業時列全部)
const branches = computed(() =>
  props.options.professions
    .filter((p) => professions.value.length === 0 || professions.value.includes(p.id))
    .flatMap((p) => p.branches.map((b) => ({ ...b, profession: p.name }))),
)

function toggleProfession(p: Profession) {
  professions.value = professions.value.includes(p) ? professions.value.filter((x) => x !== p) : [...professions.value, p]
  if (branch.value && !branches.value.some((b) => b.id === branch.value)) branch.value = ''
}
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
      <select v-model="branch" class="branch" aria-label="分支">
        <option value="">全部分支</option>
        <option v-for="b in branches" :key="b.id" :value="b.id">{{ b.name }}({{ b.profession }})</option>
      </select>
    </fieldset>
  </div>
</template>
