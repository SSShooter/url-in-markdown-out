#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

// ── Parse CLI args ──────────────────────────────────────────────────────────

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    selector: { type: "string", short: "s" },
    output: { type: "string", short: "o" },
  },
});

const url = positionals[0];
if (!url) {
  console.error("Usage: node save-url-as-md.mjs <url> [--selector <css>] [--output <dir>]");
  process.exit(1);
}

// ── Ensure dependencies ─────────────────────────────────────────────────────

const scriptDir = new URL(".", import.meta.url).pathname;
// Walk up to find project root (look for package.json)
function findProjectRoot(start) {
  let dir = start;
  while (dir !== "/") {
    if (existsSync(join(dir, "package.json"))) return dir;
    dir = resolve(dir, "..");
  }
  return start;
}
const projectRoot = findProjectRoot(resolve(scriptDir, "../.."));
const nodeModules = join(scriptDir, "node_modules");

if (!existsSync(nodeModules)) {
  console.log("⏳ Installing dependencies (first run)...");
  const { execSync } = await import("node:child_process");
  execSync("npm install", { cwd: scriptDir, stdio: "inherit" });
  console.log("✅ Dependencies installed.");
}

// ── Dynamic imports (after deps are ready) ──────────────────────────────────

const { chromium } = await import("playwright");
const { unified } = await import("unified");
const rehypeParse = (await import("rehype-parse")).default;
const rehypeRemark = (await import("rehype-remark")).default;
const remarkStringify = (await import("remark-stringify")).default;

// ── Helper: slugify URL for filename ────────────────────────────────────────

function slugify(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const slug = (u.hostname + u.pathname)
      .replace(/[^a-zA-Z0-9一-鿿]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120);
    return slug || "article";
  } catch {
    return "article";
  }
}

// ── Helper: resolve relative URL ────────────────────────────────────────────

function resolveUrl(src, baseUrl) {
  if (!src) return null;
  if (src.startsWith("data:")) return null;
  try {
    return new URL(src, baseUrl).href;
  } catch {
    return null;
  }
}

// ── Step 1: Load page with Playwright ───────────────────────────────────────

console.log(`🌐 Loading: ${url}`);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
});
const page = await context.newPage();

try {
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
} catch (err) {
  // networkidle may timeout on heavy pages, fall back to domcontentloaded
  console.warn("⚠️  networkidle timeout, falling back to domcontentloaded");
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3000); // give JS a moment to render
}

// ── Step 2: Detect content selector ────────────────────────────────────────

const AUTO_SELECTORS = [
  "article",
  ".article",
  ".article-content",
  ".post-content",
  ".entry-content",
  ".post-body",
  ".content-body",
  ".markdown-body",
  ".prose",
  '[itemprop="articleBody"]',
  "main",
  '[role="main"]',
  "#content",
  ".content",
];

let selector = values.selector;
let selectorLabel = "user-specified";

if (!selector) {
  for (const sel of AUTO_SELECTORS) {
    const el = await page.$(sel);
    if (el) {
      const box = await el.boundingBox();
      // Make sure it's a substantial element, not a tiny wrapper
      if (box && box.height > 200) {
        selector = sel;
        selectorLabel = "auto-detected";
        break;
      }
    }
  }
}

if (!selector) {
  selector = "body";
  selectorLabel = "fallback";
}

console.log(`🔍 Content selector: ${selector} (${selectorLabel})`);

// ── Step 3: Extract HTML ───────────────────────────────────────────────────

const contentHtml = await page.evaluate((sel) => {
  const el = document.querySelector(sel);
  return el ? el.innerHTML : "";
}, selector);

const pageTitle = await page.title();

await browser.close();

if (!contentHtml.trim()) {
  console.error("❌ No content found with selector:", selector);
  process.exit(1);
}

console.log(`📄 Extracted HTML: ${contentHtml.length} chars`);

