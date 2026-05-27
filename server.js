const express = require("express");
const path = require("path");
const fs = require("fs");
const { marked } = require("marked");

const app = express();
const PORT = process.env.PORT || 1221;

// ========== 路径配置 ==========
const POSTS_DIR = path.join(__dirname, "posts");
const PAGES_DIR = path.join(__dirname, "pages");
const CONFIG_PATH = path.join(__dirname, "config.json");
const PUBLIC_DIR = path.join(__dirname, "public");

// ========== 读取 basePath ==========
const basePath = loadConfig().basePath || "";

// ========== 模板引擎 ==========
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ========== 静态资源 ==========
app.use(basePath || "/", express.static(PUBLIC_DIR));

// ========== 工具函数 ==========

/** 读取并解析 config.json */
function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return { siteName: "我的博客", description: "", articles: [] };
  }
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (e) {
    console.error("配置文件解析失败：", e.message);
    return { siteName: "我的博客", description: "", articles: [] };
  }
}

/** 从 Markdown 文件中提取标题（第一个 # 或 ## 开头的行） */
function extractTitle(mdPath) {
  try {
    const content = fs.readFileSync(mdPath, "utf-8");
    const match = content.match(/^#\s+(.+)/m);
    if (match) return match[1].trim();
  } catch (_) { /* ignore */ }
  return null;
}

/** 生成文章摘要（取正文前 200 字符） */
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

/** 获取所有可见的文章列表 */
function getVisibleArticles() {
  const config = loadConfig();
  const articles = [];
  for (const item of config.articles) {
    if (item.visible === false) continue;
    const mdPath = path.join(POSTS_DIR, item.file);
    if (!fs.existsSync(mdPath)) continue;
    const slug = item.slug || item.file.replace(/\.md$/, "").replace(/[\\/]/g, "-");
    const title = item.title || extractTitle(mdPath) || slug;
    const stat = fs.statSync(mdPath);
    articles.push({ slug, title, file: item.file, date: item.date || "",
      description: item.description || extractExcerpt(mdPath),
      updatedAt: stat.mtime.toISOString().slice(0, 10) });
  }
  articles.sort((a, b) => {
    if (a.date && b.date) return b.date.localeCompare(a.date);
    if (a.date) return -1; if (b.date) return 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
  return articles;
}

/** 获取单篇文章完整数据 */
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
      return { slug, title, htmlContent, date: item.date || "",
        description: item.description || extractExcerpt(mdPath),
        updatedAt: stat.mtime.toISOString().slice(0, 10) };
    }
  }
  return null;
}

/** 获取所有自定义 HTML 页面列表 */
function getPages() {
  if (!fs.existsSync(PAGES_DIR)) return [];
  try {
    return fs.readdirSync(PAGES_DIR)
      .filter(f => f.endsWith(".html"))
      .map(f => ({ name: f.replace(/\.html$/, ""), file: f }));
  } catch (_) { return []; }
}

/** 是否有友链 */
function hasLinks() {
  const config = loadConfig();
  return config.links && config.links.length > 0;
}

// ========== 路由 ==========
const router = express.Router();

// 首页 —— 文章列表
router.get("/", (_req, res) => {
  const config = loadConfig();
  res.render("index", {
    siteName: config.siteName || "我的博客",
    basePath: config.basePath || "",
    description: config.description || "",
    avatar: config.avatar,
    articles: getVisibleArticles(),
    pages: getPages(),
    hasLinks: hasLinks(),
  });
});

// 友链页
router.get("/links", (_req, res) => {
  const config = loadConfig();
  res.render("links", {
    siteName: config.siteName || "我的博客",
    basePath: config.basePath || "",
    pages: getPages(),
    hasLinks: hasLinks(),
    links: config.links || [],
  });
});

// 文章详情页
router.get("/post/:slug", (req, res) => {
  const article = getArticle(req.params.slug);
  if (!article) {
    return res.status(404).render("404", {
      siteName: loadConfig().siteName || "我的博客",
      basePath: loadConfig().basePath || "",
      message: "文章未找到", pages: getPages(), hasLinks: hasLinks(),
    });
  }
  const config = loadConfig();
  res.render("post", {
    siteName: config.siteName || "我的博客",
    basePath: config.basePath || "",
    article, pages: getPages(), hasLinks: hasLinks(),
  });
});

// 自定义 HTML 页面
router.get("/page/:name", (req, res) => {
  const pageName = req.params.name;
  const htmlPath = path.join(PAGES_DIR, pageName + ".html");
  if (!fs.existsSync(htmlPath)) {
    const altPath = path.join(PAGES_DIR, req.params.name);
    if (fs.existsSync(altPath) && altPath.endsWith(".html")) return res.sendFile(altPath);
    return res.status(404).render("404", {
      siteName: loadConfig().siteName || "我的博客",
      basePath: loadConfig().basePath || "",
      message: "页面未找到", pages: getPages(), hasLinks: hasLinks(),
    });
  }
  res.sendFile(htmlPath);
});

app.use(basePath, router);

app.use((_req, res) => {
  res.status(404).render("404", {
    siteName: loadConfig().siteName || "我的博客",
    basePath: loadConfig().basePath || "",
    message: "页面未找到", pages: getPages(), hasLinks: hasLinks(),
  });
});

// ========== 启动 ==========
app.listen(PORT, () => {
  const bp = basePath || "";
  console.log(`\n✨ 博客已启动：http://localhost:${PORT}${bp}\n`);
  const articles = getVisibleArticles();
  console.log(`📝 已加载 ${articles.length} 篇文章：`);
  articles.forEach(a => console.log(`   - ${a.title}  (${bp}/post/${a.slug})`));
  const pages = getPages();
  if (pages.length > 0) {
    console.log(`📄 已加载 ${pages.length} 个自定义页面：`);
    pages.forEach(p => console.log(`   - ${p.name}  (${bp}/page/${p.name})`));
  }
  if (hasLinks()) console.log(`🔗 友链页：${bp}/links`);
  console.log("");
});
