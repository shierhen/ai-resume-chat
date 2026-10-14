<script setup lang="ts">
/**
 * 单条消息气泡
 *
 * 一条消息的所有差异（谁发的、什么状态）都由 props 决定，
 * 组件内部不关心"消息从哪来" —— 这叫"展示型组件（Presentational Component）"，
 * 好处是阶段 3 做流式输出时，这里几乎不用改。
 */
import { computed, nextTick, ref, watch } from 'vue'
import { Check, CopyDocument, Refresh } from '@element-plus/icons-vue'

import MarkdownContent from '@/components/MarkdownContent.vue'
import type { ChatMessage } from '@/types/chat'
import { formatTime } from '@/utils/format'

const props = defineProps<{
  message: ChatMessage
}>()

const emit = defineEmits<{
  /** 请求重试这条（失败）消息 */
  retry: [id: string]
}>()

const isUser = computed(() => props.message.role === 'user')
const isStreaming = computed(() => props.message.status === 'streaming')
const copied = ref(false)

/** 思考链的滚动容器（流式期间要让它自动跟到底部） */
const thinkingRef = ref<HTMLElement | null>(null)

/**
 * "正在思考"：整条消息还在流式接收、且正式答案尚未开始输出。
 * 一旦有 content 进来，就认为思考阶段结束，标签切成"已深度思考"。
 */
const isThinking = computed(() => isStreaming.value && props.message.content === '')

/**
 * 思考链自动滚到底。
 *
 * 为什么要判断"是否贴底"：思考链可能有几千字，用户可能正往上翻看前面想了什么。
 * 如果每次内容增长都强制拽到底部，用户就没法阅读了 —— 只在用户本来就贴着底部时才跟随。
 */
function isNearBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < 24
}

watch(
  () => props.message.reasoning?.length ?? 0,
  async () => {
    const el = thinkingRef.value
    if (!el) return
    // 内容变化前先判断：此时 scrollTop 还是用户的实际位置
    const stick = isNearBottom(el)
    await nextTick()
    if (stick) el.scrollTop = el.scrollHeight
  },
)

async function copyContent(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.message.content)
    copied.value = true
    window.setTimeout(() => (copied.value = false), 1500)
  } catch {
    /* 非 HTTPS 或浏览器不支持剪贴板 API 时静默失败（阶段 5 部署后是 HTTPS，无此问题） */
  }
}
</script>