// ── Step 4: Collect image URLs via custom rehype plugin ────────────────────

const imageMap = new Map(); // originalUrl → localFilename
let imageIndex = 0;

function rehypeCollectImages() {
  return (tree) => {
    function walk(node) {
      if (node.tagName === "img" && node.properties?.src) {
        const absUrl = resolveUrl(node.properties.src, url);
        if (absUrl && !imageMap.has(absUrl)) {
          imageIndex++;
          // guess extension
          const ext = guessExt(absUrl);
          imageMap.set(absUrl, `image-${imageIndex}${ext}`);
        }
        if (absUrl) {
          node.properties.src = `images/${imageMap.get(absUrl)}`;
        }
      }
      if (node.children) {
        for (const child of node.children) walk(child);
      }
    }
    walk(tree);
  };
}

function guessExt(imgUrl) {
  try {
    const pathname = new URL(imgUrl).pathname.toLowerCase();
    for (const ext of [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif", ".bmp"]) {
      if (pathname.includes(ext)) return ext;
    }
  } catch {}
  return ".jpg";
}

// ── Step 5: Convert HTML → Markdown ────────────────────────────────────────

const wrappedHtml = `<div>${contentHtml}</div>`;

const mdast = await unified()
  .use(rehypeParse, { fragment: true })
  .use(rehypeCollectImages)
  .use(rehypeRemark, {
    handlers: {
      figure: (state, node) => {
        const img = node.children?.find((c) => c.tagName === "img");
        const caption = node.children?.find((c) => c.tagName === "figcaption");
        const result = [];
        if (img) {
          result.push({
            type: "image",
            url: img.properties?.src || "",
            alt: img.properties?.alt || "",
          });
        }
        if (caption) {
          const text = caption.children
            ?.filter((c) => c.type === "text")
            .map((c) => c.value)
            .join("");
          if (text) {
            result.push({ type: "emphasis", children: [{ type: "text", value: text }] });
          }
        }
        return result;
      },
    },
  })
  .use(remarkStringify)
  .process(wrappedHtml);

let markdown = String(mdast);

// ── Step 6: Download images ────────────────────────────────────────────────

const slug = slugify(url);
const outputDir = values.output
  ? resolve(values.output)
  : resolve(projectRoot, "saved-articles", slug);

const imagesDir = join(outputDir, "images");
mkdirSync(imagesDir, { recursive: true });

if (imageMap.size > 0) {
  console.log(`⬇️  Downloading ${imageMap.size} images...`);

  const downloadPromises = [...imageMap.entries()].map(async ([imgUrl, filename]) => {
    try {
      const resp = await fetch(imgUrl, {
        headers: { Referer: url },
        signal: AbortSignal.timeout(15000),
      });
      if (!resp.ok) {
        console.warn(`  ⚠️  ${resp.status} - ${filename} (${imgUrl})`);
        return;
      }
      const buffer = Buffer.from(await resp.arrayBuffer());
      writeFileSync(join(imagesDir, filename), buffer);
      console.log(`  ✅ ${filename} (${(buffer.length / 1024).toFixed(1)} KB)`);
    } catch (err) {
      console.warn(`  ❌ Failed: ${filename} - ${err.message}`);
    }
  });

  await Promise.all(downloadPromises);
}

// ── Step 7: Add title & save ───────────────────────────────────────────────

const titleLine = pageTitle ? `# ${pageTitle}\n\n` : "";
const finalMarkdown = titleLine + markdown;

mkdirSync(outputDir, { recursive: true });
const mdPath = join(outputDir, `${slug}.md`);
writeFileSync(mdPath, finalMarkdown, "utf-8");

console.log(`\n✅ Done!`);
console.log(`   📝 Markdown: ${mdPath}`);
console.log(`   🖼  Images:   ${imagesDir} (${imageMap.size} files)`);
console.log(`   📏 Length:   ${finalMarkdown.length} chars`);
