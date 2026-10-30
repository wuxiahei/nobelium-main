# Vercel 内容刷新与编辑方案诊断报告

- 项目：`nobelium-new`
- 调研日期：2026-10-30
- 本轮范围：仅做诊断和方案设计，**不修改应用代码、不修改配置、不提交 Git**
- 技术栈：Next.js 14（Pages Router）+ Notion + Vercel
- 线上探测地址：`https://nobelium.vercel.app/`（仅作本次探测，不默认认定它一定是当前正确的生产域名）

---

## 一、结论先行

### 1. “刷新几次才出现新内容”正常吗？

**不完全正常。**

当前项目使用 ISR（增量静态再生成），并且所有主要页面都配置了：

```js
revalidate: 300
```

这意味着页面正常的新鲜缓存期是 300 秒（5 分钟）。超过 5 分钟后，第一次访问可能仍然拿到旧页面，同时 Vercel 在后台重新生成；第二次或稍后的访问才会拿到新内容。如果重新生成失败，旧页面可能继续以 `STALE` 状态存在。

因此，下面这种情况属于 ISR 的正常边界：

- 发布后 5 分钟内看到旧内容；
- 缓存过期后的第一次请求仍返回旧内容；
- 紧接着再请求一次，页面变成新内容。

但下面这些情况**不属于正常缓存延迟**：

- 连续刷新很多次仍然一直是旧内容；
- 过了 10 分钟、半小时甚至更久，内容仍不更新；
- `x-vercel-cache` 长期为 `STALE`，并且 `age` 持续变得非常大；
- 换网络、无痕窗口、`curl` 请求仍然拿到同一份旧页面；
- Vercel 日志中反复出现 Notion 请求失败、函数超时或重新生成失败。

本次线上探测还发现了一个**优先级最高的问题**：`https://nobelium.vercel.app/` 返回的页面标题是 **CRAIGARY**，而当前仓库 `blog.config.js` 中配置的站名是 **Ely**。这说明该域名至少没有返回当前代码的最新生产结果，可能指向了旧项目、旧部署或错误 alias。

**建议顺序：先核对生产域名和 Production Deployment，再排查 ISR 与 Notion。否则优化缓存可能是在错误的目标上做功。**

### 2. 编辑方案怎么改？

推荐保留 Notion，同时增加 **Git Markdown/MDX 内容源**，通过统一的“内容适配层”把两种来源合并，而不是把 Notion 替换掉。

推荐路线：

1. 保留现有 Notion 编辑能力和原有内容；
2. 新增 `content/posts/*.md` 作为第二种内容源；
3. 页面统一读取 `getAllContent()` / `getContentBySlug()`，由适配层区分 Notion 和 Markdown；
4. Markdown 通过 Git 提交触发 Vercel 新部署；
5. Notion 通过 Webhook 或手动触发器调用受保护的 `/api/revalidate`；
6. 在文章页面提供“编辑本文”入口：Notion 文章打开 Notion，Markdown 文章打开 GitHub 编辑页；
7. 如果后续还需要浏览器内可视化编辑，再接入 Decap CMS、TinaCMS 或 Keystatic，不建议第一步就自研 CMS。

### 3. 本轮交付

本轮只交付本报告，未改动应用代码。

---

## 二、当前项目的缓存与内容链路

### 2.1 ISR 配置

当前项目主要页面的静态生成配置如下：

| 页面 | 配置 | 说明 |
|---|---|---|
| `pages/index.js` | `revalidate: 300` | 首页，5 分钟后可重新生成 |
| `pages/[slug].js` | `revalidate: 300`、`fallback: 'blocking'` | 文章详情页，新 slug 首次访问时阻塞生成 |
| `pages/page/[page].js` | `revalidate: 300`、`fallback: 'blocking'` | 分页页 |
| `pages/tag/[tag].js` | `revalidate: 300`、`fallback: 'blocking'` | 标签页 |
| `pages/search.js` | `revalidate: 300` | 搜索页 |
| `pages/feed.js` | `getServerSideProps` | RSS 是服务端渲染，不走上面的 ISR |

仓库中**未发现**以下机制：

- `/api/revalidate` 按需刷新接口；
- Notion Webhook 接收端；
- 发布后主动刷新 Vercel 缓存的脚本；
- `revalidateTag` / `revalidatePath` 一类按需失效逻辑（Pages Router 通常使用 `res.revalidate`）。

