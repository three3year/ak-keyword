<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { PROFESSION_LABELS, TW_UNRELEASED_TITLE, type IndexKeyword, type ResultEntry, type ResultOperator } from '../core/types'
import EntryView from './EntryView.vue'

const props = defineProps<{
  op: ResultOperator
  selected: string[]
  keywords: Map<string, IndexKeyword>
  branchName: string
}>()

/** 點頭像打開幹員詳情;帶著頭像按鈕,關閉後焦點回到它。 */
const emit = defineEmits<{ open: [trigger: HTMLElement] }>()

// 卡片狀態(目前分頁、各分頁目前階段)只存在這張卡內;查詢結果重算(op 換成新物件)時回到預設
const tab = ref(0)
const stageOf = ref<Record<number, number>>({})
watch(
  () => props.op,
  () => {
    tab.value = 0
    stageOf.value = {}
  },
)

/** 預設顯示第一個命中的階段。 */
function defaultStage(e: ResultEntry): number {
  return Math.max(0, e.stages.findIndex((s) => s.hit))
}

const entry = computed(() => props.op.entries[tab.value] ?? props.op.entries[0])
const stage = computed({
  get: () => stageOf.value[tab.value] ?? defaultStage(entry.value),
  set: (j: number) => (stageOf.value[tab.value] = j),
})
const id = useId()

/** 小卡:只有職業條件、沒有命中敘述的結果卡,只顯示卡頭。 */
const compact = computed(() => props.op.entries.length === 0)

function onAvatarError(e: Event) {
  const img = e.target as HTMLImageElement
  if (!img.src.endsWith('avatar-placeholder.svg')) img.src = 'avatar-placeholder.svg'
}
</script>

<template>
  <!-- 台服未實裝:小卡整張壓灰、整張卡帶懸停文字;大卡只壓灰卡頭、懸停文字由徽章提供 -->
  <article
    class="card"
    :class="[op.rarity >= 3 ? `glow-${op.rarity}` : 'glow-low', { compact, 'tw-unreleased': op.twUnreleased }]"
    :title="compact && op.twUnreleased ? TW_UNRELEASED_TITLE : undefined"
    data-testid="result-card"
  >
    <header class="card-head">
      <button
        type="button"
        class="avatar-btn"
        :aria-label="`檢視${op.name}的詳情`"
        @click="emit('open', $event.currentTarget as HTMLElement)"
      >
        <img
          class="avatar"
          :src="op.avatar ?? 'avatar-placeholder.svg'"
          alt=""
          width="48"
          height="48"
          loading="lazy"
          @error="onAvatarError"
        />
        <span class="info-badge" aria-hidden="true">i</span>
      </button>
      <div class="op-meta">
        <div class="op-title">
          <h3 class="op-name">
            <a :href="op.prtsUrl" target="_blank" rel="noopener noreferrer" :title="`在 PRTS 查看${op.name}(新分頁)`">{{ op.name }}</a>
          </h3>
          <span class="stars" :class="`r${op.rarity}`" :aria-label="`${op.rarity} 星`">{{ '★'.repeat(op.rarity) }}</span>
        </div>
        <div class="op-sub">
          {{ PROFESSION_LABELS[op.profession] }} · {{ branchName }}
          <span v-if="op.twUnreleased && !compact" class="badge tw-unreleased" :title="TW_UNRELEASED_TITLE">台服未實裝</span>
        </div>
      </div>
    </header>
    <template v-if="!compact">
      <div class="tabs" role="tablist" :aria-label="`${op.name}的命中敘述`">
        <button
          v-for="(e, i) in op.entries"
          :id="`${id}-tab-${i}`"
          :key="i"
          type="button"
          role="tab"
          class="tab"
          :class="[`src-${e.kind}`, { on: i === tab }]"
          :aria-selected="i === tab"
          :aria-controls="`${id}-panel`"
          @click="tab = i"
        >
          {{ e.source }}
        </button>
      </div>
      <section
        :id="`${id}-panel`"
        class="entry"
        role="tabpanel"
        :aria-labelledby="`${id}-tab-${tab}`"
        data-testid="entry"
      >
        <EntryView v-model:stage="stage" :entry="entry" :selected="selected" :keywords="keywords" />
      </section>
    </template>
  </article>
</template>
