<script setup lang="ts">
/**
 * 顶部栏：品牌标识 + 模型标签 + 主题切换 + 清空对话
 *
 * 这里演示了三件事：
 * 1. 子组件如何用 emit 把"用户意图"交给父组件（清空对话的实际逻辑在 App.vue/useChat）；
 * 2. 如何用 UI 库（Element Plus）的按钮/提示/气泡确认框；
 * 3. 如何消费 composable 暴露的状态。
 */
import { Delete, Moon, Sunny } from '@element-plus/icons-vue'

import { MODEL_OPTIONS } from '@/config/models'
import { useChat } from '@/composables/useChat'
import { useTheme } from '@/composables/useTheme'

// 注意：ElMessage / ElMessageBox 这里**故意不写 import**。
// 它们由 vite.config.ts 的 unplugin-auto-import 自动引入 —— 这样插件会同时
// 把这两个组件的样式一起注入。若手写 `import { ElMessage } from 'element-plus'`，
// 按需插件就不再插手，结果是"弹窗能弹出来但完全没样式"（按需引入的经典坑）。

const { isDark, toggleTheme } = useTheme()
const { messages, clearMessages } = useChat()

/**
 * 模型选择：用 defineModel 声明一个"双向绑定"的 prop。
 * 父组件写 <AppHeader v-model:model="currentModel" /> 即可，
 * 子组件这里像一个本地 ref 一样读写，Vue 自动同步回父组件 ——
 * 比传统的 props + emit('update:model') 少写一半样板代码（Vue 3.4+）。
 */
const model = defineModel<string>('model', { required: true })

async function handleClear(): Promise<void> {
  if (messages.value.length === 0) {
    ElMessage.info('当前还没有对话')
    return
  }
  try {
    await ElMessageBox.confirm('确定要清空当前对话吗？此操作不可撤销。', '清空对话', {
      confirmButtonText: '清空',
      cancelButtonText: '取消',
      type: 'warning',
    })
    clearMessages()
    ElMessage.success('已清空')
  } catch {
    // 用户点了取消：ElMessageBox 会 reject，这里静默处理即可
  }
}
</script>

<template>
  <header class="app-header">
    <div class="brand">
      <!-- 用内联 SVG 做 logo：可跟随 currentColor 变色，且不依赖图标字体 -->
      <span class="brand__mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18">
          <path
            fill="currentColor"
            d="M12 2a10 10 0 0 0-8.66 15L2 22l5.2-1.3A10 10 0 1 0 12 2Zm0 18a8 8 0 0 1-4.1-1.13l-.29-.17-3.05.76.78-2.96-.18-.3A8 8 0 1 1 12 20Z"
          />
          <circle cx="8.5" cy="12" r="1.15" fill="currentColor" />
          <circle cx="12" cy="12" r="1.15" fill="currentColor" />
          <circle cx="15.5" cy="12" r="1.15" fill="currentColor" />
        </svg>
      </span>
      <h1 class="brand__title">AI 问答</h1>

      <!-- 模型切换：窄屏隐藏（手机上空间不够，用默认模型即可） -->
      <el-select v-model="model" class="model-select" size="small" aria-label="选择模型">
        <el-option v-for="item in MODEL_OPTIONS" :key="item.id" :label="item.label" :value="item.id">
          <span class="model-option">
            <span class="model-option__label">{{ item.label }}</span>
            <span class="model-option__hint">{{ item.hint }}</span>
          </span>
        </el-option>
      </el-select>
    </div>

    <div class="actions">
      <el-tooltip :content="isDark ? '切换到日间模式' : '切换到夜间模式'" placement="bottom">
        <el-button
          class="action-btn"
          circle
          :aria-label="isDark ? '切换到日间模式' : '切换到夜间模式'"
          @click="toggleTheme"
        >
          <!-- 图标随状态切换：这也是"响应式"最直观的体现 -->
          <el-icon :size="18">
            <Sunny v-if="isDark" />
            <Moon v-else />
          </el-icon>
        </el-button>
      </el-tooltip>

      <el-tooltip content="清空对话" placement="bottom">
        <el-button class="action-btn" circle :disabled="messages.length === 0" aria-label="清空对话" @click="handleClear">
          <el-icon :size="18"><Delete /></el-icon>
        </el-button>
      </el-tooltip>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  height: var(--header-height);
  padding: 0 var(--space-4);
  /* 顶部安全区：iPhone 横屏/刘海屏下不贴着状态栏 */
  padding-top: env(safe-area-inset-top, 0px);
  border-bottom: 1px solid var(--border);
  background-color: var(--bg-app);
  /* 半透明毛玻璃：滚动时内容从下方穿过，很有"现代 App"质感 */
  background-color: color-mix(in srgb, var(--bg-app) 82%, transparent);
  backdrop-filter: saturate(180%) blur(12px);
  position: sticky;
  top: 0;
  z-index: 10;
}

.brand {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0; /* 允许内部文字省略号生效 */
}

.brand__mark {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: var(--radius-sm);
  color: var(--text-on-brand);
  background: linear-gradient(135deg, var(--brand), #8b5cf6);
}

.brand__title {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.2px;
  white-space: nowrap;
}

/* 模型选择器：融进头部，不抢视觉重心 */
.model-select {
  width: 168px;
  margin-left: var(--space-2);
}
.model-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}
.model-option__hint {
  font-size: 12px;
  color: var(--text-tertiary);
}

.actions {
  display: flex;
  gap: var(--space-2);
  flex-shrink: 0;
}

/* 覆盖 Element Plus 按钮的默认背景，让它融进我们的配色 */
.action-btn {
  background-color: transparent;
  border-color: transparent;
  color: var(--text-secondary);
  /* WCAG 2.2 要求点击目标 ≥ 24×24px；移动端做到 40px 更舒服 */
  min-width: 40px;
  min-height: 40px;
}
.action-btn:hover {
  background-color: var(--bg-hover);
  color: var(--text-primary);
}

/* 平板：模型选择器收窄 */
@media (max-width: 768px) {
  .model-select {
    width: 132px;
  }
  .model-option__hint {
    display: none; /* 下拉项在窄屏只留模型名 */
  }
}

/* 小屏：隐藏模型选择器，给标题和按钮留空间 */
@media (max-width: 480px) {
  .model-select {
    display: none;
  }
  .app-header {
    padding-left: var(--space-3);
    padding-right: var(--space-3);
  }
}
</style>
