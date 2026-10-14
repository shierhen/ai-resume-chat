/**
 * Vercel Serverless Function：/api/chat —— 阶段 3：SSE 流式输出
 *
 * 【职责】
 * 1. 保管 DEEPSEEK_API_KEY（密钥只在服务端进程里）；
 * 2. 以 stream:true 调上游，把它的 SSE **翻译**成我们自己的极简事件流：
 *      data: {"type":"reasoning","content":"…"}   思考链增量（推理模型才有）
 *      data: {"type":"content","content":"你"}     正式回答增量
 *      data: {"type":"done"}
 *    前端契约稳定，不耦合上游的 choices[].delta 结构（换厂商只改这里）；
 * 3. 取消联动：客户端断开（request.signal）或 30s 未出首字 → 中止上游 fetch，
 *    避免为一个已离开的客户端继续烧 token。
 *
 * 【为什么返回 Response(ReadableStream) 而不是先攒完整再返回】
 * 流式的核心就是"边收边转发"。任何"等全部拿完再写"的中间缓冲都会毁掉流式。
 */
import { consumeSse, encodeSseJson } from './_sse.ts'

/**
 * 消息角色的类型。
 *
 * 【为什么在这里内联，而不是 import ../src/types/chat.ts】
 * 与 _sse.ts 同样的原因：Vercel 打包函数时，`api/` 之外的相对引用（尤其带 .ts 扩展名）
 * 会导致模块加载失败（FUNCTION_INVOCATION_FAILED）。
 * 服务端只需要 role/content 这两个字段，内联三行类型最省事、也最稳。
 */
type ChatRole = 'system' | 'user' | 'assistant'
interface ApiMessage {
  role: ChatRole
  content: string
}

/** 入参闸门：最多 50 条消息、单条最长 20 万字符 */
const MAX_MESSAGES = 50
const MAX_CONTENT_LENGTH = 200_000

/** 从发起到上游吐出第一个字的最长等待；之后生成多久不限 */
const FIRST_BYTE_TIMEOUT_MS = 30_000

/**
 * 允许前端选择的模型白名单。
 * 为什么要白名单：前端传参可被任意篡改，若直接透传给上游，
 * 别人就能拿你的密钥调用任意（可能更贵的）模型 —— 这是"省钱 + 防滥用"的第一道闸。
 * 需要新增模型时，这里和 src/config/models.ts 一起改。
 */
const MODEL_WHITELIST = ['deepseek-v4-flash', 'sensenova-6.8-flash-lite', 'glm-5.2', 'kimi-k3']

/** 默认模型（前端没传或传了非法值时使用） */
const DEFAULT_MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash'

/** Vercel 函数超时上限（流式生成可能较长） */
export const config = {
  maxDuration: 60,
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'no-store',
} as const

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: CORS_HEADERS })
}

/** 简单校验入参 */
function validate(messages: unknown): ApiMessage[] | null {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) return null
  const out: ApiMessage[] = []
  for (const item of messages) {
    if (item === null || typeof item !== 'object') return null
    const m = item as Record<string, unknown>
    if (m.role !== 'user' && m.role !== 'assistant' && m.role !== 'system') return null
    if (typeof m.content !== 'string' || m.content.length > MAX_CONTENT_LENGTH) return null
    out.push({ role: m.role, content: m.content })
  }
  return out
}

/**
 * 解析上游 data 行的内容：
 * - '[DONE]' 哨兵 → 返回 'DONE'
 * - JSON 对象 → 返回它
 * - 其它（非 JSON）→ 返回 null，忽略
 */
