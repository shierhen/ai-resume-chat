/**
 * SSE 解析 / 封装 —— **服务端专用自包含副本**
 *
 * 【为什么要在 api/ 下再放一份，而不是 import ../src/utils/sse.ts】
 *
 * 这是本次 Vercel 部署踩到的真实故障：
 * 云端返回 `FUNCTION_INVOCATION_FAILED` 且响应体为空 —— 说明函数在**加载阶段**就崩了，
 * 根本没执行到业务代码（否则会返回我们写的错误文案）。
 * 根因是 `api/` 引用了 `api/` 之外的 `../src/...`（还带 `.ts` 扩展名）：
 * 本地 Node 24 原生支持直接跑 .ts 所以没事，但 Vercel 用 esbuild 打包函数时
 * 这种跨目录 + 带扩展名的引用无法解析，函数模块加载失败。
 *
 * 解决思路：**让 Serverless 函数的依赖闭包完全落在 api/ 目录内**（自包含）。
 *   - 好处：Vercel 打包零风险；函数体积更小；本地与服务端行为一致；
 *   - 代价：这份代码与 src/utils/sse.ts 内容重复。
 *
 * 关于重复代码的处理：
 *   - 两边都加了指向对方的注释，改一处要同步另一处；
 *   - scripts/test-sse.ts 单测的是 src/utils/sse.ts，本文件逻辑与之完全一致；
 *   - 若将来这份解析逻辑变复杂，可考虑抽成独立 npm 包或构建期拷贝，避免手工同步。
 *
 * 本文件为纯 TS，不依赖 window / DOM，也不 import 任何其它模块。
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
 * 处理的边界情况：
 * 1. UTF-8 多字节字符可能被分片切断 → decode 传 { stream: true }，内部缓存半个字符；
 * 2. 一条事件可能跨多个 chunk → 维护跨 chunk 的文本 buffer；
 * 3. 行尾可能是 \n 或 \r\n → 统一按行处理并吞掉 \r；
 * 4. 一个事件里可能有多行 data: → 用 \n 拼接后一次性回调；
 * 5. 空行是事件结束标志；
 * 6. `: xxx` 注释行直接忽略（部分厂商用它做心跳）。
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
