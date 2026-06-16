# 设计优化建议草案

状态：待确认  
范围：仅基于当前代码与页面结构做本地审查，暂未修改 UI 实现  
项目判断：这是一个 Next.js + Tailwind + react-notion-x 的 Nobelium 博客主题，当前设计偏干净克制，基础可访问性已有一定加强，但整体还缺少首屏表达、内容层级、阅读辅助和状态反馈。

## 本轮确认方向

你已确认的产品与设计方向：

- 站点气质：个人气质 blog，不做企业官网感，也不做纯模板感。
- 视觉关键词：干净、个人、带一点墨水扩散/有机 blob 液态特效，有流动感但不能喧宾夺主。
- 性能重点：代码块、Markdown、Mermaid 等特殊内容加载偏慢，需要优先优化。
- About：希望从普通 Notion 页面升级成类似简历风格的展示页，顶部需要头像，并明确 Notion 中应该怎么填写。
- RSS：仅隐藏入口，保留 `/feed` 兼容旧链接。
- 图标：按 `Ely` 作为博主署名优化 favicon / wordmark，偏现代圆角 sans，凸显身份即可，不改变站点内容叙事。
- 参考策略：多吸收优秀个人博客的优点，但落回这个项目自己的气质。

## 优先级总览

| 优先级 | 方向 | 预期收益 | 涉及位置 |
| --- | --- | --- | --- |
| P0 | 首页首屏与文章列表层级 | 让访客快速理解站点主题，提高首页质感 | `pages/index.js`, `components/BlogPost.js`, `components/Container.js` |
| P0 | 文章阅读体验 | 提升长文可读性、定位感和移动端阅读稳定性 | `components/Post.js`, `components/TableOfContents.js`, `styles/notion.css` |
| P1 | 搜索与标签体验 | 让搜索结果更可解释，空状态更友好 | `layouts/search.js`, `components/Tags.js` |
| P1 | 视觉系统统一 | 减少零散灰阶和蓝色 focus 的割裂感 | `tailwind.config.js`, `styles/globals.css`, `styles/notion.css` |
| P1 | 移动端导航与反馈 | 提升小屏可用性，降低导航拥挤感 | `components/Header.js`, `styles/globals.css` |
| P1 | About 简历化 | 把 `slug=about` 的 Notion 页面转换成简历/个人主页体验 | `pages/[slug].js`, `components/Post.js`, `styles/notion.css` |
| P1 | Ely favicon / wordmark | 用 `Ely` 凸显博主署名和站点识别 | `components/Header.js`, `public/*`, `pages/_document.js` |
| P2 | 404、fallback、页脚等边缘状态 | 提升完整度和专业感 | `pages/404.js`, `pages/[slug].js`, `components/Footer.js` |
| P2 | 维护性清理 | 降低后续设计迭代阻力 | `blog.config.js`, `components/Post.js`, `components/TableOfContents.js` |

## 建议 1：首页增加轻量 Hero 区

当前首页直接进入文章列表，信息效率高，但缺少站点定位、作者气质和视觉记忆点。可以在列表前增加一个轻量 Hero，不做大而空的横幅，而是用一句明确的站点描述、作者信息、文章数量或标签入口建立第一印象。

建议实现：

- 在 `pages/index.js` 或新增 `components/HomeHero.js` 中加入首页头部区。
- 文案优先使用 `BLOG.title`、`BLOG.description`、`BLOG.author`，避免硬编码。
- 使用已有 IBM Plex Sans / Source Serif 做标题层级，例如标题用更大的 serif，说明文字保持 sans。
- 背景保持克制，可加入细微渐变、液态光斑、柔和网格或玻璃层，不要破坏 Nobelium 的干净感。
- 液态特效建议用纯 CSS：径向渐变 blob、`filter: blur()`、低透明度流动，不引入动画库。
- 首页不需要改成博主介绍页，只需在 Header、favicon 或背景标识中轻量凸显 `Ely` 作为博主署名。
- 首屏主要优化背景氛围、文章入口层级和个人博客质感，不乱改内容定位。

