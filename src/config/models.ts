/**
 * 可选模型清单
 *
 * 为什么放在前端常量里、而不是让用户随便填？
 * - 服务端会按白名单校验，防止前端被篡改后拿任意模型名去打上游（省钱 + 防滥用）；
 * - 前端只负责"展示与选择"，真正的把关在 api/chat.ts。
 *
 * ⚠️ 实测经验（同一网关）：
 * - `deepseek-v4-flash`：会先输出思考链、再给正式答案（本项目默认）。
 * - `sensenova-6.8-flash-lite`：会把预算全烧在思考链上，**始终不产出正式答案**；
 *   除非你就想看"思考过程"的流式效果，否则别选它。
 * - 若你的端点换成 DeepSeek 官方：`deepseek-chat`（直接答）/ `deepseek-reasoner`（先思考后答）。
 */

export interface ModelOption {
  /** 传给服务端的模型名（必须与 api/chat.ts 的白名单一致） */
  id: string
  /** 界面上显示的名字 */
  label: string
  /** 一句话说明，帮用户选 */
  hint: string
}

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: 'deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    hint: '先思考后回答，速度快，默认推荐',
  },
  {
    id: 'sensenova-6.8-flash-lite',
    label: 'SenseNova Flash Lite',
    hint: '只输出思考链，通常不给最终答案（用于演示推理过程）',
  },
  {
    id: 'glm-5.2',
    label: 'GLM-5.2',
    hint: '面向长程 Coding 与复杂工程任务，支持 1M 上下文及思考/非思考模式',
  },
  {
    id: 'kimi-k3',
    label: 'Kimi K3',
    hint: '旗舰开源原生多模态 Agent 模型，拥有 2.8T 参数',
  },
]

/** 默认模型：与服务端 process.env.DEEPSEEK_MODEL 的兜底值保持一致 */
export const DEFAULT_MODEL = MODEL_OPTIONS[0]!.id

/** 判断某个模型名是否在可选清单里 */
export function isKnownModel(id: string): boolean {
  return MODEL_OPTIONS.some((m) => m.id === id)
}