### 2.2 Notion 内容加载层

相关文件：

- `lib/notion/getAllPosts.js`
- `lib/notion/getPostBlocks.js`
- `lib/server/notion-api.js`
- `lib/server/notion-official-blocks.js`
- `pages/[slug].js`

关键事实：

1. **进程内缓存只在构建阶段启用。**
   - `getAllPosts.js` 中的 `postsCache` 只有在 `npm_lifecycle_event === 'build'` 或 `NEXT_PHASE === 'phase-production-build'` 时才启用。
   - `getPostBlocks.js` 中的 `postBlocksCache` 也是同样逻辑。
   - 这意味着线上 ISR 重新生成时，通常仍会重新请求 Notion，而不是直接读取构建时的进程内缓存。

2. **当前优先使用官方 Notion API。**
   - 有官方 token 时走官方 API。
   - 没有官方 token 时回退到 `notion-client` 非官方接口。

3. **官方 API 会递归抓取页面子块。**
   - `lib/server/notion-official-blocks.js` 会请求页面及其 children。
   - 对于长文章、嵌套 block 多、图片多的页面，这个过程可能比较慢。

4. **非官方接口有重试，但可能拖长请求。**
   - `lib/server/notion-api.js` 默认最多重试 6 次。
   - 退避时间最大 15 秒。
   - 在 Vercel 函数时限有限的情况下，连续重试可能导致重新生成超时。

### 2.3 Vercel 配置

`vercel.json` 目前只配置了字体文件的长期缓存，不影响文章页面的 ISR 行为。

---

## 三、问题一：为什么总是刷新几次才出现新内容

### 3.1 ISR 的正常行为

以 `revalidate: 300` 为例：

```text
T+0      用户发布内容
T+0~5m   页面仍可能显示旧内容
T+5m     第一个请求到达
         -> Vercel 返回旧页面（STALE）
         -> 后台开始重新生成
T+5m+    后续请求拿到新页面（HIT/MISS）
```

所以：

- **一次旧内容后再刷新变新**：可能是正常的 stale-while-revalidate；
- **每次都要刷新三四次，或者一直不变**：不能简单归因于“正常 ISR”；
- **浏览器刷新不一定等于 Vercel 缓存刷新**：浏览器可能拿到 CDN 返回的旧 HTML，服务端并不会因为用户刷新就立刻完成重新生成。

### 3.2 本次线上探测证据

对 `https://nobelium.vercel.app/` 做了一次 HTTP 响应检查，结果为：

| 项目 | 观测值 |
|---|---|
| HTTP 状态 | 200 |
| `x-vercel-cache` | `STALE` |
| `age` | 22,919,287 秒，约 265 天 |
| `cache-control` | `public, must-revalidate, max-age=0` |
| 页面标题 | `CRAIGARY` |
| 当前仓库配置站名 | `Ely` |

这组信号说明：

1. 该 URL 确实返回了 Vercel 的陈旧缓存；
2. 约 265 天的 `age` 远大于 300 秒的 ISR 周期，不能仅解释为“5 分钟缓存延迟”；
3. 页面标题和当前仓库配置不一致，强烈提示该域名可能不是当前项目的最新生产部署，或者 alias 没有指向正确的 Deployment；
4. 但一次探测不足以单独断定根因，必须结合 Vercel Dashboard、Deployment URL 和函数日志确认。

### 3.3 最可能的五类原因

按优先级排列：

#### P0：生产域名或 alias 指向了错误项目/旧部署

需要确认：

- `nobelium.vercel.app` 是否确实属于当前 Vercel Project；
- 该域名绑定的是哪个 Production Deployment；
- 该 Deployment 的 Git commit 是否等于当前 `main` 的最新提交；
- 是否存在多个 Vercel Project 都使用相近名称；
- 当前 `blog.config.js` 里的 `link` 是否应该改成真实生产域名。

如果访问了错误的域名，后面所有缓存和 Notion 优化都不会作用到用户实际看到的页面。

#### P1：后台重新生成失败或超时

可能表现：

- 第一次请求返回 `STALE` 后，后续仍然返回同一份 `STALE`；
- Vercel Function Logs 中有 Notion API 4xx/5xx、超时、`FUNCTION_INVOCATION_TIMEOUT`；
- 某个长文章页面特别容易出现，首页反而正常。

