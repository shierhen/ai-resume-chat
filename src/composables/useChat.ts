import { computed, ref, watch } from 'vue'

import { DEFAULT_MODEL, isKnownModel } from '@/config/models'
import type { ApiMessage, ChatMessage, ChatSuggestion } from '@/types/chat'
import { consumeSse } from '@/utils/sse'
import { clearStoredMessages, loadMessages, saveMessages } from '@/utils/storage'

/**
 * 聊天状态管理（阶段 4：多轮上下文 + 本地持久化 + 重试 + 模型切换）
 *
 * 仍然坚持"业务逻辑收在 composable"的原则：组件层只管展示与触发。
 */

/** 生成一个够用的本地 id */
function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function createMessage(partial: Pick<ChatMessage, 'role' | 'content'> & Partial<ChatMessage>): ChatMessage {
  return {
    id: createId(),
    createdAt: Date.now(),
    status: 'done',
    ...partial,
  }
}

/** 启动时恢复历史（storage 内部已做全流程容错，失败就是空数组） */
const messages = ref<ChatMessage[]>(loadMessages())
const isReplying = ref(false)

/** 当前模型（持久化到 localStorage，刷新后保留） */
const MODEL_KEY = 'ai-chat:model:v1'
const storedModel = (() => {
  try {
    const v = localStorage.getItem(MODEL_KEY)
    return v && isKnownModel(v) ? v : DEFAULT_MODEL
  } catch {
    return DEFAULT_MODEL
  }
})()
const currentModel = ref<string>(storedModel)

/** 当前进行中请求的取消控制器（"停止生成"按钮用） */
let activeController: AbortController | null = null

/**
 * 持久化：messages 任何变化都落盘。
 * 流式期间内容会高频变化，所以要节流——否则每个 token 都触发一次 JSON.stringify + 写盘。
 */
let saveTimer: number | undefined
watch(
  messages,
  () => {
    if (saveTimer !== undefined) return
    saveTimer = window.setTimeout(() => {
      saveTimer = undefined
      saveMessages(messages.value)
    }, 400)
  },
  { deep: true },
)

watch(currentModel, (model) => {
  try {
    localStorage.setItem(MODEL_KEY, model)
  } catch {
    /* 忽略 */
  }
})

/** 欢迎页推荐问题 */
export const suggestions: ChatSuggestion[] = [
  {
    title: '自我介绍',
    prompt: '我是一个有 2 年经验的前端开发工程师，主力技术栈是 Vue 3 和小程序。请帮我写一段 150 字左右的自我介绍。',
  },
  {
    title: '解释一个概念',
    prompt: '用通俗的语言解释 Vue 3 的响应式原理，并说明它和 Vue 2 的 Object.defineProperty 方案有什么区别。',
  },
  {
    title: '代码审查',
    prompt: '帮我审查一段前端代码时，你会重点看哪些方面？请按优先级列出检查清单。',
  },
  {
    title: '面试模拟',
    prompt: '你现在是面试官，请针对"Vue 3 组合式 API"这个主题向我提 3 个由浅入深的面试问题。',
  },
]

/** 我们自己的事件流里单条 data 的结构（与 api/chat.ts 的契约一致） */
interface StreamEvent {
  type?: string
  content?: string
  error?: string
}

/** 多轮上下文最多携带多少条历史（太长会顶到上游的上下文上限，也费钱） */
const MAX_CONTEXT_MESSAGES = 20

/**
 * 把本地消息整理成要发给上游的 messages。
 *
 * 三条过滤规则：
 * 1. 丢掉出错的消息（它们没有有效内容，带上会污染上下文）；
 * 2. 丢掉内容为空的消息（例如"正在生成"的占位）；
 * 3. 只取最近 N 条，防止上下文无限增长。
 */
function buildApiMessages(upToIndex?: number): ApiMessage[] {
  const source = upToIndex === undefined ? messages.value : messages.value.slice(0, upToIndex)
  return source
    .filter((m) => m.status !== 'error' && m.content.trim() !== '')
    .slice(-MAX_CONTEXT_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content }))
}

/**
 * 发起一次流式请求。
 * @param history 要发送的上下文（含本轮用户消息）
 * @returns 助手消息在 messages 中的下标（失败时抛出）
 */
