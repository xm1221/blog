/**
 * 静态站点构建脚本
 * 将博客预渲染为纯静态 HTML，用于部署到 GitHub Pages
 *
 * 用法：node build.js
 * 输出：_site/ 目录
 */

const path = require("path");
const fs = require("fs");
const ejs = require("ejs");
const { marked } = require("marked");

// ========== 路径配置 ==========
const ROOT = __dirname;
const POSTS_DIR = path.join(ROOT, "posts");
const PAGES_DIR = path.join(ROOT, "pages");
const CONFIG_PATH = path.join(ROOT, "config.json");
const PUBLIC_DIR = path.join(ROOT, "public");
const VIEWS_DIR = path.join(ROOT, "views");
const OUT_DIR = path.join(ROOT, "_site");

// ========== 工具函数（与 server.js 保持一致） ==========

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return { siteName: "我的博客", description: "", articles: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  } catch (e) {
    console.error("配置文件解析失败：", e.message);
    return { siteName: "我的博客", description: "", articles: [] };
  }
}

function extractTitle(mdPath) {
  try {
    const content = fs.readFileSync(mdPath, "utf-8");
    const match = content.match(/^#\s+(.+)/m);
    if (match) return match[1].trim();
  } catch (_) { /* ignore */ }
  return null;
}

function extractExcerpt(mdPath) {
  try {
    const content = fs.readFileSync(mdPath, "utf-8");
    const clean = content
      .replace(/^#\s+.+/gm, "")
      .replace(/^```[\s\S]*?^```/gm, "")
      .replace(/[#*>`\-\[\]|!]/g, "")
      .replace(/\n{2,}/g, "\n")
      .trim();
    return clean.substring(0, 180) + (clean.length > 180 ? "…" : "");
  } catch (_) { return ""; }
}

function getVisibleArticles() {
  const config = loadConfig();
  const articles = [];
  for (const item of config.articles) {
    if (item.visible === false) continue;
    const mdPath = path.join(POSTS_DIR, item.file);
    if (!fs.existsSync(mdPath)) {
      console.warn(`   ⚠ 文章文件不存在：${item.file}`);
      continue;
    }
    const slug = item.slug || item.file.replace(/\.md$/, "").replace(/[\\/]/g, "-");
    const title = item.title || extractTitle(mdPath) || slug;
    const stat = fs.statSync(mdPath);
    articles.push({
      slug,
      title,
      file: item.file,
      date: item.date || "",
      description: item.description || extractExcerpt(mdPath),
      updatedAt: stat.mtime.toISOString().slice(0, 10),
    });
  }
  articles.sort((a, b) => {
    if (a.date && b.date) return b.date.localeCompare(a.date);
    if (a.date) return -1;
    if (b.date) return 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
  return articles;
}

function getArticle(slug) {
  const config = loadConfig();
  for (const item of config.articles) {
    const itemSlug = item.slug || item.file.replace(/\.md$/, "").replace(/[\\/]/g, "-");
    if (itemSlug === slug) {
      if (item.visible === false) return null;
      const mdPath = path.join(POSTS_DIR, item.file);
      if (!fs.existsSync(mdPath)) return null;
      const rawMd = fs.readFileSync(mdPath, "utf-8");
      const htmlContent = marked.parse(rawMd);
      const title = item.title || extractTitle(mdPath) || slug;
      const stat = fs.statSync(mdPath);
      return {
        slug, title, htmlContent,
        date: item.date || "",
        description: item.description || extractExcerpt(mdPath),
        updatedAt: stat.mtime.toISOString().slice(0, 10),
      };
    }
  }
  return null;
}

function getPages() {
  if (!fs.existsSync(PAGES_DIR)) return [];
  try {
    return fs.readdirSync(PAGES_DIR)
      .filter(f => f.endsWith(".html"))
      .map(f => ({ name: f.replace(/\.html$/, ""), file: f }));
  } catch (_) { return []; }
}

// ========== EJS 渲染辅助 ==========

/** 用 EJS 渲染模板，正确处理 include */
async function renderTemplate(tplName, data) {
  const filePath = path.join(VIEWS_DIR, tplName + ".ejs");
  return ejs.renderFile(filePath, data, {
    views: [VIEWS_DIR],
    filename: filePath,
  });
}

// ========== 文件输出辅助 ==========

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf-8");
  console.log(`   ✅ ${path.relative(OUT_DIR, filePath)}`);
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      console.log(`   ✅ ${path.relative(OUT_DIR, destPath)}`);
    }
  }
}

// ========== 主构建流程 ==========

async function build() {
  console.log("\n🔨 开始构建静态站点...\n");

  // 清理输出目录
  if (fs.existsSync(OUT_DIR)) {
    fs.rmSync(OUT_DIR, { recursive: true });
  }

  const config = loadConfig();
  const articles = getVisibleArticles();
  const pages = getPages();
  const hLinks = config.links && config.links.length > 0;

  // ---- 1. 首页 ----
  console.log("📋 生成首页");
  const indexHtml = await renderTemplate("index", {
    siteName: config.siteName || "我的博客",
    basePath: config.basePath || "",
    description: config.description || "",
    avatar: config.avatar,
    articles,
    pages,
    pageTitle: "",
    hasLinks: hLinks,
  });
  writeFile(path.join(OUT_DIR, "index.html"), indexHtml);

  // ---- 2. 文章详情页 ----
  if (articles.length > 0) {
    console.log(`📝 生成 ${articles.length} 篇文章页`);
    for (const article of articles) {
      const full = getArticle(article.slug);
      if (!full) continue;
      const postHtml = await renderTemplate("post", {
        siteName: config.siteName || "我的博客",
        basePath: config.basePath || "",
        article: full,
        pages,
        hasLinks: hLinks,
      });
      writeFile(
        path.join(OUT_DIR, "post", article.slug, "index.html"),
        postHtml
      );
    }
  }

  // ---- 3. 自定义 HTML 页面 ----
  if (pages.length > 0) {
    console.log(`📄 生成 ${pages.length} 个自定义页面`);
    const bp = config.basePath || "";
    for (const p of pages) {
      const srcPath = path.join(PAGES_DIR, p.file);
      if (fs.existsSync(srcPath)) {
        let html = fs.readFileSync(srcPath, "utf-8");
        html = html.replace(/(href|src|action)="\/(?!\/)/g, `$1="${bp}/`);
        html = html.replace(/<head>/, `<head>\n  <base href="${bp}/">`);
        writeFile(
          path.join(OUT_DIR, "page", p.name, "index.html"),
          html
        );
      }
    }
  }

  // ---- 4. 友链页 ----
  if (hLinks) {
    console.log("🔗 生成友链页");
    const linksHtml = await renderTemplate("links", {
      siteName: config.siteName || "我的博客",
      basePath: config.basePath || "",
      pages,
      hasLinks: hLinks,
      links: config.links,
    });
    writeFile(path.join(OUT_DIR, "links", "index.html"), linksHtml);
  }

  // ---- 5. 404 页面 ----
  console.log("🚫 生成 404 页面");
  const notFoundHtml = await renderTemplate("404", {
    siteName: config.siteName || "我的博客",
    basePath: config.basePath || "",
    message: "页面未找到",
    pages,
    hasLinks: hLinks,
  });
  writeFile(path.join(OUT_DIR, "404.html"), notFoundHtml);

  // ---- 6. 复制静态资源 ----
  if (fs.existsSync(PUBLIC_DIR)) {
    console.log("📦 复制静态资源");
    copyDir(PUBLIC_DIR, OUT_DIR);
  }

  // ---- 7. 统计 ----
  const countFiles = (dir) => {
    let count = 0;
    if (!fs.existsSync(dir)) return count;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) count += countFiles(path.join(dir, e.name));
      else count++;
    }
    return count;
  };

  console.log(`\n✨ 构建完成！共生成 ${countFiles(OUT_DIR)} 个文件 → ${OUT_DIR}\n`);
}

build().catch(err => {
  console.error("构建失败：", err);
  process.exit(1);
});
