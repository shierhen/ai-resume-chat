# AI 问答应用（Vue 3 + DeepSeek API）

一个流式 AI 问答 Web 应用：Vue 3 + TypeScript + Vite 前端，Vercel Serverless Function 做后端代理，SSE 流式输出，支持日间/夜间主题与移动端适配。

> **当前进度：阶段 1-5 全部完成**（已上线，`/api/chat` 流式链路线上实测通过）。

## 技术栈

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 框架 | Vue 3.5（`<script setup>` + 组合式 API） | 组合式函数按功能组织逻辑 |
| 语言 | TypeScript（strict） | 前后端共享类型定义 |
| 构建 | Vite 8 | 秒级冷启动、HMR |
| UI 库 | Element Plus 2.x | **按需引入**（unplugin-vue-components） |
| 样式 | 原生 CSS + CSS 变量 | 零额外依赖，主题切换靠变量重绑定 |
| Markdown | marked + highlight.js（core 按需）+ DOMPurify | 渲染 + 高亮 + XSS 清洗 |
| 后端 | Vercel Serverless Function（Node 运行时） | 保管 API Key、翻译 SSE、流式转发 |
| 部署 | Vercel | 推 GitHub 自动部署，支持 Preview 环境 |

## 目录结构

```
ai-resume-chat/
├─ api/
│  ├─ chat.ts               # Serverless Function：/api/chat（密钥保管 + SSE 翻译 + 取消联动）
│  └─ _sse.ts               # 服务器专用 SSE 工具（被 chat.ts 以 './_sse.js' 引入，见下方说明）
├─ scripts/
│  ├─ dev-api.ts            # 本地 API 适配层（模拟 vercel dev，支持流式回写）
│  ├─ test-sse.ts           # SSE 解析器单元测试（node scripts/test-sse.ts，6 用例）
│  ├─ mock-deepseek.mjs     # 模拟上游（无密钥也能跑通链路）
│  └─ verify-prod.mjs       # 线上验收脚本（首页/资源/密钥泄漏/接口）
├─ public/favicon.svg       # 站点图标
├─ src/
│  ├─ components/           # 展示型组件：头部、消息列表、气泡、输入区、欢迎页、Markdown 渲染
│  ├─ composables/          # 组合式函数：useTheme（主题）、useChat（会话 + 流式消费）
│  ├─ config/models.ts      # 可选模型清单（与服务端白名单对应）
│  ├─ styles/               # tokens.css（设计变量）、base.css、element-overrides.css
│  ├─ types/chat.ts         # 全局类型定义 + 前后端事件契约
│  ├─ utils/
│  │  ├─ sse.ts             # ★ 前端 SSE 解析/封装（与 api/_sse.ts 逻辑一致，见下方说明）
│  │  ├─ storage.ts         # localStorage 持久化（带版本号 + 容错 + 状态修正）
│  │  ├─ markdown.ts        # marked + highlight.js + DOMPurify 安全渲染
│  │  └─ format.ts          # 时间等小工具
│  ├─ App.vue               # 根组件：布局 + 组装
│  └─ main.ts               # 应用入口
├─ index.html               # HTML 模板（含防主题闪烁同步脚本）
├─ vite.config.ts           # Vite 配置（插件 + @ 别名 + 按需引入 + /api 开发代理）
└─ tsconfig.*.json          # TS 配置（app / node 分治）
```

> ⚠️ **关于 SSE 工具的两份代码（重要设计约束）**
> `src/utils/sse.ts`（前端）与 `api/_sse.ts`（服务端）是**有意重复**的两份实现。
> 原因：Vercel 部署函数时，**函数的运行文件系统里只有 `api/` 目录**，项目里的 `src/` 不会一起带进去；
> 而 ESM `import` 是**运行时解析**的，所以函数不能引用 `api/` 之外的任何文件（否则线上报
> `ERR_MODULE_NOT_FOUND`）。
> **修改 SSE 解析逻辑时，两个文件都要改。**

## 本地启动

需要三个终端（或一个终端三个进程）：

```bash
# 1. 安装依赖（Node 20+；项目用 npm，含 .npmrc 把缓存放进项目内）
npm install

# 2a. 本地 API 服务（加载 .env.local 里的密钥；监听 8787）
npm run dev:api

# 2b. 【可选】没有密钥也能先跑通：起一个扮演 DeepSeek 的 mock 上游（8788）
npm run mock:api
# 然后换种方式起 API：DEEPSEEK_BASE_URL=http://localhost:8788 npm run dev:api

# 3. 前端开发服务器（/api 请求会被 Vite 代理到 8787）
npm run dev
# → http://localhost:5173

# 4. 类型检查 + 生产构建
npm run typecheck
npm run build
npm run preview
```

### 官方替代方案

```bash
npm i -g vercel
vercel dev   # 启动后 API 在 http://localhost:3000，功能等价于上面的 dev:api
```

