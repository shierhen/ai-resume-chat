/** 时间格式化小工具（阶段 4 做消息时间戳/持久化时会继续用到） */
export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}