type UpstreamDelta = {
  choices?: Array<{
    delta?: {
      /** 正式回答的增量（普通模型走这里） */
      content?: string
      /** 思考链增量：部分厂商用 reasoning，部分用 reasoning_content */
      reasoning?: string
      reasoning_content?: string
    }
  }>
}
function parseUpstreamData(raw: string): UpstreamDelta | 'DONE' | null {
  const trimmed = raw.trim()
  if (trimmed === '[DONE]') return 'DONE'
  try {
    return JSON.parse(trimmed) as UpstreamDelta
  } catch {
    return null
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError'
}

export async function POST(request: Request): Promise<Response> {
  // 跨域预检
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  const key = process.env.DEEPSEEK_API_KEY
  if (!key) {
    return json({ error: '服务端未配置 DEEPSEEK_API_KEY，请先在 .env.local / Vercel 设置环境变量' }, 500)
  }

  let messages: ApiMessage[]
  let model: string
  try {
    const body = (await request.json()) as { messages?: unknown; model?: unknown }
    const checked = validate(body?.messages)
    if (!checked) {
      return json({ error: `messages 必须为 1-${MAX_MESSAGES} 条，且每条含 role 与字符串 content` }, 400)
    }
    messages = checked
    // 模型白名单：前端传来的值不可信（可被篡改），只接受清单内的名字，
    // 非法值静默回落到默认模型 —— 既防滥用，也不会让用户因为一个错字就用不了。
    const requested = typeof body?.model === 'string' ? body.model : ''
    model = MODEL_WHITELIST.includes(requested) ? requested : DEFAULT_MODEL
  } catch {
    return json({ error: '请求体不是合法的 JSON' }, 400)
  }

  const baseUrl = process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com'

  // 取消联动：
  //  - request.signal：客户端断开连接时浏览器会触发它；
  //  - firstByteTimer：30s 还没出第一个字就超时（生成开始后不再限制时长）。
  const upstreamController = new AbortController()
  const onRequestAbort = (): void => upstreamController.abort()
  request.signal.addEventListener('abort', onRequestAbort)
  const firstByteTimer = setTimeout(() => upstreamController.abort(), FIRST_BYTE_TIMEOUT_MS)

  const cleanupTimers = (): void => {
    clearTimeout(firstByteTimer)
    request.signal.removeEventListener('abort', onRequestAbort)
  }

  let upstream: Response
  try {
    upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        // 模型由前端选择、服务端白名单校验后传入（阶段 4）；
        // 没传或非法则落到 DEFAULT_MODEL（可由 DEEPSEEK_MODEL 环境变量覆盖）。
        // 实测提醒：sensenova-6.8-flash-lite 会把预算烧在思考链上、不产出正式答案；
        // 官方端点请用 deepseek-chat（直接答）或 deepseek-reasoner（先思考后答）。
        model,
        messages,
        temperature: 0.7,
        max_tokens: 4096, // 推理模型要先"想"再"答"，预算太小会全是思考链、没有答案
        stream: true, // ← 阶段 3：开启流式
      }),
      signal: upstreamController.signal,
    })
  } catch (err) {
    cleanupTimers()
    if (isAbortError(err)) {
      // 客户端断开或首字超时：没有能送达的响应了
      return json({ error: '请求已取消' }, 499)
    }
    return json({ error: '无法连接 DeepSeek，请稍后重试' }, 504)
  }

  if (!upstream.ok || !upstream.body) {
    cleanupTimers()
    const text = await upstream.text().catch(() => '')
    let message = `DeepSeek 请求失败（HTTP ${upstream.status}）`
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } }
      if (typeof parsed?.error?.message === 'string') message = parsed.error.message
    } catch {
      /* 默认文案 */
    }
    return json({ error: message }, 502)
  }

  // 上面的守卫已经排除了 null，这里固化成非空局部变量再传进闭包——
  // TS 的 null 收窄在函数回调里会丢失，否则报 ReadableStream | null
  const upstreamBody = upstream.body

  // 把上游 SSE 翻译成我们的 {type} 事件流，边收边写
  const stream = new ReadableStream<Uint8Array>({
    async start(streamController) {
      try {
        await consumeSse(upstreamBody, (event) => {
          clearTimeout(firstByteTimer) // 有字到达，取消首字超时
          const payload = parseUpstreamData(event.data)
          if (payload === null) return
          if (payload === 'DONE') {
            streamController.enqueue(encodeSseJson({ type: 'done' }))
            return
          }
          // 关键兼容点：推理模型的增量在 reasoning / reasoning_content 里，
          // 只认 content 会把整段输出丢掉（这就是本次实测踩到的坑）。
          const delta = payload.choices?.[0]?.delta
          if (!delta) return

          const content = delta.content
          if (typeof content === 'string' && content !== '') {
            streamController.enqueue(encodeSseJson({ type: 'content', content }))
            return
          }
          const reasoning = delta.reasoning ?? delta.reasoning_content
          if (typeof reasoning === 'string' && reasoning !== '') {
            streamController.enqueue(encodeSseJson({ type: 'reasoning', content: reasoning }))
          }
          // 首帧的 delta.role、末尾的 usage、空增量：都会落到这里被忽略
        })
        // 上游可能没发 [DONE]，这里保证前端一定能收到结束事件
        try {
          streamController.enqueue(encodeSseJson({ type: 'done' }))
        } catch {
          /* 流已关闭 */
        }
      } catch (err) {
        if (!isAbortError(err)) {
          try {
            streamController.enqueue(encodeSseJson({ type: 'error', error: '上游响应中断' }))
          } catch {
            /* 流已关闭 */
          }
        }
      } finally {
        cleanupTimers()
        try {
          streamController.close()
        } catch {
          /* 流已关闭 */
        }
      }
    },
    cancel() {
      // 客户端在读流途中断开：中止上游请求，避免继续烧 token。
      //
      // 【踩坑记录】这里不能写 upstreamBody.cancel()：此刻它已被 consumeSse 里的
      // reader 锁定，对锁定流调 cancel() 会抛 ERR_INVALID_STATE；而异常发生在取消
      // 回调里，会变成未捕获拒绝，直接把 Node 进程带崩（本地 dev-api 就是这样挂的）。
      // 正确做法：abort 整个上游 fetch —— 进行中的 read() 会以 AbortError 结束，
      // consumeSse 的 finally 会释放 reader 锁。
      upstreamController.abort()
    },
  })

  return new Response(stream, {
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'text/event-stream; charset=utf-8',
      // no-transform：禁止中间层（压缩/代理）缓冲，保证字节尽快到达
      'Cache-Control': 'no-cache, no-transform',
    },
  })
}
