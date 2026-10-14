/**
 * 全项目的类型定义集中在这里。
 *
 * 为什么单独放一个文件？
 * 阶段 2/3 里，前端和 Serverless Function 会共享"消息长什么样"这个约定，
 * 类型写在一处，两边都 import，改字段时编译期就能发现漏改的地方。
 */

/** 角色：DeepSeek / OpenAI 兼容接口只认这三种 */
export type ChatRole = 'system' | 'user' | 'assistant'

/** 一条消息的生命周期状态 */
export type MessageStatus =
  | 'done' // 正常完成
  | 'sending' // 用户消息已入列，等待服务端
  | 'streaming' // 助手消息正在逐字返回
  | 'error' // 出错（error 字段里有原因）

/** 界面里渲染的一条消息 */
export interface ChatMessage {
  /** 前端本地生成的唯一 id，用于 v-for 的 key 与后续"重试/删除某条" */
  id: string
  role: ChatRole
  content: string
  /** 毫秒时间戳，用于展示时间与做本地持久化排序 */
  createdAt: number
  status: MessageStatus
  /** 推理模型的思考链增量（普通模型没有这个字段） */
  reasoning?: string
  /** status === 'error' 时的错误提示文案 */
  error?: string
  /** 用户手动停止生成（status 已收尾为 done，但内容不完整） */
  stopped?: boolean
}

/**
 * 真正发给 DeepSeek 的最小结构。
 * 注意：不要把本地 id/status 发出去 —— 接口不认识这些字段，
 * 有些网关甚至会因为多余字段直接 400。
 */
export interface ApiMessage {
  role: ChatRole
  content: string
}

/** 主题 */
export type ThemeMode = 'light' | 'dark'

/* ==================== 前后端 HTTP 契约（阶段 2） ====================
 * 这些类型描述的是"浏览器 ↔ /api/chat"的 JSON，不是 DeepSeek 的内部结构。
 * 前端 fetch 的响应体和服务端 api/chat.ts 的返回都遵守这套形状。 */

/** 前端 → 后端代理 的请求体 */
export interface ChatRequest {
  /** 完整对话历史（多轮上下文，阶段 4 起携带） */
  messages: ApiMessage[]
  /** 期望使用的模型名；服务端会按白名单校验，非法值回落到默认模型 */
  model?: string
}

/** 后端代理 → 前端 的成功响应 */
export interface ChatResponse {
  reply: string
}

/** 后端代理 → 前端 的错误响应（HTTP 非 2xx 时） */
export interface ChatErrorResponse {
  error: string
}

/** 欢迎页的推荐问题 */
export interface ChatSuggestion {
  /** 卡片标题（短） */
  title: string
  /** 点击后真正填入输入框的内容（长） */
  prompt: string
}
