/// <reference types="vite/client" />

// 让 TypeScript 认识 .vue 单文件组件（编辑器里 import App from './App.vue' 不再报错）
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}
