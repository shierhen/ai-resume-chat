import { createApp } from 'vue'

// ------------------------------------------------------------------
// Element Plus 改为「按需引入」（阶段 4 优化）
//
// 以前这里是 `import ElementPlus from 'element-plus'` + 全量 CSS，
// 产物 CSS 375KB / JS 1154KB。现在由 vite.config.ts 里的
// unplugin-vue-components / unplugin-auto-import 负责：
//   模板里用到 <el-button> → 自动引入该组件的 JS 与样式
//   代码里用到 ElMessage  → 自动引入该函数与样式
// 所以这里**不再需要** use(ElementPlus)，也不再引全量 CSS。
//
// 唯一需要保留的是暗色变量文件：它提供 html.dark 下的整套 --el-* token
// （这个是全局 CSS 变量，不属于某个组件的样式，按需插件不会带进来）。
// ------------------------------------------------------------------
import 'element-plus/theme-chalk/dark/css-vars.css'
// 函数式组件（ElMessage / ElMessageBox）的样式。
// 注意：vite.config.ts 的 ElementPlusResolver 本身会自动注入这些样式（实测组合 C 生效）；
// 这里保留手动引入的原因见下方 vite.config.ts 的说明（当前 imports 已不再显式列出 element-plus）。
// 重复引入同一份 CSS 会被构建器去重，不会增加体积（实测组合 C 与 D 都是 86.78 KB）。
import 'element-plus/theme-chalk/el-message.css'
import 'element-plus/theme-chalk/el-message-box.css'
// 样式加载顺序很重要（后面的能覆盖前面的）：
// 1. 组件级 EP 样式（由插件按需注入） 2. EP 暗色变量 3. 我们的设计 token
// 4. 全局基础样式 5. EP 变量覆盖
import '@/styles/tokens.css'
import '@/styles/base.css'
import '@/styles/element-overrides.css'

import App from '@/App.vue'

createApp(App).mount('#app')