常见原因：

- Notion Integration 没有权限访问目标页面或数据库；
- `NOTION_DATABASE_ID` / `NOTION_DATA_SOURCE_ID` 与当前 Notion API 版本不匹配；
- 官方 API 递归抓取 block 太慢；
- 非官方 API 触发限流，重试时间过长；
- Vercel 函数最大执行时间不足；
- Notion 页面结构复杂，单次生成时间超过限制。

#### P1：Notion 数据源或环境变量配置不一致

当前代码支持：

- `NOTION_API_KEY` + `NOTION_DATABASE_ID`；
- 或 `NOTION_DATA_SOURCE_ID`；
- 以及旧的 `NOTION_PAGE_ID` 路径。

需要确认 Vercel 的 **Production** 环境变量与本地开发环境一致，而不是只配置了 Preview/Development。尤其要检查：

- `NOTION_API_KEY`
- `NOTION_DATABASE_ID` 或 `NOTION_DATA_SOURCE_ID`
- `NOTION_VERSION`
- 旧模式下的 `NOTION_PAGE_ID` / `NOTION_ACCESS_TOKEN`

不要把真实值写进仓库或本报告。

#### P2：浏览器或中间缓存干扰

需要用无痕窗口和命令行请求区分：

- 浏览器扩展/缓存；
- Vercel CDN 缓存；
- 浏览器已经打开的页面没有自动更新；
- 部署刚完成，alias 还在传播。

注意：在 URL 后面加 `?v=123` 只能绕过部分浏览器缓存，**不能可靠绕过 Vercel 的 ISR/CDN 缓存**，不能把它当作正式修复方案。

#### P2：新文章没有进入静态路径列表

`pages/[slug].js` 的 `fallback: 'blocking'` 会在新 slug 第一次访问时生成页面，通常不需要手动刷新。但如果：

- 新文章 slug 冲突；
- 文章没有通过发布状态筛选；
- 文章没有被 `getAllPosts()` 返回；
- 新文章详情页生成失败；

就会出现“列表页更新了，但详情页仍旧/404/需要多次刷新”的现象。

### 3.4 建议的排查顺序

#### 第一步：确认实际访问的是正确生产站点

在 Vercel Dashboard 中检查：

1. Project 名称是否与当前仓库一致；
2. Settings -> Domains 中，生产域名绑定到哪个 Project；
3. Deployments 中最新 Production Deployment 的 commit 是否是最新 `main`；
4. 打开该 Deployment 的专属 URL，确认内容是否为当前应该发布的内容；
5. 对比 Deployment URL 和自定义域名是否一致。

建议记录：

```text
生产域名：
Vercel Project：
Production Deployment URL：
部署 commit：
部署时间：
```

#### 第二步：用命令行排除浏览器缓存

PowerShell 示例：

```powershell
curl.exe -I "https://你的生产域名/"
curl.exe -I "https://你的生产域名/文章slug"
```

重点观察：

```text
x-vercel-cache
age
etag
cache-control
x-vercel-id
```

间隔 10 到 30 秒连续请求两次，判断：

- 第一次 `STALE`，第二次变成新内容：可能只是正常的 ISR 重新生成；
- 两次都是 `STALE`，`age` 继续增长：重新生成很可能失败，或请求打到了错误部署。

#### 第三步：检查 Vercel 函数日志

在 Vercel 中查看对应 Production Deployment 的 Function Logs，重点搜索：

- `[notion]`
- `Failed to load`
- `timeout`
- `429`
- `500`
- `503`
- `revalidate`
- `FUNCTION_INVOCATION_TIMEOUT`

如果首页正常但某些长文章总是失败，优先怀疑长页面 block 抓取超时。

#### 第四步：做一个可重复的发布测试

1. 在 Notion 中修改一个容易识别的字段，例如标题加一个临时标记；
2. 记录修改时间；
3. 立刻请求首页和文章页；
4. 等待 5 分钟后再请求；
5. 检查 Vercel 日志和 `x-vercel-cache`；
6. 判断是“首次旧、第二次新”，还是“始终旧”。

### 3.5 不建议采用的修复方式

#### 不建议把所有页面改成 SSR / `no-store`

这样做会：

- 每次访问都请求 Notion；
- 增加页面延迟；
- 更容易触发 Notion 限流；
- 增加 Vercel 函数调用和成本；
- 让 RSS、文章页和首页都失去静态缓存优势。

