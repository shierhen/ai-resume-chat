/**
 * 本地 API 服务器（约 30 行）：把 api/chat.ts 这个"Vercel 函数"接到本地 HTTP 上。
 *
 * 【原理】
 * Serverless Function 本质上就是"收到标准 Request → 返回标准 Response"的普通函数。
 * `vercel dev` 做的事，就是一个把 Node 的 (req, res) 翻译成 Web 标准 Request/Response
 * 的适配层 —— 下面我们自己写一个最小版，因此**不装 vercel CLI 也能本地完整联调**。
 *
 * 流程：node:http 起服务 → 组装 Request → 调用 api/chat.ts 的 POST → 把返回的
 * Response 流式写回 Node 的 res（阶段 3 的 SSE 也是走这一段，本文件届时无需大改）。
 *
 * 用法：npm run dev:api
 *       （前端的 /api 请求由 vite.config.ts 的 proxy 转发到本服务的 8787 端口）
 */
import { createServer } from 'node:http'
import { once } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'

import { POST as handler } from '../api/chat.ts'

const PORT = Number(process.env.PORT ?? 8787)

/** Node 的 req 是流，要手动收集成字符串（和 Web 的 ReadableStream 不是一回事） */
async function readBody(req: IncomingMessage, limit: number = 1 << 20): Promise<string | null> {
  let size: number = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    size += chunk.length
    if (size >= limit) {
      req.destroy()
      throw new Error('请求体太大')
    }
    chunks.push(chunk as Buffer)
  }
  return size === 0 ? '' : Buffer.concat(chunks).toString('utf8')
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {

  try {
    // 1. 组装 Web 标准 Request
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
    const headers = new Headers()
    for (const [name, value] of Object.entries(req.headers)) {
      if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value)
    }

    const body = await readBody(req)
    const hasBody = req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE'
    const request = new Request(url, {
      method: req.method,
      headers,
      body: hasBody ? body : undefined,
      // Web 标准要求：带 body 的 Request 必须显式声明 duplex
      duplex: 'half',
    })

    // 2. 调的就是部署到 Vercel 上的那个函数本体（同一份代码）
    const response = await handler(request)
    // 3. 把 Web 的 Response 流式写给 Node 的 res
    const outHeaders: Record<string, string> = {}
    response.headers.forEach((value, name) => {
      if (name.toLowerCase() !== 'content-length') outHeaders[name] = value // 长度由我们自己算，避免不一致
    })
    res.writeHead(response.status, outHeaders)
    if (response.body) {
      const reader = response.body.getReader()
      const onClose = () => {
        // 兜底：取消路径必须吞掉异常。否则流实现里任何一次 cancel 抛错
        // 都会变成未捕获拒绝，把整个 dev-api 进程带崩（曾真实发生）。
        void Promise.resolve(reader.cancel()).catch(() => {})
      }
      res.once('close', onClose)
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (!res.write(value)) {
            await once(res, 'drain')
          }

        }
      } finally {
        res.off('close', onClose)
        reader.releaseLock()
      }
    }
    res.end()
  } catch (err) {
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
  }
}

createServer(handle).listen(PORT, () => {
  console.log(`[dev-api] http://localhost:${PORT}`)
  console.log(`[dev-api] 上游: ${process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com（真实 DeepSeek）'}`)
  console.log(
    `[dev-api] 密钥: ${process.env.DEEPSEEK_API_KEY ? '已设置（来自环境变量 / .env.local）' : '未设置 —— /api/chat 会返回 500'}`,
  )
})
