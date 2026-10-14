<script setup lang="ts">
/**
 * 消息列表容器：负责滚动行为
 *
 * 这里解决一个聊天界面必然遇到的问题：
 * 新消息来了要自动滚到底，但**如果用户正在往回翻历史，就不要强行打断他**。
 * 做法：滚动前先判断"当前是否贴近底部"，只有贴近时才自动滚。
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'

import type { ChatMessage } from '@/types/chat'
import MessageItem from '@/components/MessageItem.vue'

const props = defineProps<{
  messages: ChatMessage[]
  /** 是否正在等待/生成回复（用于显示"正在输入"） */
  pending?: boolean
}>()

/** 重试事件只是"往上转发"：真正的重试逻辑在 useChat 里 */
const emit = defineEmits<{
  retry: [id: string]
}>()

const viewportRef = ref<HTMLElement | null>(null)

/** 距离底部 120px 以内，就认为用户"还在底部" */
const NEAR_BOTTOM_THRESHOLD = 120

function isNearBottom(): boolean {
  const el = viewportRef.value
  if (!el) return true
  return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD
}

function scrollToBottom(smooth = false): void {
  const el = viewportRef.value
  if (!el) return
  el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
}

// 监听"消息条数"而不是整个数组：条数没变（比如流式更新同一条消息的内容）时不需要滚动
watch(
  () => props.messages.length,
  async (_newLength, oldLength) => {
    const stick = isNearBottom()
    await nextTick() // 等 DOM 更新完成再滚，否则拿到的 scrollHeight 是旧的
    if (stick || oldLength === 0) scrollToBottom(true)
  },
)

watch(
  () => props.pending,
  async (pending) => {
    if (pending && isNearBottom()) {
      await nextTick()
      scrollToBottom(true)
    }
  },
)

/** 是否已经有"正在流式输出"的消息（有的话就不再显示三点等待动画，避免重复） */
const hasStreamingMessage = computed(() => props.messages.some((m) => m.status === 'streaming'))

// 流式输出：消息条数不变、但最后一条的内容在变长 → 内容长度变化也要跟着滚。
// ⚠️ 必须同时监听 reasoning：思考阶段 content 还是空的，只有思考链在增长；
//    如果只看 content，思考期间外层列表不会跟随（用户会以为卡住了）。
watch(
  () => {
    const last = props.messages[props.messages.length - 1]
    return (last?.content.length ?? 0) + (last?.reasoning?.length ?? 0)
  },
  async () => {
    if (!isNearBottom()) return // 用户正在翻历史，不打断他
    await nextTick()
    scrollToBottom(false) // 流式期间用瞬时滚动，观感更"跟手"
  },
)

onMounted(() => scrollToBottom())
</script>

<template>
  <div ref="viewportRef" class="viewport" role="log" aria-live="polite" aria-label="对话内容">
    <div class="viewport__inner">
      <MessageItem
        v-for="message in messages"
        :key="message.id"
        :message="message"
        @retry="emit('retry', $event)"
      />

      <!-- 等待首字时的三点动画：一旦正文开始流式出现就隐藏，避免和内容重复 -->
      <div v-if="pending && !hasStreamingMessage" class="typing" aria-label="AI 正在回复">
        <span class="typing__dot" />
        <span class="typing__dot" />
        <span class="typing__dot" />
      </div>

      <!-- 底部留白：让最后一条消息不顶着输入框 -->
      <div class="viewport__spacer" />
    </div>
  </div>
</template>

<style scoped>
.viewport {
  height: 100%;
  overflow-y: auto;
  overscroll-behavior: contain; /* 滚到底后不要把滚动"传染"给页面 */
  -webkit-overflow-scrolling: touch; /* iOS 惯性滚动 */
}

.viewport__inner {
  max-width: var(--content-max);
  margin: 0 auto;
  padding: var(--space-5) var(--space-4) 0;
}

.viewport__spacer {
  height: var(--space-6);
}

.typing {
  display: flex;
  gap: 5px;
  padding: 0 0 var(--space-4) 42px; /* 42px = 头像 30 + 间距 12，与正文左对齐 */
}

.typing__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background-color: var(--text-tertiary);
  animation: blink 1.2s infinite ease-in-out;
}
.typing__dot:nth-child(2) {
  animation-delay: 0.15s;
}
.typing__dot:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes blink {
  0%,
  60%,
  100% {
    opacity: 0.25;
    transform: translateY(0);
  }
  30% {
    opacity: 1;
    transform: translateY(-3px);
  }
}

@media (max-width: 640px) {
  .viewport__inner {
    padding: var(--space-4) var(--space-3) 0;
  }
  .typing {
    padding-left: 38px;
  }
}
</style>