#### 不建议只把 `revalidate` 从 300 改成 1

这只能缩短“最长等待时间”，不能解决：

- 重新生成失败；
- 域名指向错误；
- Notion 超时；
- 函数调用超时；
- 用户已经打开页面不会自动更新。

#### 不建议靠前端轮询或反复刷新解决

这是把服务端缓存问题转嫁给用户，体验不会稳定。

---

## 四、推荐的按需刷新方案

### 4.1 目标架构

```text
Notion 编辑
   |
   v
Notion Webhook / 手动触发
   |
   v
POST /api/revalidate（带密钥）
   |
   v
Next.js res.revalidate(...)
   |
   v
Vercel 更新首页、文章页、标签页缓存

Git Markdown 编辑
   |
   v
commit + push
   |
   v
Vercel 自动构建新 Deployment
   |
   v
新内容随新部署上线
```

核心原则：

- **ISR 继续保留**，不要为了实时性全部改成 SSR；
- **Notion 编辑继续保留**；
- **Notion 变更走按需 revalidate**；
- **Markdown 变更走 Git 部署**；
- 手动刷新入口作为兜底。

### 4.2 新增受保护的 `/api/revalidate`

建议新增 Pages Router API：

```text
pages/api/revalidate.js
```

接口建议：

```http
POST /api/revalidate
Authorization: Bearer <REVALIDATE_SECRET>
Content-Type: application/json

{
  "paths": ["/", "/search", "/example", "/tag/example"],
  "reason": "notion-update"
}
```

行为建议：

1. 校验 `Authorization`；
2. 校验 `paths` 必须是站内路径；
3. 逐条调用 `res.revalidate(path)`；
4. 记录成功/失败路径和耗时；
5. 返回结构化结果；
6. 失败时返回明确错误，不要静默成功；
7. 不在响应中暴露 Notion token、密钥或内部堆栈。

代码形态示意（不是本轮要落地的代码）：

```js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const secret = process.env.REVALIDATE_SECRET
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const paths = Array.isArray(req.body?.paths) ? req.body.paths : []
  if (!paths.length) {
    return res.status(400).json({ error: 'paths is required' })
  }

  const revalidated = []
  for (const path of paths) {
    await res.revalidate(path)
    revalidated.push(path)
  }

  return res.json({ revalidated })
}
```

注意：

- 生产环境必须配置 `REVALIDATE_SECRET`，建议使用高强度随机值；
- 不要把密钥写进 `blog.config.js`、前端 bundle 或 GitHub；
- 不要允许任意 URL 作为 `paths`，否则会变成开放刷新接口；
- 若一次要刷新的路径很多，应考虑批处理、队列或只刷新关键页面，避免接口超时。

### 4.3 需要刷新的路径策略

建议按内容变更类型决定：

| 变更 | 建议刷新 |
|---|---|
| Notion 文章标题、摘要、状态 | `/`、`/search`、文章页、相关标签页 |
| 新文章发布 | `/`、`/search`、相关标签页；新文章详情页依赖 `fallback: 'blocking'` 首次生成 |
| 文章正文修改 | 该文章页，必要时 `/`、RSS |
| 标签变更 | `/`、`/search`、旧标签页、新标签页 |
| 分页变化 | `/`、`/page/2` 等分页路径 |
| Markdown 变更 | Git 推送触发新的 Vercel Deployment；一般不需要手动 revalidate |

补充：

- `pages/feed.js` 当前使用 `getServerSideProps`，不是 ISR 页面，`res.revalidate` 不适用于它；
- 如果 RSS 也被 CDN 缓存，应单独设置缓存策略，或把它改成可控的 API/静态输出；
- 新文章 slug 不在 `getStaticPaths()` 中时，`fallback: 'blocking'` 会在首次访问时生成，通常不需要预先加入路径列表。

### 4.4 Notion Webhook 设计

如果当前 Notion 集成支持 Webhook：

1. 在 Notion 中订阅页面/数据库变更；
2. Webhook 指向 `https://你的域名/api/revalidate`；
3. 校验 Notion 签名或额外共享密钥；
4. 对事件做幂等处理；
5. 只刷新相关路径；
6. 同一次编辑产生的多条事件做 2 到 5 秒防抖，避免重复 revalidate；
7. 记录事件 ID、处理结果和耗时。