验收标准：

- 首页首屏能在 3 秒内说明“这个站点是什么”。
- 移动端不占用过多高度，首篇文章仍可较快露出。
- 不影响分页逻辑。

## 建议 2：文章列表从“分割线列表”升级为“可扫描内容卡片”

`components/BlogPost.js` 当前是分割线列表，标题、日期、摘要都清楚，但视觉记忆点偏弱。可以在保持轻量的基础上强化每篇文章的可点击区域和扫描节奏。

建议实现：

- 将每篇文章改为低边框或浮层卡片，hover 时轻微抬升或改变背景。
- 增加摘要、日期、标签或阅读线索之间的层级差异。
- 如果有 `post.tags`，可在列表卡片中展示前 2 到 3 个标签。
- 保留完整链接包裹，继续支持键盘 focus。

验收标准：

- 文章列表更像“内容入口”，而不是纯文本索引。
- hover/focus 在明暗模式下都清晰。
- 摘要缺失时布局不塌陷。

## 建议 3：文章页增加阅读进度与目录当前位置

文章页已经有右侧目录，但目录只是静态锚点，没有当前阅读位置反馈。长文中用户容易失去上下文。可以加入阅读进度条和 TOC active 状态。

建议实现：

- 在 `components/Header.js` 或 `components/Post.js` 增加顶部细阅读进度条。
- 在 `components/TableOfContents.js` 中使用 IntersectionObserver 标记当前 heading。
- 用 CSS 变量替代 `65px`、`76px` 这类 magic number。
- 目录 active 状态可用左侧高亮线或文字颜色强化，避免过度动画。

验收标准：

- 滚动文章时能看到当前位置。
- 点击目录仍平滑滚动且不被 sticky header 遮挡。
- 没有标题的文章不渲染空目录。

## 建议 3.1：优化代码块、Markdown、Mermaid 特殊内容加载

当前 `components/NotionRenderer.js` 的代码块渲染会在第一次加载普通代码块时导入 `react-notion-x/third-party/code`，同时并发导入大量 Prism 语言包。这个策略覆盖面广，但对用户实际只看 Markdown、JS、Bash、Python 等少数语言的文章来说，初次代价偏高。

建议实现：

- 把 `Code` 的 dynamic component 移到模块作用域，避免在每个代码块 render 时重新创建 dynamic wrapper。
- 按实际语言懒加载 Prism 语法包，而不是一次性 `Promise.all` 导入所有语言。
- 先保留高频语言：`markup`、`javascript`、`typescript`、`jsx`、`tsx`、`bash`、`json`、`markdown`、`python`、`css`、`sql`、`yaml`。
- 低频语言走兜底高亮或按需补充，不在首批代码块加载时全量导入。
- Mermaid 继续保持 `ssr: false`，但给图表区域加 skeleton/loading，避免用户感觉卡死。
- 对文章页首屏尽量不要预加载 Mermaid、Tweet、PDF、Equation 等第三方块，只有出现对应 block 时再加载。

验收标准：

- 普通 Markdown/code 文章首次打开不再明显卡顿。
- Mermaid、PDF、Tweet 这类重块仍能正常渲染。
- 不因为删语言包导致常见代码高亮失效。

## 建议 4：优化 Notion 内容排版密度

`styles/notion.css` 已经覆盖了标题、callout、bookmark、code 等样式，但整体 spacing 较统一，长文章里段落、标题、引用、callout 的情绪差异不够明显。

建议实现：

- 增大 H1/H2/H3 之间的节奏差，让章节边界更明显。
- 强化 blockquote 和 callout 的视觉语义，例如 quote 更像“旁注”，callout 更像“信息卡”。
- 代码块可增加更清晰的背景、边框和横向滚动体验。
- 图片 caption 可稍微收窄字号和色彩，避免与正文竞争。

