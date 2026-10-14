<script setup lang="ts">
/**
 * 输入区：自适应高度的多行文本框 + 发送按钮
 *
 * 这里集中处理三个真实项目的"坑"：
 * 1. 中文输入法：选词时按 Enter 是"上屏候选词"，绝不能当成发送；
 * 2. 文本框自适应高度：内容变多时自动长高，到上限后内部滚动；
 * 3. 移动端键盘遮挡：底部用 env(safe-area-inset-bottom) + 100dvh 布局解决。
 */
import { computed, nextTick, ref } from 'vue'
import { Promotion, VideoPause } from '@element-plus/icons-vue'

const props = withDefaults(
  defineProps<{
    /** 是否禁用（AI 正在回复时禁用，防止并发请求） */
    disabled?: boolean
    /** 输入框占位文案 */
    placeholder?: string
  }>(),
  {
    disabled: false,
    placeholder: '给 AI 发送消息…（Enter 发送，Shift + Enter 换行）',
  },
)

const emit = defineEmits<{
  send: [text: string]
  /** 用户点击"停止"或按 Esc：要求中止当前生成 */
  stop: []
}>()

const text = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)

/** 输入法是否处于"组词中"状态（拼音还没上屏） */
const isComposing = ref(false)

const MAX_HEIGHT = 168 // 约 6 行，超过就内部滚动

const canSend = computed(() => text.value.trim() !== '' && !props.disabled)

/** 让文本框高度贴合内容：先置 auto 再读 scrollHeight，否则高度只会增不会减 */
function resize(): void {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
  el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden'
}

function submit(): void {
  if (!canSend.value) return
  const value = text.value.trim()
  text.value = ''
  void nextTick(resize) // 清空后把高度收回去
  emit('send', value)
}

function handleKeydown(event: KeyboardEvent): void {
  // 生成中按 Esc = 停止生成（此时 Enter 不会发送，因为 canSend 为 false）
  if (event.key === 'Escape') {
    if (props.disabled) emit('stop')
    return
  }
  if (event.key !== 'Enter') return
  // 组词中（event.isComposing 是浏览器原生标志）或按了 Shift，都不发送
  if (isComposing.value || event.isComposing) return
  if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return
  event.preventDefault() // 阻止默认的"换行"
  submit()
}

function handleCompositionStart(): void {
  isComposing.value = true
}

function handleCompositionEnd(): void {
  // 注意：compositionend 可能早于最后一次 keydown 触发，
  // 所以这里用 setTimeout 把标志位延后一帧再清掉，避免"回车误发送"。
  window.setTimeout(() => (isComposing.value = false), 0)
}
</script>

<template>
  <footer class="composer">
    <div class="composer__inner">
      <div class="box" :class="{ 'box--disabled': disabled }">
        <textarea ref="textareaRef" v-model="text" class="box__input" rows="1" :placeholder="placeholder"
          :disabled="disabled" enterkeyhint="send" aria-label="消息输入框" @input="resize" @keydown="handleKeydown"
          @compositionstart="handleCompositionStart" @compositionend="handleCompositionEnd" />

        <!-- 生成中：发送键变成"停止"键（输入框此时被禁用，但停止键必须可点） -->

        <button v-if="disabled" class="send-btn send-btn--stop" type="button" aria-label="停止生成" title="停止生成（Esc）" @click="emit('stop')">
          <el-icon :size="16">
            <VideoPause />
          </el-icon>
        </button>


        <el-tooltip v-else content="发送" placement="top" :disabled="!canSend">
          <button class="send-btn" type="button" :disabled="!canSend" aria-label="发送消息" @click="submit">
            <el-icon :size="18">
              <Promotion />
            </el-icon>
          </button>
        </el-tooltip>
      </div>

      <p class="composer__hint">
        回复内容由 AI 生成，请自行甄别。
      </p>
    </div>
  </footer>
</template>

<style scoped>
.composer {
  position: sticky;
  bottom: 0;
  z-index: 10;
  padding: var(--space-3) var(--space-4);
  /* 底部安全区：全面屏 iPhone 的 Home 指示条区域 */
  padding-bottom: calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
  background: linear-gradient(to top, var(--bg-app) 72%, transparent);
}

.composer__inner {
  max-width: var(--content-max);
  margin: 0 auto;
}

.box {
  display: flex;
  align-items: flex-end;
  /* 让按钮始终贴底，输入多行时不会浮在中间 */
  gap: var(--space-2);
  padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background-color: var(--bg-subtle);
  box-shadow: var(--shadow-sm);
  transition:
    border-color var(--dur-fast) var(--ease-out),
    box-shadow var(--dur-fast) var(--ease-out);
}

/* :focus-within：焦点在内部任意元素（包括 textarea）时，给整个容器加高亮 */
.box:focus-within {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-soft);
}

.box--disabled {
  opacity: 0.75;
}

.box__input {
  flex: 1;
  min-height: 24px;
  max-height: 168px;
  padding: var(--space-2) 0;
  border: none;
  outline: none;
  resize: none;
  /* 关掉浏览器自带的小三角，高度由 JS 控制 */
  background: transparent;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 16px;
  /* 必须 ≥16px：iOS Safari 会对更小的输入框自动放大页面 */
  line-height: 1.5;
}

.box__input::placeholder {
  color: var(--text-tertiary);
}

.send-btn {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: var(--radius-md);
  color: var(--text-on-brand);
  background-color: var(--brand);
  cursor: pointer;
  transition:
    background-color var(--dur-fast) var(--ease-out),
    transform var(--dur-fast) var(--ease-out);
}

.send-btn:hover:not(:disabled) {
  background-color: var(--brand-hover);
}

.send-btn:active:not(:disabled) {
  transform: scale(0.94);
}

.send-btn:disabled {
  cursor: not-allowed;
  color: var(--text-tertiary);
  background-color: var(--bg-hover);
}

/* 停止按钮：同样尺寸但用中性色，避免和"发送"抢注意力 */
.send-btn--stop {
  color: var(--text-primary);
  background-color: var(--bg-hover);
}

.send-btn--stop:hover {
  background-color: var(--border-strong);
}

.composer__hint {
  margin-top: 6px;
  text-align: center;
  font-size: 12px;
  color: var(--text-tertiary);
}

@media (max-width: 640px) {
  .composer {
    padding-left: var(--space-3);
    padding-right: var(--space-3);
  }

  /* 手机上提示文案太长，隐藏掉更干净 */
  .composer__hint {
    display: none;
  }

  /* 触摸设备把按钮做大一点更好按 */
  .send-btn {
    width: 40px;
    height: 40px;
  }
}
</style>
