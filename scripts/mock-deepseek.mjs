/**
 * 模拟 DeepSeek 的 /chat/completions 接口（本地用：不发真实请求、不消耗 token）。
 *
 * 【用法】开两个终端：
 *  终端 1：npm run mock:api                    → 本脚本监听 8788
 *  终端 2：DEEPSEEK_BASE_URL=http://localhost:8788 npm run dev:api
 *
 * 【原理】我们的 Serverless 函数只是按 OpenAI 兼容协议调 `${baseUrl}/chat/completions`，
 * 把 baseUrl 指到这个脚本，就能在没有密钥的情况下走通"前端 → 代理 → 上游"整条链路，
 * 用它验证代码正确性，等配好真密钥再切回真实接口。
 */
import { createServer } from 'node:http'

const PORT = Number(process.env.PORT ?? 8788)

createServer((req, res) => {
  let raw = ''
  req.on('data', (chunk) => {
    raw += chunk
  })
  req.on('end', () => {
    let model = 'deepseek-chat'
    try {
      // 注意：.mjs 是纯 JS，不能写 TS 的类型断言
      const parsed = JSON.parse(raw || '{}')
      if (typeof parsed.model === 'string') model = parsed.model
    } catch {
      /* 忽略坏请求体，用默认模型名 */
    }

    // 延迟 400ms，模拟真实的"思考中"体验
    setTimeout(() => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          id: 'mock-cmpl-0001',
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content:
                  '【模拟回复】链路已打通 ✅（当前由 scripts/mock-deepseek.mjs 扮演 DeepSeek）。\n\n' +
                  '接下来：把真实的 DEEPSEEK_API_KEY 配到 .env.local，重启 npm run dev:api，就能收到真实回答。',
              },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 12, completion_tokens: 40, total_tokens: 52 },
        }),
      )
    }, 400)
  })
}).listen(PORT, () => {
  console.log(`[mock-deepseek] 已就绪: http://localhost:${PORT}/chat/completions`)
})