如果不支持 Webhook，可以用以下兜底：

- Notion Automation / 第三方自动化平台发起 HTTP 请求；
- 发布后手动点击刷新；
- 定时检查最新更新时间并调用 revalidate；
- 运营人员在 Vercel 中手动 Redeploy（不推荐作为常规流程）。

无论用哪种方式，**Webhook 端点都必须有密钥或签名校验**。

### 4.5 验收标准

| 场景 | 通过标准 |
|---|---|
| Notion 修改标题 | 触发后 10 到 30 秒内，首页和文章页返回新标题 |
| Notion 修改正文 | 文章页返回新正文，不出现长期 `STALE` |
| 新文章发布 | 首页出现新文章；详情页首次访问可生成 |
| 标签修改 | 新旧标签页都能正确显示 |
| Markdown 发布 | push 后 Vercel 构建成功，页面显示新内容 |
| 未授权请求 | `/api/revalidate` 返回 401 |
| Notion API 临时异常 | 有日志、有重试，不静默成功 |
| 重新生成失败 | 接口返回失败，可人工重试，不让用户无限刷新 |

---

## 五、问题二：如何让编辑更简单，同时保留 Notion

### 5.1 为什么 Notion 编辑会觉得笨重

Notion 适合作为数据库和内容管理入口，但在这个项目里有几个客观成本：

- 文章正文是 block 结构，不是简单 Markdown；
- 属性字段和正文 block 两端都要维护；
- Notion API 需要处理分页、递归 block、图片和嵌套结构；
- 官方 API 抓取长文章可能慢；
- 非官方 API 有限流和稳定性风险；
- 每次正文小改动仍要等待缓存重新生成；
- 想改一个段落时，操作路径比直接编辑文本文件长。

但 Notion 也有明显优势：

- 现有内容已经在 Notion；
- 手机、平板、网页都能编辑；
- 富文本、图片、数据库属性比较直观；
- 不需要本地开发环境。

因此，最合理的做法不是“Notion 和 Markdown 二选一”，而是**双来源、统一读取**。

### 5.2 方案对比

| 方案 | 编辑体验 | 接入成本 | Notion 保留 | 适合场景 |
|---|---|---:|---|---|
| 只保留 Notion | 熟悉，但笨重 | 最低 | 是 | 不想改架构、内容量很小 |
| Git Markdown + GitHub 网页编辑 | 简单，直接改文件 | 低到中 | 可保留 | 熟悉 Git、想快速上线 |
| Obsidian / VS Code + Git | 本地写作体验好 | 中 | 可保留 | 个人长期写作、愿意本地管理 |
| Decap CMS | 浏览器表单编辑，较直观 | 中 | 可保留 | 想要轻量后台、内容以 Markdown 为主 |
| TinaCMS | 可视化编辑、预览体验好 | 中到高 | 可保留 | 希望“像编辑网页一样改内容” |
| Keystatic | Next.js 原生、开发者友好 | 中 | 可保留 | 团队愿意维护 React/Next 集成 |
| 完全自研后台 | 可完全定制 | 高 | 可保留 | 有明确复杂需求，不建议先做 |

### 5.3 推荐方案：双来源统一内容层

#### 目标目录

```text
content/
  posts/
    hello-world.md
    another-post.md
  pages/
    about.md
```

#### Markdown front matter 示例

```md
---
title: "一篇文章的标题"
slug: "hello-world"
date: "2026-10-30"
summary: "列表页显示的摘要"
tags:
  - 技术
  - 设计
status: "published"
type: "Post"
fullWidth: false
---

正文内容。
```

#### 统一内容模型

建议适配层统一输出类似结构：

```js
{
  id: 'notion:xxxx' 或 'md:hello-world',
  slug: 'hello-world',
  title: '一篇文章的标题',
  date: 1790000000000,
  summary: '列表页显示的摘要',
  tags: ['技术', '设计'],
  status: 'published',
  type: 'Post',
  fullWidth: false,
  source: 'notion' | 'markdown',
  contentRef: '...'
}
```

注意：Notion 的正文是 `blockMap`，Markdown 的正文是文本/Markdown AST，两者不要强行塞进完全相同的 `body` 字段。建议保留 `source` 和 `contentRef`，渲染层再按来源选择：