验收标准：

- 长文快速滚动时能明显识别章节。
- 明暗模式下 callout、code、quote 对比度足够。
- 不破坏 react-notion-x 默认内容结构。

## 建议 5：搜索页增加结果统计、清除按钮和更友好的空状态

`layouts/search.js` 当前搜索可用，但反馈比较少。用户输入后不知道匹配数量，也没有一键清空。空状态只有 `No posts found.`，略显冷。

建议实现：

- 输入框下方展示结果数量，例如 `找到 6 篇文章`。
- 输入框右侧在有内容时显示清除按钮，空内容时显示搜索图标。
- 空状态加入说明和重置按钮。
- 对 tag 页面展示当前标签上下文，例如 `#React 下的文章`。

验收标准：

- 用户每次输入都能知道当前结果范围。
- 空结果不让人误以为页面坏了。
- 标签页和全局搜索的语义区别清楚。

## 建议 5.1：隐藏 RSS 入口，保留旧链接

你已确认 RSS 不需要作为可见入口，但为了兼容旧链接，保留 `/feed` 页面，只隐藏导航与 head 自动发现。

建议实现：

- 从 `components/Header.js` 的导航 links 中隐藏/移除可见 RSS 项。
- 从 `pages/_document.js` 删除 `<link rel="alternate" type="application/rss+xml">`。
- 保留 `pages/feed.js`，旧链接仍能访问。
- 检查 `next-sitemap.config.js` 是否会生成 feed 相关链接。

验收标准：

- 导航栏不再出现 RSS。
- 页面 head 不再主动声明 RSS。
- 移动端导航更轻。

## 建议 6：统一设计 token，减少零散样式

当前 Tailwind 里只有 day/night 背景和字体扩展，组件里大量使用 `gray`、`blue`、`zinc`。这不算错，但后续想形成个性化主题会比较费劲。

建议实现：

- 在 `tailwind.config.js` 中增加语义色：`surface`、`muted`、`accent`、`border`。
- 在 `styles/globals.css` 中定义 CSS 变量，明暗模式分别赋值。
- focus ring 不一定固定蓝色，可改为主题 accent。
- 先从 Header、BlogPost、Search、TagItem 这些高频组件替换，不必一次性全量迁移。

验收标准：

- 后续换主题色时不需要逐个搜 Tailwind class。
- 明暗模式视觉一致性更好。
- 不引入大范围视觉回归。

## 建议 7：移动端导航降噪

`components/Header.js` 的导航在移动端横向空间有限，当前链接较多时会显得拥挤。标题在移动端隐藏是合理的，但导航仍可以更轻。

建议实现：

- 隐藏 RSS 入口后，小屏只保留首页、About、Search 等真正必要入口。
- 搜索可以保留为更明显的 icon button，因为它是高频入口。
- sticky header 增加更稳定的高度变量，和文章锚点共用。
- 减少 caret 的视觉干扰，或只在桌面端显示。

验收标准：

- 360px 宽度下导航不拥挤、不换行破坏布局。
- 常用入口仍然一眼可见。
- header 不遮挡文章锚点跳转。

## 建议 8：补齐页面状态设计

边缘状态目前偏模板化。`pages/[slug].js` fallback 直接返回 `null`，`pages/404.js` 只有简单标题。对静态博客来说，这些状态出现频率不高，但会影响完整度。

建议实现：

- fallback 时显示文章骨架屏或简洁 loading。
- 404 页面增加返回首页、搜索入口和一句轻量说明。
- Footer 可加入站点说明或社交链接，但不再增加 RSS 二次入口。

验收标准：

- 慢网络或 ISR fallback 不出现白屏。
- 404 页面能引导用户继续浏览。
- Footer 不再只是版权和 Vercel 标识。

## 建议 9：微动效只用在“解释状态”的地方

当前大多数交互是颜色变化，稳但略平。可以加入少量有意义的动效，但避免装饰性过强。

