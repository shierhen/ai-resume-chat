<script setup lang="ts">
/**
 * Markdown 渲染组件
 *
 * 用 v-html 是必须的（Markdown 解析结果就是 HTML 字符串），
 * 但**绝不能把 AI 原文直接 v-html** —— 清洗在 utils/markdown.ts 里由 DOMPurify 完成。
 *
 * 组件本身很薄：计算属性转 HTML，样式挂在 :deep() 里（因为 v-html 内容是子节点，
 * scoped 样式默认作用不到）。
 */
import { computed } from 'vue'

import { renderMarkdown } from '@/utils/markdown'

const props = defineProps<{
  content: string
}>()

const html = computed(() => renderMarkdown(props.content))
</script>

<template>
  <div class="markdown" v-html="html" />
</template>

<style scoped>
.markdown {
  font-size: 15px;
  line-height: 1.75;
  overflow-wrap: anywhere;
}

/* 标题 */
.markdown :deep(h1),
.markdown :deep(h2),
.markdown :deep(h3),
.markdown :deep(h4) {
  margin: var(--space-4) 0 var(--space-2);
  font-weight: 600;
  line-height: 1.4;
}
.markdown :deep(h1) {
  font-size: 20px;
}
.markdown :deep(h2) {
  font-size: 18px;
}
.markdown :deep(h3) {
  font-size: 16px;
}
.markdown :deep(h1:first-child),
.markdown :deep(h2:first-child),
.markdown :deep(h3:first-child) {
  margin-top: 0;
}

/* 段落与列表 */
.markdown :deep(p) {
  margin: var(--space-2) 0;
}
.markdown :deep(ul),
.markdown :deep(ol) {
  margin: var(--space-2) 0;
  padding-left: 1.4em;
}
.markdown :deep(li) {
  margin: 2px 0;
}

/* 引用块 */
.markdown :deep(blockquote) {
  margin: var(--space-3) 0;
  padding: 2px 0 2px var(--space-3);
  border-left: 3px solid var(--border-strong);
  color: var(--text-secondary);
}

/* 行内代码 */
.markdown :deep(code) {
  font-family: var(--font-mono);
  font-size: 0.88em;
  padding: 2px 5px;
  border-radius: 5px;
  background-color: var(--bg-hover);
  color: var(--text-primary);
}

/* 代码块：容器自带圆角与底色，内部 pre 只负责滚动 */
.markdown :deep(.code-block) {
  position: relative;
  margin: var(--space-3) 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background-color: var(--bg-subtle);
  overflow: hidden;
}
.markdown :deep(.code-lang) {
  position: absolute;
  top: 6px;
  right: 10px;
  font-size: 11px;
  color: var(--text-tertiary);
  font-family: var(--font-mono);
  user-select: none;
}
.markdown :deep(.code-block pre) {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  overflow-x: auto; /* 长代码横向滚动，不撑破气泡 */
}
.markdown :deep(.code-block code) {
  padding: 0;
  background: transparent;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre;
}

/* 表格 */
.markdown :deep(table) {
  width: 100%;
  margin: var(--space-3) 0;
  border-collapse: collapse;
  font-size: 14px;
  display: block;
  overflow-x: auto;
}
.markdown :deep(th),
.markdown :deep(td) {
  padding: 6px 10px;
  border: 1px solid var(--border);
  text-align: left;
}
.markdown :deep(th) {
  background-color: var(--bg-subtle);
  font-weight: 600;
}

/* 链接与分割线 */
.markdown :deep(a) {
  color: var(--brand);
  text-decoration: none;
}
.markdown :deep(a:hover) {
  text-decoration: underline;
}
.markdown :deep(hr) {
  margin: var(--space-4) 0;
  border: none;
  border-top: 1px solid var(--border);
}
.markdown :deep(img) {
  max-width: 100%;
  border-radius: var(--radius-sm);
}

/* ---------------------------------------------------------------
   代码高亮配色：highlight.js 需要一套主题样式。
   这里不用它自带的主题文件（会和我们的暗色主题打架），
   改成用 CSS 变量手写一套最小配色，日/夜自动适配。
   --------------------------------------------------------------- */
.markdown :deep(.hljs-comment),
.markdown :deep(.hljs-quote) {
  color: var(--text-tertiary);
  font-style: italic;
}
.markdown :deep(.hljs-keyword),
.markdown :deep(.hljs-selector-tag),
.markdown :deep(.hljs-literal),
.markdown :deep(.hljs-section),
.markdown :deep(.hljs-link) {
  color: #c678dd;
}
.markdown :deep(.hljs-string),
.markdown :deep(.hljs-attr),
.markdown :deep(.hljs-addition) {
  color: #50a14f;
}
.markdown :deep(.hljs-number),
.markdown :deep(.hljs-symbol),
.markdown :deep(.hljs-bullet) {
  color: #d19a66;
}
.markdown :deep(.hljs-title),
.markdown :deep(.hljs-name),
.markdown :deep(.hljs-selector-id),
.markdown :deep(.hljs-selector-class) {
  color: #4078f2;
}
.markdown :deep(.hljs-built_in),
.markdown :deep(.hljs-type),
.markdown :deep(.hljs-variable),
.markdown :deep(.hljs-template-variable) {
  color: #e45649;
}
.markdown :deep(.hljs-meta),
.markdown :deep(.hljs-deletion) {
  color: var(--text-secondary);
}

/* 暗色下提高亮度，保证对比度（暗底上原色偏暗） */
:global(html.dark) .markdown :deep(.hljs-string),
:global(html.dark) .markdown :deep(.hljs-attr),
:global(html.dark) .markdown :deep(.hljs-addition) {
  color: #98c379;
}
:global(html.dark) .markdown :deep(.hljs-keyword),
:global(html.dark) .markdown :deep(.hljs-literal),
:global(html.dark) .markdown :deep(.hljs-section) {
  color: #c678dd;
}
:global(html.dark) .markdown :deep(.hljs-number),
:global(html.dark) .markdown :deep(.hljs-symbol) {
  color: #d19a66;
}
:global(html.dark) .markdown :deep(.hljs-title),
:global(html.dark) .markdown :deep(.hljs-name),
:global(html.dark) .markdown :deep(.hljs-selector-id) {
  color: #61afef;
}
:global(html.dark) .markdown :deep(.hljs-built_in),
:global(html.dark) .markdown :deep(.hljs-type),
:global(html.dark) .markdown :deep(.hljs-variable) {
  color: #e06c75;
}
</style>