```text
source === 'notion'   -> NotionRenderer + blockMap
source === 'markdown' -> react-markdown / Markdown 渲染器
```

项目已经依赖：

- `react-markdown`
- `remark-gfm`
- `remark-math`
- `rehype-katex`

因此 Markdown 渲染不需要从零引入整套新依赖，但仍要补充代码高亮、图片、标题锚点等细节。

#### 适配层接口建议

```js
getAllContent({ includePages })
getContentBySlug(slug, { includePages })
getContentSource(id)
getContentLastModified(id)
```

内部实现：

```text
getAllContent()
  -> getAllPostsFromNotion()
  -> getAllPostsFromMarkdown()
  -> normalize()
  -> dedupe()
  -> sort()
  -> return
```

#### slug 冲突策略

两种来源必须明确冲突规则，不能静默覆盖：

- 推荐：构建时检测重复 slug，直接报错；
- 或者：配置明确的优先级，例如 Markdown 优先；
- 冲突错误要包含两个来源和文件路径/Notion 页面 ID，便于修复。

#### 编辑入口

在文章页增加“编辑本文”链接：

- Notion 来源：打开对应 Notion 页面；
- Markdown 来源：打开 GitHub 的 `edit/main/content/posts/....md` 页面；
- 可配置为仅管理员可见，或作为普通链接。

这一步成本很低，但能显著减少“先找 Notion、再找文件”的操作成本。

### 5.4 编辑体验的分阶段建议

#### 阶段 A：最小可用（推荐先做）

- 新增 Markdown 目录和解析器；
- 保留 Notion；
- 文章页增加“编辑本文”链接；
- 先用 GitHub 网页编辑器、VS Code 或 Obsidian 编辑；
- Markdown push 后由 Vercel 自动部署。

适合：你能接受 Git 操作，或者希望先验证双来源架构是否稳定。

#### 阶段 B：浏览器内轻量后台

如果不想每次打开本地编辑器，可以加一个 Git-based CMS：

- **Decap CMS**：静态后台、表单式编辑、内容保存到 Git；需要 GitHub OAuth 代理；
- **TinaCMS**：可视化编辑和实时预览更强；需要 Tina Cloud 或自托管配置；
- **Keystatic**：Next.js 原生、类型友好；需要 GitHub App/OAuth 配置。

选择建议：

- 只想“在浏览器里改 Markdown 字段”：优先 Decap CMS；
- 想“点正文直接编辑、看预览”：优先 TinaCMS；
- 想尽量贴近 Next.js 代码和类型系统：优先 Keystatic。

不建议第一阶段就引入 CMS。先把内容适配层和发布链路稳定下来，再接编辑器，风险更低。

### 5.5 Markdown 发布链路

```text
编辑 Markdown
  -> commit
  -> push 到 GitHub
  -> Vercel 创建新 Deployment
  -> 构建时读取 content/
  -> 新页面随 Deployment 上线
```

Markdown 内容在构建时打包，因此：

- 不需要单独调用 Notion；
- 不受 Notion API 限流影响；
- 页面发布依赖一次 Vercel 构建；
- 修改 Markdown 后不需要手动 revalidate，部署本身会替换静态产物。

### 5.6 Notion 发布链路

```text
Notion 编辑
  -> Webhook / 手动触发
  -> /api/revalidate
  -> res.revalidate(...)
  -> 现有 Deployment 的 ISR 缓存更新
```

注意：

- Notion 更新不需要重新构建整个站点；
- 但要保证页面重新生成时 Notion API 可访问；
- 如果 Notion API 很慢，应把长文章的分块抓取、快照缓存或异步生成纳入后续优化。

---

## 六、推荐实施路线

### 第一阶段：先确认真实生产链路（0.5 到 1 天）

- 核对 Vercel Project、Domains、Production Deployment；
- 确认 `blog.config.js` 的 `link` 是实际生产域名；
- 确认 Production 环境变量；
- 用 `curl` 和 Vercel Logs 复现一次更新；
- 判断是域名问题、Notion 问题还是 ISR 问题。

**完成标准：能明确回答“用户实际访问的是哪个 Deployment，为什么它没有更新”。**

### 第二阶段：按需刷新（0.5 到 1 天）

- 新增 `pages/api/revalidate.js`；
- 配置 `REVALIDATE_SECRET`；
- 实现路径白名单和日志；
- 提供手动触发方式；
- 验证首页、文章页、标签页都能更新。