async function streamChat(history: ApiMessage[]): Promise<number> {
  const controller = new AbortController()
  activeController = controller

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: history, model: currentModel.value }),
    signal: controller.signal,
  })

  // 非 200：服务端返回 JSON 错误（发生在流开始之前）
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error ?? `请求失败（HTTP ${res.status}）`)
  }
  if (!res.body) {
    throw new Error('当前浏览器不支持流式响应')
  }

  // 占位一条"正在生成"的消息；注意后续操作要拿数组里的同一个代理对象
  messages.value.push(createMessage({ role: 'assistant', content: '', status: 'streaming' }))
  const index = messages.value.length - 1
  const msg = messages.value[index]!

  await consumeSse(res.body, (event) => {
    let payload: StreamEvent | null = null
    try {
      payload = JSON.parse(event.data) as StreamEvent
    } catch {
      return // 非 JSON 的 data 行直接忽略
    }
    if (!payload) return

    // 推理模型的增量在 reasoning 里，普通模型在 content 里，两者都要接住
    if (payload.type === 'content' && typeof payload.content === 'string') {
      msg.content += payload.content
    } else if (payload.type === 'reasoning' && typeof payload.content === 'string') {
      msg.reasoning = (msg.reasoning ?? '') + payload.content
    } else if (payload.type === 'error') {
      msg.status = 'error'
      msg.error = payload.error ?? '流式响应中断'
    }
  })

  if (msg.status === 'streaming') msg.status = 'done'
  return index
}

export function useChat() {
  const isEmpty = computed(() => messages.value.length === 0)

  /** 发送一条新消息（携带历史 = 多轮上下文） */
  async function sendMessage(text: string): Promise<void> {
    const content = text.trim()
    if (content === '' || isReplying.value) return

    messages.value.push(createMessage({ role: 'user', content }))
    // 先算好上下文（含刚推入的这条用户消息），再发请求
    const history = buildApiMessages()

    isReplying.value = true
    try {
      await streamChat(history)
    } catch (err) {
      handleStreamError(err)
    } finally {
      activeController = null
      isReplying.value = false
    }
  }

  /**
   * 重试：删掉从某条助手消息开始的内容（含它本身），用之前的历史重新请求。
   * 用于网络抖动、上游 5xx 等可恢复错误。
   */
  async function retryMessage(assistantId: string): Promise<void> {
    if (isReplying.value) return

    const index = messages.value.findIndex((m) => m.id === assistantId)
    if (index === -1) return

    // 上下文 = 这条助手消息之前的所有消息（即当时真实的对话状态）
    const history = buildApiMessages(index)
    if (history.length === 0) return

    // 砍掉这条失败的助手消息（以及它之后的内容，避免留下孤立的旧回答）
    messages.value.splice(index)

    isReplying.value = true
    try {
      await streamChat(history)
    } catch (err) {
      handleStreamError(err)
    } finally {
      activeController = null
      isReplying.value = false
    }
  }

  /** 统一的错误收尾：主动停止 vs 其它错误，处理方式不同 */
  function handleStreamError(err: unknown): void {
    if (err instanceof Error && err.name === 'AbortError') {
      // 用户点了"停止"：保留已生成的部分，标记 stopped
      const last = messages.value[messages.value.length - 1]
      if (last && last.role === 'assistant' && last.status === 'streaming') {
        last.status = 'done'
        last.stopped = true
      }
      return
    }
    const reason = err instanceof Error ? err.message : '网络异常，请稍后重试'
    messages.value.push(
      createMessage({ role: 'assistant', content: '', status: 'error', error: reason }),
    )
  }

  /** 停止当前生成：前端中止读取，服务端会通过 request.signal 联动中止上游 */
  function stopStreaming(): void {
    activeController?.abort()
  }

  /** 清空对话（同时清掉本地持久化） */
  function clearMessages(): void {
    if (messages.value.length === 0) return
    messages.value = []
    clearStoredMessages()
  }

  return {
    messages,
    isReplying,
    isEmpty,
    suggestions,
    currentModel,
    sendMessage,
    retryMessage,
    stopStreaming,
    clearMessages,
  }
}
