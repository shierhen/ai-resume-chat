/**
 * 无框架的 SSE 解析器单元测试（node 直接跑）：
 *   node scripts/test-sse.ts
 * 覆盖：普通事件 / 跨 chunk 的 UTF-8 多字节字符 / CRLF / 多行 data: /
 *       注释行 / 一条流内多个事件 / 末尾无空行的最后一个事件。
 */
import { consumeSse } from '../src/utils/sse.ts'

let pass = 0
let fail = 0

function makeStream(parts: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const p of parts) controller.enqueue(p)
      controller.close()
    },
  })
}

async function collect(parts: Uint8Array[]): Promise<string[]> {
  const events: string[] = []
  await consumeSse(makeStream(parts), (ev) => events.push(ev.data))
  return events
}

function check(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) {
    pass++
    console.log(`  ✅ ${name}`)
  } else {
    fail++
    console.log(`  ❌ ${name}\n     实际: ${JSON.stringify(actual)}\n     期望: ${JSON.stringify(expected)}`)
  }
}

const enc = new TextEncoder()

async function main(): Promise<void> {
  // 1) 普通单事件
  check('单事件', await collect([enc.encode('data: {"a":1}\n\n')]), ['{"a":1}'])

  // 2) 中文跨 chunk：把 "你好" 的字节从中间切开（切在第 19 个字节，落在"你"的多字节序列中间）
  const bytes = enc.encode('data: {"content":"你好"}\n\n')
  check('UTF-8 跨 chunk 不乱码', await collect([bytes.slice(0, 19), bytes.slice(19)]), ['{"content":"你好"}'])

  // 3) CRLF 行尾
  check('CRLF', await collect([enc.encode('data: x\r\n\r\n')]), ['x'])

  // 4) 一个事件内多行 data:
  check('多行 data 合并', await collect([enc.encode('data: a\ndata: b\n\n')]), ['a\nb'])

  // 5) 注释行 + 多个事件
  check('注释/多事件', await collect([enc.encode(': ping\ndata: 1\n\n\n\ndata: 2\n\n')]), ['1', '2'])

  // 6) 末尾无空行的最后一个事件（流结束前没有 \n\n）
  check('末尾无空行', await collect([enc.encode('data: tail')]), ['tail'])

  console.log(`\n${pass} 通过, ${fail} 失败`)
  process.exit(fail === 0 ? 0 : 1)
}

void main()