**完成标准：发一次 Notion 修改，10 到 30 秒内首页和文章页可见。**

### 第三阶段：Notion Webhook（0.5 到 1 天）

- 接收 Notion 事件；
- 校验签名/密钥；
- 幂等和防抖；
- 只刷新相关路径。

**完成标准：Notion 发布后不再依赖人工刷新。**

### 第四阶段：Markdown 内容源（1 到 2 天）

- 增加 `content/` 目录；
- 解析 front matter；
- 统一内容模型；
- Markdown 渲染；
- slug 冲突检测；
- 编辑链接。

**完成标准：同一站点可以同时展示 Notion 文章和 Markdown 文章，列表、标签、分页、RSS 不回归。**

### 第五阶段：可选 CMS（2 到 4 天）

按需要选择 Decap CMS、TinaCMS 或 Keystatic。

**完成标准：不登录代码编辑器也能完成 Markdown 文章的创建、编辑和发布。**

---

## 七、风险与注意事项

| 风险 | 影响 | 应对 |
|---|---|---|
| 访问了错误域名/旧 Deployment | 所有缓存优化无效 | 先核对 Domains 和 Production commit |
| Notion Integration 权限不足 | 重新生成失败，长期 STALE | 检查页面共享和 token 权限 |
| Notion API 限流/超时 | 文章页生成失败 | 使用官方 API、减少 block 请求、持久化快照 |
| Vercel 函数超时 | 长文章无法重新生成 | 监控耗时、拆分抓取、缓存中间结果 |
| 双来源 slug 冲突 | 内容覆盖或 404 | 构建时检测并报错 |
| Markdown 与 Notion 字段不一致 | 列表排序、标签、摘要异常 | 统一 normalize 层并写测试 |
| Webhook 无鉴权 | 任意人可触发刷新，造成成本 | 密钥/签名校验、路径白名单、限流 |
| CMS OAuth 配置错误 | 后台无法登录或泄露权限 | 使用最小权限 GitHub App/OAuth |
| 只靠刷新验证 | 误判缓存问题 | 使用 `curl`、`x-vercel-cache`、日志三类证据 |

---

## 八、最终建议

### 最短路径

1. **先确认 `nobelium.vercel.app` 是否真的是当前生产域名。**
2. 如果不是，修正 Vercel Domain/alias 和 `blog.config.js` 的 `link`。
3. 如果域名正确，检查 Production Deployment、Notion 环境变量和函数日志。
4. 加入受保护的 `/api/revalidate`，不要把所有页面改成 SSR。
5. 接入 Notion Webhook 或手动触发。
6. 在缓存链路稳定后，再增加 Markdown 内容源。
7. 最后根据实际编辑频率决定是否上 CMS。

### 一句话判断

**“第一次刷新旧、第二次新”可能是 ISR 的正常行为；但长期 `STALE`、`age` 极大、反复刷新仍不更新，不是正常现象。**

**当前最值得先做的不是降低 `revalidate`，而是核对生产域名/Deployment，并增加按需 revalidate。**

**编辑方案推荐“Notion + Git Markdown 双来源”，先加编辑入口和 Markdown 内容源，再按需引入 CMS。Notion 编辑能力完整保留。**

---

## 附录：关键代码位置

| 文件 | 作用 |
|---|---|
| `pages/index.js` | 首页 ISR |
| `pages/[slug].js` | 文章详情页 ISR、fallback、blockMap 获取 |
| `pages/page/[page].js` | 分页页 ISR |
| `pages/tag/[tag].js` | 标签页 ISR |
| `pages/search.js` | 搜索页 ISR |
| `pages/feed.js` | RSS，使用 `getServerSideProps` |
| `lib/notion/getAllPosts.js` | Notion 文章列表、构建阶段进程缓存 |
| `lib/notion/getPostBlocks.js` | Notion 正文 blockMap、构建阶段进程缓存 |
| `lib/server/notion-api.js` | 非官方 Notion 客户端、重试与限流 |
| `lib/server/notion-official-blocks.js` | 官方 API 递归抓取页面 block |
| `blog.config.js` | 站点名、域名、Notion 配置入口 |
| `vercel.json` | Vercel 响应头配置（当前仅字体缓存） |

---

*本报告不包含任何真实密钥。所有环境变量值均以占位符表示。*