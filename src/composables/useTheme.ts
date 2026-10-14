import { computed, readonly, ref, watch } from 'vue'

import type { ThemeMode } from '@/types/chat'

/**
 * 主题管理（组合式函数 / Composable）
 *
 * 【核心设计：模块级单例】
 * 这个文件里的 theme 定义在函数**外面**，所以整个应用只有一份。
 * 任何组件调用 useTheme() 拿到的都是同一个 ref —— 改一处，全站同步。
 * 对比另一种写法（把 ref 写在 useTheme 内部）：那样每个组件各有一份状态，
 * 主题切换就会出现"头部变了、输入框没变"。这是新手最常见的坑之一。
 *
 * 【为什么用 <html> 上的 class 而不是给每个组件传 props】
 * 主题是"全局环境"，不是"父子数据"。用 CSS 变量 + 根节点 class，
 * 任何深度的组件都能自动响应，不需要层层透传。
 */

const STORAGE_KEY = 'ai-chat:theme'

/** localStorage 在隐私模式/被禁用时会抛异常，所以统一包一层 */
function readStored(): ThemeMode | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'dark' || value === 'light' ? value : null
  } catch {
    return null
  }
}

function writeStored(mode: ThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    /* 存不了就算了，不影响当前会话使用 */
  }
}

/** 系统级偏好：macOS/Windows 的"深色模式"设置 */
const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)')

/**
 * 初始值优先级：用户上次手动选择 > 系统偏好。
 * index.html 里的同步脚本已经算过一遍了（为了防白闪），这里再算一次是为了
 * 让 Vue 的状态与 DOM 真实状态一致（也兜住 localStorage 不可用的场景）。
 */
const theme = ref<ThemeMode>(readStored() ?? (systemPrefersDark.matches ? 'dark' : 'light'))

/** 把主题"写"到 DOM 上：这是唯一真正改变外观的动作 */
function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement
  root.classList.toggle('dark', mode === 'dark')
  root.dataset.theme = mode
}

applyTheme(theme.value)

// 状态变化 → 更新 DOM + 写入 localStorage。
// 这种"数据变了自动做副作用"就是 Vue 的 watch。
watch(theme, (mode) => {
  applyTheme(mode)
  writeStored(mode)
})

// 用户从未手动选过时，才跟随系统变化（用户一旦选过，就以他的选择为准）
systemPrefersDark.addEventListener('change', (event) => {
  if (readStored() === null) {
    theme.value = event.matches ? 'dark' : 'light'
  }
})

/** 供组件使用的主题接口 */
export function useTheme() {
  const isDark = computed(() => theme.value === 'dark')

  function toggleTheme(): void {
    theme.value = isDark.value ? 'light' : 'dark'
  }

  function setTheme(mode: ThemeMode): void {
    theme.value = mode
  }

  return {
    // readonly 只读暴露：组件不能直接 theme.value = xxx，必须走 setTheme/toggleTheme。
    // 这是把"状态修改权"收口的好习惯，项目变大后能省很多 debug 时间。
    theme: readonly(theme),
    isDark,
    toggleTheme,
    setTheme,
  }
}