<template>
  <article class="msg" :class="isUser ? 'msg--user' : 'msg--assistant'">
    <!-- 助手头像；用户消息不显示头像，靠右对齐 + 气泡底色区分 -->
    <div v-if="!isUser" class="msg__avatar" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="16" height="16">
        <path
          fill="currentColor"
          d="M12 2a10 10 0 0 0-8.66 15L2 22l5.2-1.3A10 10 0 1 0 12 2Zm0 18a8 8 0 0 1-4.1-1.13l-.29-.17-3.05.76.78-2.96-.18-.3A8 8 0 1 1 12 20Z"
        />
      </svg>
    </div>

    <div class="msg__body">
      <div class="msg__meta">
        <span class="msg__role">{{ isUser ? '我' : 'AI 助手' }}</span>
        <time class="msg__time">{{ formatTime(message.createdAt) }}</time>
      </div>

      <!--
        white-space: pre-wrap 让 \n 真正换行，同时保留连续空格。
        阶段 4 这里会换成 Markdown 渲染组件。
      -->
      <div class="msg__content" :class="{ 'msg__content--bubble': isUser }">
        <!--
          推理模型的思考链：像 DeepSeek 官网那样**默认完整可见**（不再折叠隐藏）。
          结构说明：
          - 外层 .msg__thinking 固定最大高度，超出后【内部滚动】，避免几千字思考链
            把正式答案挤出屏幕；
          - .msg__thinking-text 是真正的滚动容器，流式期间自动滚到底（见 script 里的逻辑）；
          - 用「思考中」/「已深度思考」标签区分进行中与已结束，给用户明确状态反馈。
        -->
        <div v-if="message.reasoning || isThinking" class="msg__thinking">
          <div class="msg__thinking-head">
            <span class="msg__thinking-label">{{ isThinking ? '思考中…' : '已深度思考' }}</span>
            <span v-if="isThinking" class="msg__thinking-dots" aria-hidden="true">
              <i /><i /><i />
            </span>
          </div>
          <div ref="thinkingRef" class="msg__thinking-text">{{ message.reasoning }}</div>
        </div>

        <!--
          助手消息走 Markdown 渲染（流式期间也实时渲染：代码块会边到边排版，
          比"先显示一堆原始符号、结束时突然变形"体验好得多）。
          用户消息保持纯文本：原样回显最安全，用户也不需要 Markdown 语法。
          ⚠️ Markdown 的 XSS 清洗在 utils/markdown.ts 里由 DOMPurify 完成，
             组件这里只是 v-html 一个"已经洗干净"的字符串。
        -->
        <MarkdownContent v-if="!isUser" :content="message.content" />
        <p v-else class="msg__text">{{ message.content }}</p>

        <!-- 流式光标：独立于内容之外，避免和 Markdown 的块级结构互相干扰 -->
        <span v-if="isStreaming" class="msg__caret" aria-hidden="true" />

        <!-- 只有思考链、没有正式答案：明确告诉用户是模型行为，不是程序坏了 -->
        <p v-if="!message.content && message.reasoning && message.status !== 'streaming'" class="msg__note">
          该模型只输出了思考过程，没有给出正式答案。换用会产出 content 的模型（如 deepseek-v4-flash）或加大 max_tokens 即可。
        </p>

        <!-- 用户手动停止：内容不完整，给一个轻量提示（不是错误态） -->
        <p v-if="message.stopped" class="msg__stopped">已停止生成</p>

        <!-- 出错时的提示条 -->
        <p v-if="message.status === 'error'" class="msg__error">{{ message.error ?? '请求失败' }}</p>
      </div>

      <!-- 仅在鼠标悬浮/键盘聚焦时出现，避免静态内容太吵；
           出错时强制常显，否则用户根本发现不了"重试"入口 -->
      <div class="msg__tools" :class="{ 'msg__tools--pinned': message.status === 'error' }">
        <button
          v-if="message.status === 'error'"
          class="tool tool--retry"
          type="button"
          aria-label="重试这条消息"
          @click="emit('retry', message.id)"
        >
          <el-icon :size="14"><Refresh /></el-icon>
          <span>重试</span>
        </button>
        <button class="tool" type="button" :aria-label="copied ? '已复制' : '复制内容'" @click="copyContent">
          <el-icon :size="14"><Check v-if="copied" /><CopyDocument v-else /></el-icon>
          <span>{{ copied ? '已复制' : '复制' }}</span>
        </button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.msg {
  display: flex;
  gap: var(--space-3);
  margin-bottom: var(--space-5);
  /* 新消息淡入上移：短、轻，不抢注意力 */
  animation: msg-in var(--dur-base) var(--ease-out) both;
}

@keyframes msg-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
}

.msg--user {
  flex-direction: row-reverse; /* 用户消息靠右，一行 CSS 完成镜像布局 */
}

.msg__avatar {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border-radius: var(--radius-sm);
  display: grid;
  place-items: center;
  color: var(--text-on-brand);
  background: linear-gradient(135deg, var(--brand), #8b5cf6);
  margin-top: 22px; /* 与消息正文首行对齐（跳过上面的 meta 行） */
}

.msg__body {
  min-width: 0; /* 关键：不写这行，长英文/URL 会把 flex 子项撑爆，导致移动端横向滚动 */
  max-width: min(82%, 640px);
}

.msg--user .msg__body {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.msg__meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 12px;
  color: var(--text-tertiary);
  margin-bottom: 4px;
}

.msg__role {
  font-weight: 600;
  color: var(--text-secondary);
}

.msg__content--bubble {
  padding: 10px var(--space-4);
  border-radius: var(--radius-lg);
  /* 用户气泡右下角收小，形成"指向说话人"的视觉暗示 */
  border-bottom-right-radius: var(--radius-sm);
  background-color: var(--bubble-user-bg);
  color: var(--bubble-user-text);
}

.msg__text {
  white-space: pre-wrap;
  overflow-wrap: anywhere; /* 超长连续字符串（如 URL）也要能断行 */
  font-size: 15px;
  line-height: 1.7;
}

/* ---------------------------------------------------------------
   思考链：默认完整可见（像 DeepSeek 官网），超出高度后内部滚动
   --------------------------------------------------------------- */
.msg__thinking {
  margin-bottom: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  /* 用比正文更弱的底色 + 左侧竖线，明确"这是过程不是结论" */
  background-color: var(--bg-subtle);
  border-left: 2px solid var(--border-strong);
  color: var(--text-secondary);
}

.msg__thinking-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  font-size: 12px;
  color: var(--text-tertiary);
  user-select: none;
}

