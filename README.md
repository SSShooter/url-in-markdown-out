# URL to Markdown Converter

A Claude Code skill that converts web pages to local Markdown files with automatic image downloading.

## Features

- 🌐 Convert any web page to Markdown format
- 🖼️ Automatically download images locally with relative path references
- 🎯 Support custom CSS selectors to extract specific content
- 🚀 Playwright-based rendering, supports JavaScript-heavy pages
- 📝 Smart detection of article main content area

## Installation

Dependencies are automatically installed on first use, including:
- Playwright (with browsers)
- unified/rehype/remark conversion toolchain

## Usage

### Basic Usage

```bash
/save-url-as-md https://example.com/article
```

### Specify Content Selector

If the auto-detected content area is inaccurate, manually specify a CSS selector:

```bash
/save-url-as-md https://example.com/article --selector .article-content
```

### Natural Language

You can also tell Claude directly in natural language:

- "Save this link"
- "Download this article"
- "Convert this page to Markdown"
- "保存这个链接" (Chinese)
- "把这篇文章存下来" (Chinese)

## Output Structure

```
your-project/
├── article-title.md          # Converted Markdown file
└── images/                   # Images directory
    ├── image-1.png
    ├── image-2.jpg
    └── ...
```

## Tech Stack

- **Playwright**: Headless browser for rendering and scraping web pages
- **unified/rehype/remark**: HTML to Markdown conversion pipeline
- **hast-util-to-mdast**: AST transformation utilities

## Notes

- First run requires downloading Playwright browsers (takes 1-2 minutes)
- Pages requiring authentication cannot be scraped
- Generated Markdown is automatically formatted but original content is preserved

## Project Structure

```
url-in-markdown-out/
└── skills/
    └── save-url-as-md/
        ├── SKILL.md                    # Skill documentation
        └── scripts/
            ├── package.json            # Dependencies
            ├── package-lock.json
            └── save-url-as-md.mjs      # Conversion script
```

## License

MIT
