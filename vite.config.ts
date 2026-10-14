import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { defineConfig } from 'vite'

// Vite 配置：开发服务器 / 构建行为都从这里读。
export default defineConfig({
  plugins: [
    vue(),

    // ------------------------------------------------------------------
    // Element Plus 按需引入（阶段 4 优化）
    //
    // 优化前：main.ts 里 `import ElementPlus` + 全量 CSS
    //   → 产物 CSS 375KB / JS 1154KB，且"元素→样式"面板解析几千条规则很慢
    //     （这也是 DevTools 卡的成因之一）。
    // 优化后：模板里写到哪个组件，才引入哪个组件的 JS + CSS。
    // ------------------------------------------------------------------

    // 自动引入 ElMessage / ElMessageBox 这类"函数式 API"（连同它们的样式）。
    //
    // 【重要】这里**不要**再显式列 element-plus 的 imports！
    // 实测四种组合的产物差异：
    //   A 显式 imports + 无手动 CSS → 产物里没有 .el-message 样式（坏）
    //   B 显式 imports + 手动 CSS   → 靠手动救回
    //   C 只留 resolver + 无手动 CSS → resolver 自动注入样式 ✅
    //   D 只留 resolver + 手动 CSS   → 同样正常（CSS 去重，体积相同）
    //
    // 原因：一旦在 imports 里显式声明，unplugin-auto-import 会把它当普通具名导入
    // 直接解析掉，ElementPlusResolver 便不再介入 —— 而"注入样式"正是 resolver 的职责。
    // 所以只配 resolvers 就够了，显式 imports 反而会把样式搞丢。
    AutoImport({
      resolvers: [ElementPlusResolver()],
      dts: 'src/auto-imports.d.ts', // 生成类型声明，TS 才知道这些名字从哪来
    }),

    // 自动注册模板里用到的组件（<el-button>、<el-select> …）
    Components({
      resolvers: [ElementPlusResolver()],
      dts: 'src/components.d.ts',
    }),
  ],

  resolve: {
    alias: {
      // 让 import '@/components/AppHeader.vue' 指向 src 目录。
      // 注意：这里配了别名，tsconfig 里也必须配一份（见 tsconfig.app.json paths），
      // 否则 TS 编译期找不到模块，而运行期却是好的——这是新手最常见的一类"红波浪线"。
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  server: {
    port: 5173,
    host: true, // 监听 0.0.0.0，手机连同一个 Wi-Fi 时可以扫码/输 IP 真机调试
    proxy: {
      // 开发期：把 /api 开头的请求转发到本地 API 服务器（scripts/dev-api.ts，端口 8787）。
      // 为什么用代理而不是让前端直接跨域调 8787？
      //  1. 生产环境前端和 /api 是同域的，代码里写相对路径 /api/chat 才能在 Vercel 上直接生效；
      //  2. 代理让"浏览器视角"始终是同源请求，不触发 CORS，也就不需要额外跨域配置。
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
})