> `scripts/dev-api.ts` 本质上是 `vercel dev` 的"自制最小版"：Serverless 函数就是
> "收到标准 Request → 返回标准 Response"的普通函数，本地适配层负责把它接到 HTTP 上。

## 环境变量

把 DeepSeek 的密钥写进 `.env.local`（已被 `.gitignore` 忽略）：

```bash
cp .env.example .env.local
# 编辑 .env.local，填入 DEEPSEEK_API_KEY=sk-xxxx
```

| 变量 | 作用 | 必须 |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | 上游密钥，只在 `api/` 服务端读取 | 是 |
| `DEEPSEEK_BASE_URL` | 自定义上游地址（网关或 mock 联调时用） | 否，默认 `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | 模型名 | 否，默认 `deepseek-v4-flash` |

> **模型怎么选（实测经验）**：推理型模型会先输出一长段思考链再给答案。
> 本项目实测 `sensenova-6.8-flash-lite` 在 `max_tokens` 预算内**只输出思考链、不产出最终答案**
> （`finish_reason: length`，content 为 0），而 `deepseek-v4-flash` 会正常先思考、后给答案。
> 若你换成 DeepSeek 官方端点，用 `DEEPSEEK_MODEL=deepseek-chat`（非推理）或 `deepseek-reasoner`（推理）。

> 安全边界：`DEEPSEEK_API_KEY` **不带** `VITE_` 前缀，因此 Vite 不会把它注入前端产物；
> 它只在服务端通过 `process.env` 读取，浏览器永远拿不到。
> 部署时在 Vercel 项目设置里配置同名环境变量即可（阶段 5 会详细讲）。

## 主题切换机制

1. 颜色全部定义在 `src/styles/tokens.css` 的 CSS 变量里，:`root` 一套（亮色），`html.dark` 一套（暗色）；
2. 切换主题 = 在 `<html>` 上增删 `dark` 类名，所有变量随之重绑定，组件代码零改动；
3. `src/composables/useTheme.ts` 把状态存进 `localStorage`（键 `ai-chat:theme`），刷新后保留；
4. `index.html` 里有一段**同步**内联脚本，在首屏渲染前就把类名挂上，避免"白闪"；
5. Element Plus 的暗色变量同样挂在 `html.dark` 上，与自定义组件共用一个开关。

## 架构

```
浏览器（Vue 3 前端，开发期 5173）
   │  fetch('/api/chat')  → 读 response.body 流（ReadableStream）
   │  ← 开发期经 Vite proxy 转发到 8787；生产环境同域直连（无 CORS）
   ▼
Serverless Function（api/chat.ts，本地 8787 / 线上 Vercel）
   │  读 process.env.DEEPSEEK_API_KEY（前端不可见）
   │  fetch(上游 /chat/completions, { stream: true })   ← 上游 SSE 流
   │  用 ./_sse.js 解析 → 翻译成自己的极简事件流 → 边收边转发
   ▼
