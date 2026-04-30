---
name: save-url-as-md
description: >
  This skill should be used when the user gives a URL and asks to save it,
  convert it to Markdown, download a webpage/article as a local file,
  or says "保存这个链接", "把这篇文章存下来", "save this page as markdown".
user-invocable: true
argument-hint: <url> [--selector <css-selector>]
---

# Save URL as Markdown

将网页转换为本地 Markdown 文件，图片下载到本地用相对路径引用。

## 使用方式

```
/save-url-as-md <url>
/save-url-as-md <url> --selector .article-content
```

## 执行步骤

当用户给你一个 URL 时，按以下步骤操作：

### Step 1: 运行转换脚本

```bash
node .claude/skills/save-url-as-md/scripts/save-url-as-md.mjs "<url>" [--selector "<css-selector>"]
```

- 如果用户指定了 CSS 选择器，加上 `--selector` 参数
- 脚本会自动安装依赖（首次运行较慢）
- 脚本输出会告诉你生成的文件路径、使用的正文选择器、下载的图片数量

### Step 2: 读取生成的 Markdown 文件

用 Read 工具读取脚本输出的 `.md` 文件，检查内容质量。

### Step 3: 整理格式（重要）

审查 Markdown 文件，**只整理格式，绝不修改任何内容**。常见需要整理的问题：

- 标题层级混乱（如 h1 后直接 h3）→ 调整为合理的层级递进
- 多余空行（连续 3 个以上空行）→ 压缩为 1-2 个空行
- 列表格式不统一 → 统一使用 `-` 作为无序列表标记
- 代码块缺少语言标识 → 根据内容推测并补充
- 表格格式错乱 → 修复对齐
- 行内 HTML 残留（如 `<br>`, `<span>`）→ 转为 Markdown 等价写法
- 链接格式问题 → 确保 `[text](url)` 格式正确
- 图片引用路径 → 确保使用 `images/xxx` 相对路径

**绝对不能做的事：**
- 不能改写、删减、合并或重新组织任何文字内容
- 不能添加原文没有的信息
- 不能翻译任何内容
- 不能改变文章的语义或表达

### Step 4: 保存并报告

将整理后的 Markdown 用 Write 工具保存回原文件，然后向用户报告：
- 文件保存路径
- 图片下载数量和位置
- 内容概要（一句话）

## 注意事项

- 首次运行需要安装 Playwright 浏览器，可能需要 1-2 分钟
- 如果自动检测的正文选择器不对，告诉用户可以用 `--selector` 手动指定
- 如果页面需要登录才能访问，脚本会失败，需要告知用户
- 对于纯静态页面，脚本也能工作（Playwright 会渲染 JS）
