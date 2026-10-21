<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, useId } from 'vue'
import { loadOperator } from '../core/loadIndex'
import { operatorDetail } from '../core/query'
import {
  type IndexKeyword,
  type OperatorFile,
  PROFESSION_LABELS,
  TW_UNRELEASED_TITLE,
  type ResultOperator,
  type SearchCondition,
  type Server,
} from '../core/types'
import EntryView from './EntryView.vue'
import StageSwitch from './StageSwitch.vue'

const props = defineProps<{
  /** 標題區直接用結果卡的資料,打開瞬間就顯示。 */
  op: ResultOperator
  /** 幹員檔的相對路徑。 */
  path?: string
  branchName: string
  server: Server
  conditions: SearchCondition[]
  selected: string[]
  keywords: Map<string, IndexKeyword>
}>()

const emit = defineEmits<{ close: [] }>()

const file = shallowRef<OperatorFile>()
const failed = ref('')

async function load() {
  failed.value = ''
  try {
    if (!props.path) throw new Error('索引沒有這位幹員的詳細資料')
    file.value = await loadOperator(props.path)
  } catch (e) {
    failed.value = String(e)
  }
}

const detail = computed(() => (file.value ? operatorDetail(file.value, { server: props.server, conditions: props.conditions, branchName: props.branchName }) : undefined))
// 目前分頁與各段的目前階段只存在這次打開的詳情裡
const chosenTab = ref<number>()
const tab = computed(() => chosenTab.value ?? detail.value?.defaultTab ?? 0)
const current = computed(() => detail.value?.tabs[tab.value] ?? detail.value?.tabs[0])
/** 各分頁選的階段標籤;沒選過時是第一段敘述的預設階段。 */
const stageOf = ref<Record<number, string>>({})

/**
 * 目前分頁的階段切換:有兩個以上階段的敘述,其階段標籤的聯集(依出現順序),任一段有存在的這個階段就能選。
 * 只有一個階段的敘述(例如只有一個等級的召喚物技能、召喚物天賦)沒得切換,不列入。
 */
const tabStages = computed(() => {
  const options: { label: string; disabled: boolean; title: string }[] = []
  for (const e of current.value?.entries ?? [])
    for (const s of e.stages.length > 1 ? e.stages : []) {
      const o = options.find((o) => o.label === s.label)
      if (o) o.disabled &&= !!s.absent
      else options.push({ label: s.label, disabled: !!s.absent, title: '沒有這個階段:模組新增的天賦要裝模組才有' })
    }
  return options
})

const tabStage = computed(() => {
  if (stageOf.value[tab.value] !== undefined) return stageOf.value[tab.value]
  const first = current.value?.entries.find((e) => e.stages.length > 1)
  return first?.stages[first.defaultStage]?.label ?? ''
})

const tabStageIndex = computed({
  get: () => tabStages.value.findIndex((o) => o.label === tabStage.value),
  set: (j: number) => (stageOf.value[tab.value] = tabStages.value[j].label),
})

/** 第 i 段敘述顯示分頁選的階段;它沒有這個階段(或不存在)時顯示它的預設階段。 */
function stageAt(i: number): number {
  const e = current.value!.entries[i]
  const j = e.stages.findIndex((s) => s.label === tabStage.value && !s.absent)
  return j >= 0 ? j : e.defaultStage
}

const id = useId()
const dialog = ref<HTMLElement>()

onMounted(() => {
  dialog.value?.focus()
  load()
})

/** 焦點留在對話框內:Tab 到最後一個可聚焦元素後回到第一個,反之亦然。 */
function trapTab(e: KeyboardEvent) {
  if (e.key !== 'Tab' || !dialog.value) return
  const focusable = [...dialog.value.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), [tabindex="0"]')]
  if (focusable.length === 0) return
  const [first, last] = [focusable[0], focusable[focusable.length - 1]]
  const active = document.activeElement
  if (e.shiftKey && (active === first || active === dialog.value)) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus()
  }
}

function onAvatarError(e: Event) {
  const img = e.target as HTMLImageElement
  if (!img.src.endsWith('avatar-placeholder.svg')) img.src = 'avatar-placeholder.svg'
}
</script>

<template>
  <div class="detail-backdrop" @click.self="emit('close')">
    <div
      ref="dialog"
      class="detail"
      :class="op.rarity >= 3 ? `glow-${op.rarity}` : 'glow-low'"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="`${id}-title`"
      tabindex="-1"
      data-testid="operator-detail"
      @keydown="trapTab"
    >
      <header class="card-head detail-head">
        <img class="avatar" :src="op.avatar ?? 'avatar-placeholder.svg'" alt="" width="56" height="56" @error="onAvatarError" />
        <div class="op-meta">
          <div class="op-title">
            <h2 :id="`${id}-title`" class="op-name">
              <a :href="op.prtsUrl" target="_blank" rel="noopener noreferrer" :title="`在 PRTS 查看${op.name}(新分頁)`">{{ op.name }}</a>
            </h2>
            <span class="stars" :class="`r${op.rarity}`" :aria-label="`${op.rarity} 星`">{{ '★'.repeat(op.rarity) }}</span>
          </div>
          <div class="op-sub">
            {{ PROFESSION_LABELS[op.profession] }} · {{ branchName }}
            <span v-if="op.twUnreleased" class="badge tw-unreleased" :title="TW_UNRELEASED_TITLE">台服未實裝</span>
          </div>
        </div>
        <button type="button" class="detail-close" aria-label="關閉" @click="emit('close')">×</button>
      </header>
      <div class="detail-body">
        <div v-if="failed" class="detail-status error" role="alert">
          <p>{{ failed }}</p>
          <button type="button" class="btn" @click="load">重試</button>
        </div>
        <p v-else-if="!detail || !current" class="detail-status">載入中…</p>
        <template v-else>
          <div class="tabs" role="tablist" :aria-label="`${op.name}的敘述`">
            <button
              v-for="(t, i) in detail.tabs"
              :id="`${id}-tab-${i}`"
              :key="t.label"
              type="button"
              role="tab"
              class="tab"
              :class="[`src-${t.kind}`, { on: t === current }]"
              :aria-selected="t === current"
              :aria-controls="`${id}-panel`"
              @click="chosenTab = i"
            >
              {{ t.label }}
            </button>
          </div>
          <section :id="`${id}-panel`" class="entry detail-panel" role="tabpanel" :aria-labelledby="`${id}-tab-${tab}`">
            <StageSwitch v-if="tabStages.length > 1" v-model="tabStageIndex" class="detail-stages" :options="tabStages" />
            <article v-for="(e, i) in current.entries" :key="`${tab}-${i}`" class="detail-entry" data-testid="detail-entry">
              <EntryView
                :stage="stageAt(i)"
                :entry="e"
                :selected="selected"
                :keywords="keywords"
                detail
              />
            </article>
          </section>
        </template>
      </div>
    </div>
  </div>
</template>
