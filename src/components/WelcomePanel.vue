<script setup lang="ts">
/**
 * 空状态欢迎页：没有消息时展示，点击推荐问题直接发起对话。
 *
 * props / emits 是 Vue 组件通信的两条主干：
 *   props  父 → 子（数据）
 *   emits  子 → 父（事件）
 * 这里两个都用了：接收 suggestions 数据，抛出 pick 事件。
 */
import type { ChatSuggestion } from '@/types/chat'

defineProps<{
  suggestions: ChatSuggestion[]
}>()

const emit = defineEmits<{
  // 具名元组写法：事件名 pick，参数是 string
  pick: [prompt: string]
}>()
</script>

<template>
  <section class="welcome">
    <div class="welcome__inner">
      <h2 class="welcome__title">
        你好，我是你的
        <span class="welcome__accent">AI 助手</span>
      </h2>
      <p class="welcome__subtitle">基于 Vue 3 + DeepSeek API 构建 · 支持流式输出与多轮对话</p>

      <div class="cards">
        <button
          v-for="item in suggestions"
          :key="item.title"
          class="card"
          type="button"
          @click="emit('pick', item.prompt)"
        >
          <span class="card__title">{{ item.title }}</span>
          <span class="card__desc">{{ item.prompt }}</span>
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.welcome {
  height: 100%;
  overflow-y: auto;
  display: grid;
  place-items: center;
  padding: var(--space-5) var(--space-4);
}

.welcome__inner {
  width: 100%;
  max-width: var(--content-max);
  text-align: center;
}

.welcome__title {
  font-size: clamp(22px, 5vw, 30px); /* clamp：字号随视口自适应，且不会过大过小 */
  font-weight: 700;
  line-height: 1.35;
  /* 中文标题的"避头尾"处理，避免最后一个字被挤到下一行 */
  text-wrap: balance;
}

.welcome__accent {
  background: linear-gradient(120deg, var(--brand), #8b5cf6);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.welcome__subtitle {
  margin-top: var(--space-2);
  color: var(--text-secondary);
  font-size: 14px;
}

.cards {
  margin-top: var(--space-6);
  display: grid;
  /* auto-fit + minmax：一行能放几张卡由宽度决定，不用写任何媒体查询 —— 响应式布局利器 */
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-3);
  text-align: left;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background-color: var(--bg-subtle);
  cursor: pointer;
  transition:
    transform var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out),
    background-color var(--dur-fast) var(--ease-out);
}

.card:hover {
  transform: translateY(-2px);
  border-color: var(--brand);
  background-color: var(--bg-app);
}

.card:active {
  transform: translateY(0) scale(0.99);
}

.card__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.card__desc {
  font-size: 13px;
  color: var(--text-secondary);
  /* 最多显示两行，超出省略：卡片高度才整齐 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 移动端：卡片改为单列铺满，触摸区域更大 */
@media (max-width: 640px) {
  .cards {
    grid-template-columns: 1fr;
    margin-top: var(--space-5);
  }
  .card {
    /* iOS HIG 建议可点区域 ≥ 44pt */
    min-height: 64px;
  }
}
</style>
