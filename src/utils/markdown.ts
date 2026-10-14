import DOMPurify from 'dompurify'
// ⚠️ 关键优化：不要 `import hljs from 'highlight.js'`（那会把 ~190 种语言全打进包里，
// 实测让产物从 992KB 暴涨到 1997KB）。改用 core + 按需注册常用语言。
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import scss from 'highlight.js/lib/languages/scss'
import shell from 'highlight.js/lib/languages/shell'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import { Marked } from 'marked'

// 注册"聊天里最可能出现"的语言；没注册的语言会自动降级为纯文本
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('shell', shell)
hljs.registerLanguage('css', css)
hljs.registerLanguage('scss', scss)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('vue', xml) // Vue SFC 用 HTML 语法高亮已足够
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('md', markdown)
hljs.registerLanguage('python', python)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('yaml', yaml)

/**
 * Markdown 渲染 + 代码高亮
 *
 * 【安全是这里的第一原则】
 * AI 的输出是不可信内容（它可能复述用户输入、或被提示注入诱导输出 <script>）。
 * marked 默认会把 HTML 原样透传，直接 v-html 就等于自己给自己开了 XSS 后门。
 * 所以流程必须是：marked 解析 → DOMPurify 清洗 → 才允许进 v-html。
 *
 * 【性能】
 * marked / hljs 都不小。这里做成按需加载（组件里 defineAsyncComponent），
 * 首屏不为它们付出体积代价。
 */

/** 用独立实例，避免污染全局 marked 配置 */
const marked = new Marked({
  gfm: true, // 支持表格、删除线、任务列表
  breaks: true, // 单个换行也当成换行——聊天场景更符合直觉
})

/** 高亮：把代码块交给 highlight.js；识别不了的语言静默降级为纯文本 */
function highlightCode(code: string, lang: string): string {
  try {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
    }
    return hljs.highlightAuto(code).value
  } catch {
    // 高亮失败不能影响内容展示：转义后原样输出
    return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }
}

// 自定义代码块渲染：加上语言标签与 hljs 的 class，交给 highlight.js 的样式表着色
marked.use({
  renderer: {
    code({ text, lang }) {
      const language = (lang || '').split(/\s+/)[0] ?? ''
      const highlighted = highlightCode(text, language)
      const label = language ? `<span class="code-lang">${language}</span>` : ''
      return `<div class="code-block">${label}<pre><code class="hljs language-${language}">${highlighted}</code></pre></div>`
    },
  },
})

/** DOMPurify 白名单：只放行 Markdown 可能产生的标签，其余一律丢弃 */
const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'hr', 'strong', 'em', 'del', 'blockquote',
    'ul', 'ol', 'li', 'code', 'pre', 'span', 'div',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'a', 'img',
  ],
  ALLOWED_ATTR: ['href', 'title', 'alt', 'src', 'class', 'target', 'rel'],
  // 禁止 data: / javascript: 之类的协议，只允许常规链接与图片
  ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i,
}

/**
 * 把 Markdown 文本转成"可安全 v-html"的 HTML 字符串。
 * 顺序不能反：先解析再清洗（清洗放在解析前会被 marked 重新引入标签）。
 */
export function renderMarkdown(source: string): string {
  if (!source) return ''
  const html = marked.parse(source, { async: false }) as string
  return DOMPurify.sanitize(html, PURIFY_CONFIG)
}