建议实现：

- 首页文章卡片进入时轻微 stagger reveal。
- 搜索结果变化时只做非常轻的 opacity/translate，不做频繁弹跳。
- TOC active 状态使用高亮线平滑移动。
- 尊重 `prefers-reduced-motion`。

验收标准：

- 动效帮助理解层级，不拖慢阅读。
- 减少动态偏好开启时动效被关闭。
- 不引入额外动画库。

## 建议 10：维护性与小问题清理

审查时发现几个非视觉但会影响后续设计迭代的小点。

建议实现：

- `blog.config.js` 的 `notionPageId` 注释出现乱码，建议清理。
- `components/Post.js` 和 `components/TableOfContents.js` 中有 header 高度 magic number，建议抽成常量或 CSS 变量。
- `TableOfContents` 中锚点是 `<a>` 但没有 `href`，可以考虑改为 button 或补充语义。
- `pages/[slug].js` fallback 返回 `null`，建议补状态。

验收标准：

- 后续改 header 高度时不需要同步找多个数字。
- 控件语义更准确。
- 配置文件更干净。

## 建议 11：About 页面改造成简历风格

当前项目没有独立 `pages/about.js`。About 是 Notion 数据库里一条普通页面数据：`type = Page`、`slug = about`、`status = Published`，最后由 `pages/[slug].js` 和 `components/Post.js` 按普通文章渲染。

推荐实现路线：

- 在 `pages/[slug].js` 或 `Post` 中识别 `post.slug === 'about'`。
- 为 About 传入特殊 layout，例如 `layout="resume"` 或 `isAboutPage`。
- 新增 `components/AboutResume.js` 或 `components/AboutHeader.js`，只负责顶部个人信息、技能摘要、联系按钮等简历化区域。
- 下方继续渲染 Notion 正文，让你仍然可以在 Notion 里维护经历、项目和说明。
- 给 about 页面加专属 class，例如 `.resume-page .notion-h2`、`.resume-page .notion-callout`，把 Notion 块排成简历卡片感。

Notion 数据库应该这样填写：

| 字段 | 建议值 | 说明 |
| --- | --- | --- |
| `title` | `About` 或 `Ely` | 页面标题 |
| `slug` | `about` | Header 里的 About 链接会访问 `/about` |
| `type` | `Page` | 必须是 Page，不能是 Post |
| `status` | `Published` | 必须发布 |
| `date` | 任意已过去日期 | 当前过滤逻辑要求 `date <= new Date()` |
| `summary` | 一句话个人定位 | 可用于 SEO 和 About 顶部副标题 |
| `tags` | 可选 | About 页面不强依赖 |

Notion 正文建议结构：

- 顶部：一句个人介绍，例如 `Ely, builder / writer / designer of tiny useful systems.`
- `## Profile`：3 到 5 句个人定位，避免写成长自传。
- `## Skills`：用 bullet 分组，如 Frontend、Design、AI、Writing。
- `## Experience`：每段经历用 H3 写公司/角色，下一行写时间，再用 bullet 写结果。
- `## Projects`：每个项目用 H3 + 简短说明 + 链接。
- `## Education / Certificates`：可选，不强行占篇幅。
- `## Contact`：邮箱、GitHub、X/Twitter、作品链接。

更适合当前渲染器的 Notion 写法：

- 用 H2 作为简历大区块，H3 作为经历或项目卡片标题。
- 用 callout 写“当前状态 / Available for / Now”之类的醒目信息。
- 少用复杂嵌套数据库，因为当前 `styles/notion.css` 隐藏了部分 collection 行信息。
- 经历时间建议写在标题或第一行粗体里，例如 `2023 - Now · Product Engineer`。

验收标准：

- `/about` 明显区别于普通文章，更像个人简历/主页。
- 你仍然可以在 Notion 中维护内容，不需要每次改代码。
- 移动端简历区块不会过长或横向溢出。

