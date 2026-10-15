// 线上验收：完整检查部署是否正常。用完删除。
const BASE = ''

async function get(path) {
  const r = await fetch(BASE + path, { signal: AbortSignal.timeout(25000) })
  return r
}

async function main() {
  console.log('=== 1. 首页 ===')
  let jsUrl = null
  let cssUrl = null
  try {
    const r = await get('/')
    console.log('  HTTP', r.status, '| content-type:', r.headers.get('content-type'))
    const html = await r.text()
    console.log('  HTML 长度:', html.length, '字节')

    const jsMatch = html.match(/src="([^"]+\.js)"/)
    const cssMatch = html.match(/href="([^"]+\.css)"/)
    if (jsMatch) {
      jsUrl = jsMatch[1]
      console.log('  主 JS :', jsUrl)
    }
    if (cssMatch) {
      cssUrl = cssMatch[1]
      console.log('  主 CSS:', cssUrl)
    }
    console.log('  含 #app 挂载点:', html.includes('id="app"'))
    console.log('  含防主题闪烁脚本:', html.includes('ai-chat:theme'))
  } catch (e) {
    console.log('  ❌ 失败:', e.message)
    return
  }

  console.log('')
  console.log('=== 2. 静态资源可访问性 ===')
  for (const u of [jsUrl, cssUrl].filter(Boolean)) {
    try {
      const r = await get(u)
      const len = (await r.arrayBuffer()).byteLength
      console.log(`  ${r.status} | ${(len / 1024).toFixed(1)} KB | ${u.split('/').pop()}`)
    } catch (e) {
      console.log('  ❌', u, e.message)
    }
  }

  console.log('')
  console.log('=== 3. 🔐 密钥泄漏检查（关键）===')
  if (jsUrl) {
    try {
      const r = await get(jsUrl)
      const js = await r.text()
      const leaked = js.match(/sk-[A-Za-z0-9]{10,}/g)
      const hasKeyName = js.includes('DEEPSEEK_API_KEY')
      console.log('  JS 产物大小:', (js.length / 1024).toFixed(1), 'KB')
      console.log('  发现 sk- 开头的密钥:', leaked ? `⛔ 是！（${leaked.length} 处）` : '✅ 无')
      console.log('  出现 DEEPSEEK_API_KEY 字样:', hasKeyName ? '⚠️ 是（仅变量名不算泄漏，但需确认）' : '✅ 无')
    } catch (e) {
      console.log('  ❌ 检查失败:', e.message)
    }
  }

  console.log('')
  console.log('=== 4. /api/chat 健康检查 ===')
  // 4a. 非法入参：验证函数能否执行（应返回 400）
  try {
    const r = await fetch(BASE + '/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [] }),
      signal: AbortSignal.timeout(30000),
    })
    const text = await r.text()
    console.log('  [空 messages] HTTP', r.status, '→', text.slice(0, 120))
    if (r.status === 400) console.log('    ✅ 函数已正常执行（不再 FUNCTION_INVOCATION_FAILED）')
    else if (r.status === 500 && text.includes('FUNCTION_INVOCATION')) console.log('    ❌ 函数仍加载失败')
  } catch (e) {
    console.log('  ❌', e.message)
  }

  // 4b. 真实流式请求
  try {
    const r = await fetch(BASE + '/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: '只回答三个字：部署成功' }] }),
      signal: AbortSignal.timeout(60000),
    })
    const ct = r.headers.get('content-type') ?? ''
    console.log('  [真实请求] HTTP', r.status, '| content-type:', ct)
    console.log('  x-vercel-id:', r.headers.get('x-vercel-id') ?? '(无)')

    if (ct.includes('event-stream')) {
      const dec = new TextDecoder()
      const rd = r.body.getReader()
      let text = ''
      let reason = ''
      let carry = ''
      let firstAt = 0
      const t0 = Date.now()
      const types = {}
      while (true) {
        const { done, value } = await rd.read()
        if (done) break
        if (!firstAt) firstAt = Date.now() - t0
        carry += dec.decode(value, { stream: true })
        const parts = carry.split('\n\n')
        carry = parts.pop() || ''
        for (const p of parts) {
          const line = p.split('\n').find((l) => l.startsWith('data:'))
          if (!line) continue
          try {
            const j = JSON.parse(line.slice(5).trim())
            types[j.type] = (types[j.type] || 0) + 1
            if (j.type === 'content') text += j.content
            if (j.type === 'reasoning') reason += j.content
          } catch {
            /* 忽略 */
          }
        }
      }
      console.log('  首字节延迟:', firstAt, 'ms')
      console.log('  事件统计:', JSON.stringify(types))
      console.log('  正式答案:', JSON.stringify(text.slice(0, 60)))
      console.log('  思考链长度:', reason.length)
      console.log(text.length > 0 ? '  ✅ 线上流式完全正常' : '  ⚠️ 无正式答案（检查模型或上游限流）')
    } else {
      const t = await r.text()
      console.log('  响应体:', t.slice(0, 300))
      if (t.includes('tpm/rpm')) console.log('  ⚠️ 上游限流（非代码问题，函数本身正常）')
    }
  } catch (e) {
    console.log('  ❌', e.message)
  }
}

main().catch((e) => console.log('FATAL', e && e.message))
