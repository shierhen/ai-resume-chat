<script setup lang="ts">
/**
 * 根组件：只做三件事——布局、组装子组件、把数据/事件接起来。
 *
 * 这种"根组件保持薄"的做法能让后续阶段改动最小：
 * 阶段 2 换数据来源、阶段 3 加流式，都只动 composable，不动布局。
 */
import AppHeader from '@/components/AppHeader.vue'
import ChatInput from '@/components/ChatInput.vue'
import MessageList from '@/components/MessageList.vue'
import WelcomePanel from '@/components/WelcomePanel.vue'
import { useChat } from '@/composables/useChat'

const { messages, isReplying, suggestions, currentModel, sendMessage, retryMessage, stopStreaming } =
  useChat()
</script>

<template>
  <div class="app-shell">
    <AppHeader v-model:model="currentModel" />

    <main class="app-main">
      <!-- v-if / v-else 根据消息数量在这两个界面间切换 -->
      <WelcomePanel v-if="messages.length === 0" :suggestions="suggestions" @pick="sendMessage" />
      <MessageList v-else :messages="messages" :pending="isReplying" @retry="retryMessage" />
    </main>

    <ChatInput
      :disabled="isReplying"
      placeholder="问点什么，探索世界"
      @send="sendMessage"
      @stop="stopStreaming"
    />
  </div>
</template>

<style scoped>
/*
 * 三段式布局：头部固定高度 / 中间自适应并内部滚动 / 底部输入区。
 *
 * 用 grid 的 auto 1fr auto：
 *   auto —— 由内容决定高度
 *   1fr  —— 吃掉所有剩余空间（min-height:0 必须写，否则 1fr 会被内容顶开）
 * 这是"聊天界面骨架"最稳的写法，比 position: fixed 更省心。
 */
.app-shell {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  height: 100vh;
  /* dvh = dynamic viewport height：移动端地址栏收起/展开时高度跟着变，
     用 100vh 会出现"底部输入框被浏览器工具栏挡住"的经典问题 */
  height: 100dvh;
  overflow: hidden;
}

.app-main {
  min-height: 0; /* grid 子项默认 min-height:auto，会导致内部无法滚动 */
  overflow: hidden;
}
</style>
