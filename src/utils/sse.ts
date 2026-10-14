/**
 * 极简 SSE（Server-Sent Events）解析器 / 封装器 —— **前端使用**
 *
 * 为什么"解析"和"封装"放同一个文件？
 * - 服务端要解析 DeepSeek 上游的 SSE，前端要解析我们服务端发出的 SSE，
 *   报文格式一模一样（data: 行 + 空行分隔事件），所以解析逻辑只需要一份；
 * - 封装（encodeSseJson）则是把对象变成 SSE 帧，供服务端回写给前端。
 *
 * ⚠️ 【重要：本文件与服务端存在一份"有意重复"的副本】
 * `api/_sse.ts` 是本文件的**逐行相同副本**（仅注释不同），专门给 Serverless 函数用。
 * 原因：Vercel 用 esbuild 打包函数时，`api/` 目录**向外**的相对引用（`../src/utils/sse.ts`，
 * 尤其带 `.ts` 扩展名）无法解析，会导致线上 FUNCTION_INVOCATION_FAILED —— 这是真实踩过的坑。
 * 所以函数的依赖闭包必须完全落在 `api/` 内。
 *
 * 【维护约定】修改 SSE 解析逻辑时，**两个文件都要改**：
 *   - src/utils/sse.ts（前端 + scripts/test-sse.ts 单测覆盖）
 *   - api/_sse.ts     （服务端 / Vercel 函数）
 *
 * 本文件是纯 TS，不依赖 window/DOM：浏览器与 Node 24 都能直接跑，
 * 这也是 scripts/test-sse.ts 能脱离浏览器做单测的原因。
 */

export interface SseEvent {
  /** 原始 data 字符串（一个事件内多行 data: 已用 \n 拼接） */
  data: string
}

export type SseHandler = (event: SseEvent) => void

const encoder = new TextEncoder()

/** 把一个 JSON 对象封装成一帧 SSE：`data: {json}` + 空行结尾 */
export function encodeSseJson(payload: unknown): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
}

/**
 * 消费一个 Web ReadableStream，按 SSE 协议切出事件并回调，流结束（或出错）时返回。
 *
 * 处理的边界情况（都是真实生产中会踩的坑）：
 * 1. UTF-8 多字节字符可能被网络分片从中间切断 → 每次 decode 都要传 { stream: true }，
 *    让它内部缓存半个字符，等下一个 chunk 补全；
 * 2. 一条事件可能跨多个 chunk → 维护一个跨 chunk 的文本 buffer；
 * 3. 行尾可能是 \n 或 \r\n → 统一按行处理并把 \r 吞掉；
 * 4. 一个事件里可能有多行 data: → 用 \n 拼接后一次性回调；
 * 5. 空行是事件结束标志；
 * 6. `: xxx` 注释行直接忽略（OpenAI 系兼容实现会用它做心跳）。
 */
export async function consumeSse(
  stream: ReadableStream<Uint8Array>,
  onEvent: SseHandler,
): Promise<void> {
  // 注意：{ stream: true } 是 decode() 的选项，不是 TextDecoder 构造函数的选项。
  const decoder = new TextDecoder('utf-8')
  const reader = stream.getReader()
  let buffer = '' // 跨 chunk 的未完成文本
  let dataLines: string[] = []

  const flushEvent = (): void => {
    if (dataLines.length === 0) return
    onEvent({ data: dataLines.join('\n') })
    dataLines = []
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // 逐行处理；最后一段可能是不完整的行，留到下一轮或流结束时处理
      let lineEnd = buffer.indexOf('\n')
      while (lineEnd !== -1) {
        let line = buffer.slice(0, lineEnd)
        buffer = buffer.slice(lineEnd + 1)
        if (line.endsWith('\r')) line = line.slice(0, -1) // 吞掉 CRLF 的 \r

        if (line === '') {
          flushEvent() // 空行 = 事件结束
        } else if (line.startsWith(':')) {
          // SSE 注释行：忽略（可做心跳）
        } else if (line.startsWith('data:')) {
          // 规范只要求去掉"data:" 后紧跟的一个空格，这里宽松地去掉全部前导空白
          const payload = line.slice(5).trimStart()
          if (payload !== '') dataLines.push(payload)
        }
        // event:/id:/retry: 字段本协议用不到，忽略
        lineEnd = buffer.indexOf('\n')
      }
    }

    // 流结束：冲刷 TextDecoder 剩余的字节，并处理"末尾没有空行"的最后一个事件
    buffer += decoder.decode()
    if (buffer !== '') {
      let line = buffer
      if (line.endsWith('\r')) line = line.slice(0, -1)
      if (line.startsWith('data:')) {
        const payload = line.slice(5).trimStart()
        if (payload !== '') dataLines.push(payload)
      }
    }
    flushEvent()
  } finally {
    reader.releaseLock()
  }
}
