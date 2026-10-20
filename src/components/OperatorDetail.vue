<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, useId } from 'vue'
import { loadOperator } from '../core/loadIndex'
import { operatorDetail } from '../core/query'
import {
  type EntryKind,
  type IndexKeyword,
  type OperatorFile,
  PROFESSION_LABELS,
  type ResultOperator,
  type SearchCondition,
  type Server,
} from '../core/types'
import EntryView from './EntryView.vue'

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

const detail = computed(() => (file.value ? operatorDetail(file.value, { server: props.server, conditions: props.conditions }) : undefined))
// 目前分頁與各段的目前階段只存在這次打開的詳情裡
const chosenTab = ref<EntryKind>()
const tab = computed(() => chosenTab.value ?? detail.value?.defaultTab)
const current = computed(() => detail.value?.tabs.find((t) => t.kind === tab.value) ?? detail.value?.tabs[0])
const stageOf = ref<Record<string, number>>({})

/** 目前分頁第 i 段敘述在 stageOf 的鍵。 */
const stageKey = (i: number) => `${current.value!.kind}-${i}`

function stageAt(i: number): number {
  return stageOf.value[stageKey(i)] ?? current.value!.entries[i].defaultStage
}

function setStage(i: number, j: number) {
  stageOf.value[stageKey(i)] = j
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
          <div class="op-sub">{{ PROFESSION_LABELS[op.profession] }} · {{ branchName }}</div>
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
              v-for="t in detail.tabs"
              :id="`${id}-tab-${t.kind}`"
              :key="t.kind"
              type="button"
              role="tab"
              class="tab"
              :class="[`src-${t.kind}`, { on: t.kind === current.kind }]"
              :aria-selected="t.kind === current.kind"
              :aria-controls="`${id}-panel`"
              @click="chosenTab = t.kind"
            >
              {{ t.label }}
            </button>
          </div>
          <section :id="`${id}-panel`" class="entry detail-panel" role="tabpanel" :aria-labelledby="`${id}-tab-${current.kind}`">
            <article v-for="(e, i) in current.entries" :key="`${current.kind}-${i}`" class="detail-entry" data-testid="detail-entry">
              <EntryView
                :stage="stageAt(i)"
                :entry="e"
                :selected="selected"
                :keywords="keywords"
                :branch-name="branchName"
                detail
                @update:stage="setStage(i, $event)"
              />
            </article>
          </section>
        </template>
      </div>
    </div>
  </div>
</template>
