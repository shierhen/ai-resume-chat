import type { ChatMessage } from '@/types/chat'

/**
 * 聊天记录的本地持久化（localStorage）
 *
 * 设计要点：
 * 1. **带版本号**：键名里含 `v1`。将来消息结构变了，可以换 v2 而不会读到旧结构导致崩溃。
 * 2. **全流程容错**：隐私模式下 localStorage 会抛异常；旧数据可能不符合新结构。
 *    任何一步出错都退化成"没有历史"，绝不让页面白屏。
 * 3. **恢复时修正状态**：刷新发生时，可能正有一条消息处于 streaming/sending。
 *    这类"半成品"如果不修正，恢复后会永远转圈 —— 所以统一落成 done。
 */

const STORAGE_KEY = 'ai-chat:messages:v1'

/** 最多保存多少条，避免 localStorage 爆掉（5MB 上限） */
const MAX_PERSISTED = 200

interface PersistedPayload {
  version: 1
  messages: ChatMessage[]
}

/** 读取历史消息；任何异常都返回空数组 */
export function loadMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw) as PersistedPayload
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.messages)) return []

    return parsed.messages
      .filter((m): m is ChatMessage => {
        return (
          m !== null &&
          typeof m === 'object' &&
          typeof m.id === 'string' &&
          (m.role === 'user' || m.role === 'assistant' || m.role === 'system') &&
          typeof m.content === 'string' &&
          typeof m.createdAt === 'number'
        )
      })
      // 上次刷新/关闭页面时正在生成的消息，恢复后统一收尾，否则会一直显示"生成中"
      .map((m) => (m.status === 'streaming' || m.status === 'sending' ? { ...m, status: 'done' as const } : m))
      .slice(-MAX_PERSISTED)
  } catch {
    return []
  }
}

/** 写入历史消息；失败时静默忽略（配额满、隐私模式等） */
export function saveMessages(messages: ChatMessage[]): void {
  try {
    const payload: PersistedPayload = { version: 1, messages: messages.slice(-MAX_PERSISTED) }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* 存不下就算了，不影响本次会话使用 */
  }
}

/** 清空持久化（"清空对话"时调用） */
export function clearStoredMessages(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* 忽略 */
  }
}
