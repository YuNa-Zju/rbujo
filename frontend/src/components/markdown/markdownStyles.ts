// src/components/markdown/markdownStyles.ts

export const CUSTOM_MARKDOWN_STYLES = `
  @import url('https://npm.elemecdn.com/lxgw-wenkai-screen-webfont/style.css');
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');

  .prose-custom-scale {
    font-family: 'LXGW WenKai Screen', 'LXGW WenKai', sans-serif !important;
    width: 100%;
  }
  .prose-custom-scale .katex,
  .prose-custom-scale .katex * {
    font-family: KaTeX_Main, 'Times New Roman', serif !important;
  }
  .prose-custom-scale * {
    user-select: text !important;
    -webkit-user-select: text !important;
  }
  .prose-custom-scale ::selection {
    background-color: var(--theme-bg) !important;
    color: var(--theme-text) !important;
  }

  .prose-custom-scale > *:last-child {
    margin-bottom: 0 !important;
  }

  /* 加粗字体样式 */
  .prose-custom-scale strong,
  .prose-custom-scale b {
    color: var(--theme-text) !important;
    font-weight: 900 !important;
    background: linear-gradient(to bottom, transparent 60%, var(--theme-bg) 0%) !important;
    padding: 0 2px !important;
    border-radius: 2px !important;
  }

  /* 复选框样式 */
  .prose-custom-scale input[type="checkbox"] {
    appearance: none !important;
    -webkit-appearance: none !important;
    width: 1.25em !important;
    height: 1.25em !important;
    border: 1.5px solid var(--theme-border) !important;
    border-radius: 5px !important;
    background-color: transparent !important;
    margin-right: 0.6em !important;
    transform: translateY(0.2em) !important;
    cursor: pointer !important;
    opacity: 0.7 !important;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
    background-position: center !important;
    background-repeat: no-repeat !important;
    background-image: url("data:image/svg+xml,%3csvg viewBox='0 0 16 16' fill='white' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z'/%3e%3c/svg%3e") !important;
    background-size: 0 !important;
  }
  .prose-custom-scale input[type="checkbox"]:checked {
    background-color: var(--theme-text) !important;
    border-color: var(--theme-text) !important;
    opacity: 1 !important;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08) !important;
    background-size: 100% !important;
  }
  .prose-custom-scale input[type="checkbox"]::before {
    content: none !important;
    display: none !important;
  }
  .prose-custom-scale input[type="checkbox"]:disabled {
    cursor: not-allowed !important;
    opacity: 0.5 !important;
    filter: grayscale(100%) !important;
    border-color: #9ca3af !important;
  }

  /* 标题系统 */
  .prose-custom-scale h1 {
    font-size: 2.2em !important;
    font-weight: 900 !important;
    text-align: center !important;
    margin-bottom: 1.5em !important;
    margin-top: 0.5em !important;
    line-height: 1.3 !important;
    color: var(--theme-text) !important;
    position: relative !important;
    letter-spacing: -0.02em !important;
  }
  .prose-custom-scale h1::after {
    content: '' !important;
    position: absolute !important;
    bottom: -0.6em !important;
    left: 50% !important;
    transform: translateX(-50%) !important;
    width: 60px !important;
    height: 4px !important;
    background-color: var(--theme-border) !important;
    opacity: 0.4 !important;
    border-radius: 2px !important;
  }
  .prose-custom-scale h2 {
    font-size: 1.6em !important;
    font-weight: 800 !important;
    margin-top: 2em !important;
    margin-bottom: 1em !important;
    line-height: 1.4 !important;
    padding-left: 0.6em !important;
    border-left: 5px solid var(--theme-border) !important;
    color: var(--fallback-bc) !important;
    background: linear-gradient(to right, var(--theme-bg), transparent) !important;
    border-radius: 0 4px 4px 0 !important;
    padding-top: 0.2em !important;
    padding-bottom: 0.2em !important;
  }
  .prose-custom-scale h3 {
    font-size: 1.35em !important;
    font-weight: 700 !important;
    margin-top: 1.5em !important;
    margin-bottom: 0.8em !important;
    color: var(--theme-text) !important;
    display: inline-block !important;
    border-bottom: 2px dashed var(--theme-border) !important;
    padding-bottom: 4px !important;
    opacity: 0.9 !important;
  }
  .prose-custom-scale h4, .prose-custom-scale h5, .prose-custom-scale h6 {
    font-size: 1.15em !important;
    font-weight: 700 !important;
    margin-top: 1.2em !important;
    margin-bottom: 0.5em !important;
    color: var(--fallback-bc) !important;
    opacity: 0.7 !important;
  }

  /* 正文与列表 */
  .prose-custom-scale p {
    font-size: 1.15rem !important;
    line-height: 2.3 !important;
    margin-bottom: 1.5rem !important;
    font-weight: 400;
    color: var(--fallback-bc) !important;
    text-align: justify !important;
    position: relative !important;
    z-index: 1 !important;
  }
  .prose-custom-scale ul, .prose-custom-scale ol {
    list-style-position: inside !important;
    padding-left: 0.5em !important;
    margin-bottom: 1.5em !important;
  }
  .prose-custom-scale ul { list-style-type: disc !important; }
  .prose-custom-scale ol { list-style-type: decimal !important; }
  .prose-custom-scale li {
    margin-bottom: 0.6em !important;
    line-height: 2 !important;
    color: var(--fallback-bc) !important;
  }
  .prose-custom-scale li::marker {
    color: var(--theme-text) !important;
    font-weight: bold !important;
  }
  .prose-custom-scale ul.contains-task-list {
    list-style: none !important;
    padding-left: 0 !important;
  }
  .prose-custom-scale li.task-list-item {
    display: flex !important;
    align-items: flex-start !important;
    gap: 0.2em !important;
    list-style: none !important;
  }
  .prose-custom-scale li.task-list-item::marker {
    content: none !important;
  }

  /* 其他组件 */
  .prose-custom-scale blockquote {
    border-left: 4px solid var(--theme-border) !important;
    background-color: var(--theme-bg) !important;
    padding: 1em 1.5em !important;
    font-style: italic !important;
    font-family: 'LXGW WenKai', serif !important;
    margin: 2em 0 !important;
    border-radius: 0 12px 12px 0 !important;
    color: var(--fallback-bc) !important;
    position: relative !important;
  }

  .prose-custom-scale code:not(pre code) {
    background-color: color-mix(in srgb, var(--theme-text) 12%, transparent) !important;
    color: var(--theme-text) !important;
    padding: 0.15em 0.4em !important;
    border-radius: 0.4em !important;
    font-size: 0.85em !important;
    font-weight: 500 !important;
    font-family: 'JetBrains Mono', monospace !important;
    border: none !important;
    box-shadow: none !important;
    vertical-align: baseline;
  }

  .prose-custom-scale a {
    color: var(--theme-text) !important;
    text-decoration: underline !important;
    text-decoration-thickness: 2px !important;
    text-underline-offset: 4px !important;
    text-decoration-color: var(--theme-bg) !important;
    transition: all 0.2s !important;
  }
  .prose-custom-scale a:hover {
    text-decoration-color: var(--theme-text) !important;
    background-color: var(--theme-bg) !important;
  }
  .prose-custom-scale hr {
    border: 0 !important;
    height: 2px !important;
    background: linear-gradient(to right, transparent, var(--theme-border), transparent) !important;
    opacity: 0.3 !important;
    margin: 3em 0 !important;
  }
`;