上游模型 API
```

### 流式事件契约（我们自己的协议）

```
data: {"type":"reasoning","content":"思考链增量…"}   ← 推理模型才有
data: {"type":"content","content":"正式回答增量"}     ← 逐字显示的内容
data: {"type":"done"}                                ← 结束（前端据此收尾）
data: {"type":"error","error":"上游响应中断"}         ← 流中途出错
```

- 前端**不解析**上游的 `choices[].delta` 结构，只认上面四种事件；换厂商只改 `api/chat.ts`。
- 停止生成 = 前端 `AbortController.abort()` + 服务端 `request.signal` / 流 `cancel()` 联动中止上游，
  避免为用户已放弃的请求继续消耗 token。

## 阶段 4 功能说明

### 多轮上下文
每次请求携带完整历史（`buildApiMessages()`），并做三层裁剪防止上下文无限增长：
丢掉出错消息 → 丢掉空内容消息 → 只取最近 20 条。

### 本地持久化
- 消息存 `localStorage`（键 `ai-chat:messages:v1`，带版本号便于将来迁移）；
- **写入节流 400ms**：流式期间内容高频变化，不节流会导致每个 token 都写一次盘；
- **恢复时修正状态**：刷新时正在生成的消息（`streaming`）会落成 `done`，避免卡在转圈；
- 清空对话时同步清掉持久化数据。

### Markdown 渲染与安全
链路是 **marked 解析 → DOMPurify 清洗 → 才允许 `v-html`**。
AI 输出属于不可信内容（可被提示注入诱导输出 `<script>`），
所以 `PURIFY_CONFIG` 用白名单只放行 Markdown 可能产生的标签，并限制链接协议为 `http(s)`/`mailto`。

### 错误重试
出错消息常显"重试"按钮：会砍掉该条（及其后内容），用**当时的真实历史**重新请求。

### 按需引入（性能优化，实测数据）
| 指标 | 优化前 | 优化后 |
| --- | --- | --- |
| JS | 1154 KB | **433 KB**（-62%） |
| CSS | 380 KB | **65.6 KB**（-83%） |
| gzip JS | 369 KB | **147 KB** |

两点关键经验：
1. `highlight.js` **绝不能整包引入**（`import hljs from 'highlight.js'` 会把约 190 种语言全打进来，
   实测让产物从 992KB 涨到 1997KB），要用 `highlight.js/lib/core` + 按需注册语言；
2. `ElMessage` / `ElMessageBox` 这类函数式 API **不要手写 import**——手写后按需插件不再接管，
   会出现"弹窗能弹但完全没样式"。交给 `unplugin-auto-import` 自动引入。

## 部署（Vercel）

### 部署步骤

1. 把仓库推到 GitHub
2. https://vercel.com/new 导入该仓库（框架自动识别为 Vite，**无需 `vercel.json`**）
3. 在 **Environment Variables** 配置 3 个变量，**Production / Preview / Development 三个环境都要勾**
   （只勾 Production 会导致预览环境拿不到密钥而返回 500）
4. 点 Deploy

### 自动部署机制

| 触发 | 结果 |
| --- | --- |
| 推送到 `main` | 自动构建 → 部署到 **Production**（固定域名） |
| 推送到其它分支 / 开 PR | 自动生成 **Preview** 部署（独立随机域名），用于验收改动 |
| 只改 README 等文档 | **同样会触发重新构建**——Vercel 看的是"有没有新提交"，不是"改了什么" |
| 回滚 | Deployments → 选历史部署 → `Promote to Production` |

> 如果希望"纯文档改动不触发部署"，可在 Settings → Git → Ignored Build Step 配置
> `git diff --quiet HEAD^ HEAD -- . ':(exclude)*.md'`（本项目暂未启用）。

### 🔐 线上安全边界（已实测验证）

`DEEPSEEK_API_KEY` 不带 `VITE_` 前缀，Vite 不会把它注入前端产物。
线上实测：抓取部署后的 JS 产物（423KB）搜索 `sk-` 与 `DEEPSEEK_API_KEY`，**均无匹配**。

### 线上验收脚本

```bash
# 先把 scripts/verify-prod.mjs 里的 BASE 改成你的部署域名，然后：
node scripts/verify-prod.mjs
```

覆盖 4 组共 10 项：首页可访问性、静态资源、**密钥泄漏检查**、接口健康（含真实流式请求与首字节延迟）。

## 踩坑记录（真实故障 + 根因）

### 1. 线上 `FUNCTION_INVOCATION_FAILED`：函数不能引用 `api/` 之外的文件

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/var/task/src/utils/sse.ts'
    imported from /var/task/api/chat.js
```

**根因**：Vercel 部署函数时，只把 `api/` 目录放进函数的运行文件系统（`/var/task/api/…`），
`src/` 不会一起带进去；而 ESM `import` 是**运行时解析**的，于是找不到模块。
本地能跑，是因为本地有完整项目目录（且 Node 24 原生支持直接运行 `.ts`）。

**解法**（本项目采用）：在 `api/` 内放置自包含副本，并**把 import 扩展名写成 `.js`**：

```ts
import { consumeSse, encodeSseJson } from './_sse.js'   // ← 写 .js，不是 .ts
```

因为 Vercel 会把 `api/_sse.ts` 转译成 `api/_sse.js` 放在同目录，运行时即可解析到。

### 2. 推理模型的增量字段不是 `content`

思考链增量在某些厂商是 `delta.reasoning`，某些是 `delta.reasoning_content`。
只解析 `delta.content` 会导致**整段输出丢失、界面空白**（实测踩过）。
代码用 `delta.reasoning ?? delta.reasoning_content` 双字段兜底。

### 3. 流的 `cancel()` 里不能取消已锁定的流

客户端断开时若执行 `upstreamBody.cancel()`，会抛 `ERR_INVALID_STATE: ReadableStream is locked`
（该流已被 `consumeSse` 的 reader 锁定）；异常发生在取消回调里会变成未捕获拒绝，**直接把 Node 进程带崩**。
正确做法：`upstreamController.abort()`，让进行中的 `read()` 以 `AbortError` 结束，由 `finally` 释放锁。

## 开发阶段

- [x] 阶段 1：项目初始化 + 静态聊天界面 + 主题切换 + 响应式基础
- [x] 阶段 2：Vercel Serverless 代理 + DeepSeek 非流式调用（fetch 实现）
- [x] 阶段 3：SSE 流式输出（逐字显示 + 停止生成 + 思考链兼容）
- [x] 阶段 4：多轮上下文 + localStorage 持久化 + Markdown 渲染 + 错误重试 + 模型切换 + 按需引入优化
- [x] 阶段 5：部署到 Vercel + 线上验收 + README 完善

## License

MIT