## 建议 12：Ely favicon、背景标识与轻量 wordmark

当前 Header 使用 `favicon.png` 作为图标，识别度来自默认 favicon。建议围绕 `Ely` 做 favicon、Header 小标识和背景细节，让它体现“博主署名”，但不把首页改成自我介绍页。

建议实现：

- 新增 `public/ely-mark.svg`：主标识为 `Ely`，字形可偏柔和、略带液态连笔或圆角。
- Header 左侧优先保留轻量图标位，可显示 `E` 或紧凑 `Ely`，不要占据过多导航空间。
- favicon 可生成 `E` 或 `Ely` 的方形版本，明暗模式分别适配。
- 背景中可以弱化放置 `Ely` 的抽象字形、液态轮廓或模糊光斑，作为氛围而不是内容标题。
- 颜色建议使用低饱和青绿/墨蓝/暖白渐变，避免默认蓝紫科技感。
- 液态感只作为边缘高光或渐变，不要让文字难读。

验收标准：

- 24px 小尺寸仍能识别。
- 明暗模式都清楚。
- 和首页液态视觉语言一致。

## 优秀个人博客采样与可借鉴点

说明：以下是基于知名个人博客/作品站的设计模式采样，用于提炼优点，不是逐像素复刻。

| 参考对象 | 可借鉴优点 | 适合本项目的转化 |
| --- | --- | --- |
| Maggie Appleton | 手绘感、知识花园、文章像探索笔记 | About/首页可加入更个人的“正在研究什么”区域 |
| Josh W Comeau | 强交互感、讲解友好、细节动效克制 | 液态特效只用于解释层级，不做炫技背景 |
| Lee Robinson | 首页信息密度高、文章/项目/身份清楚 | 借鉴清晰层级，但本站不需要把首页改成个人介绍页 |
| Dan Abramov / Overreacted | 极简但文字强，阅读优先 | 文章页保持舒适宽度，不牺牲正文体验 |
| Simon Willison | 信息架构强，标签/搜索/归档实用 | 搜索页增加结果统计、标签上下文和空状态 |
| Tania Rascia | 教程型内容清晰，代码块可读性高 | 优先优化代码块加载和 Markdown 排版 |
| Rauno Freiberg | 细腻动效、空间感、产品气质 | 借鉴 subtle motion 和精致 hover，不复制暗黑玻璃风 |
| Brittany Chiang | 简历式个人站清晰，经历项目结构强 | About 可以采用左侧简介 + 右侧经历/项目的简历布局 |
| Max Böck | 可访问性好、文章组织清楚 | focus、语义按钮、reduce motion 要保留 |
| swyx | 个人品牌明确，内容入口丰富 | 首页可加入“精选文章 / 最近文章 / Now”模块 |

可采集成本站设计原则：

- 第一屏要保持博客阅读入口清楚，同时通过背景、favicon、Header 小标识凸显 `Ely` 是博主署名。
- 个人气质来自文案、排版和内容组织，不只来自装饰。
- 液态视觉只做氛围层，正文区域保持高对比和高可读。
- About 是第二首页，要比普通文章更结构化。
- 搜索和标签是知识库入口，不只是附属页面。
- 代码块体验是技术博客信任感的一部分，性能和可读性都要优先。

## 推荐执行顺序

1. 先做 P0：首页 Hero 液态气质、文章列表卡片、代码块/Markdown 加载优化、文章页阅读进度和目录 active。
2. 再做 P1：About 简历化、隐藏 RSS 入口、Ely favicon / wordmark、搜索反馈、视觉 token、移动端导航。
3. 最后做 P2：404/fallback/Footer 和维护性清理。

## 已确认的实现选择

- 液态视觉：墨水扩散 / 有机 blob。
- About 顶部：需要头像。
- RSS：仅隐藏入口，保留旧 `/feed` 链接。
- Ely 图标：偏现代圆角 sans。