.msg__thinking-label {
  font-weight: 500;
}

/* "思考中"后面的三点跳动动画，表明流还在进行 */
.msg__thinking-dots {
  display: inline-flex;
  gap: 3px;
}
.msg__thinking-dots i {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background-color: currentColor;
  animation: thinking-blink 1.2s infinite ease-in-out;
}
.msg__thinking-dots i:nth-child(2) {
  animation-delay: 0.15s;
}
.msg__thinking-dots i:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes thinking-blink {
  0%,
  60%,
  100% {
    opacity: 0.25;
  }
  30% {
    opacity: 1;
  }
}

/*
  滚动容器本身。
  max-height 用「视口高度的百分比」而不是固定 px：手机上思考区不会占掉整屏，
  桌面上又能给到足够阅读高度。
  overscroll-behavior: contain 防止滚到底后把滚动"传染"给外层的消息列表。
*/
.msg__thinking-text {
  max-height: min(38vh, 320px);
  overflow-y: auto;
  /* overscroll-behavior: contain; */
  font-size: 13px;
  line-height: 1.65;
  white-space: pre-wrap; /* 思考链是纯文本，保留换行 */
  overflow-wrap: anywhere;
  /* 滚动条细化，避免在窄气泡里显得笨重 */
  scrollbar-width: thin;
}

/* 只有思考链没有答案时的说明 */
.msg__note {
  margin-top: var(--space-2);
  font-size: 12px;
  color: var(--text-tertiary);
}

/* 流式输出时的打字光标（纯 CSS 闪烁；独立元素，所以要和内容留一点间距） */
.msg__caret {
  display: inline-block;
  width: 2px;
  height: 1.05em;
  margin-left: 3px;
  vertical-align: text-bottom;
  background-color: var(--brand);
  animation: caret-blink 1s step-end infinite;
}

@keyframes caret-blink {
  50% {
    opacity: 0;
  }
}

/* 手动停止的提示（非错误态） */
.msg__stopped {
  margin-top: var(--space-2);
  font-size: 12px;
  color: var(--text-tertiary);
}

.msg__error {
  margin-top: var(--space-2);
  font-size: 13px;
  color: var(--el-color-danger);
}

/* 操作按钮：默认隐藏，hover / 键盘聚焦才出现（触摸设备上常显，否则点不到） */
.msg__tools {
  display: flex;
  gap: var(--space-2);
  margin-top: 6px;
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease-out);
}
.msg:hover .msg__tools,
.msg:focus-within .msg__tools {
  opacity: 1;
}
/* 出错时工具条常显：否则用户看不到"重试"入口 */
.msg__tools--pinned {
  opacity: 1;
}

/* 重试用主色强调，和"复制"这类次要操作区分开 */
.tool--retry {
  color: var(--brand);
  border-color: var(--border);
}
.tool--retry:hover {
  color: var(--text-on-brand);
  background-color: var(--brand);
  border-color: var(--brand);
}

.tool {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  min-height: 24px; /* WCAG 2.2 最小点击目标 24×24 */
  font-size: 12px;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--dur-fast) var(--ease-out);
}
.tool:hover {
  color: var(--text-primary);
  background-color: var(--bg-hover);
}

@media (hover: none) {
  /* 触摸设备没有 hover 态，按钮常显 */
  .msg__tools {
    opacity: 1;
  }
}

@media (max-width: 640px) {
  .msg__body {
    max-width: 88%; /* 手机上多给一点宽度，避免气泡太窄读起来累 */
  }
  .msg__avatar {
    width: 26px;
    height: 26px;
    margin-top: 20px;
  }
  .msg__text {
    font-size: 15px; /* 移动端不要小于 15px，否则中文阅读吃力 */
  }
  /* 手机上屏幕本就窄，思考区再压低一些，保证正式答案在首屏可见 */
  .msg__thinking-text {
    max-height: 28vh;
    font-size: 12.5px;
  }
  .msg__thinking {
    padding: var(--space-2);
  }
}
</style>
