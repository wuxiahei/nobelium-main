# Ely Blog

A personal blog powered by Notion, Next.js, Tailwind CSS, and Vercel.

This project keeps Notion as the writing backend while adding a more personal visual layer: Ely wordmark, organic blob background, article cards, an About resume page, and optimized code/Markdown rendering.

## Features

- Notion database driven posts and pages
- Personal homepage with lightweight organic visual effects
- About page rendered as a resume-style profile when `slug` is `about`
- Search and tag filtering
- Article reading progress and active table of contents
- RSS feed kept at `/feed` for compatibility, but hidden from visible navigation
- Syntax highlighting optimized to load common code languages on demand

## Notion Setup

Create or keep a Notion database with these properties:

| Property | Type | Notes |
| --- | --- | --- |
| `title` | Title | Post or page title |
| `slug` | Text | URL slug, for example `about` |
| `status` | Select | Use `Published` for visible content |
| `type` | Select | Use `Post` for blog posts, `Page` for standalone pages |
| `date` | Date | Publish date |
| `summary` | Text | Used for SEO, cards, and About intro |
| `tags` | Multi-select | Optional article tags |

For the About page, create a row with:

- `slug`: `about`
- `type`: `Page`
- `status`: `Published`
- `summary`: a short personal description

The page body can use H2 sections such as `Profile`, `Skills`, `Experience`, `Projects`, and `Contact`.

## Development

```bash
pnpm install
pnpm dev
```

## Build

```bash
pnpm build
```

## Environment Variables

- `NOTION_PAGE_ID`: required when using a public Notion database/page.
- `NOTION_ACCESS_TOKEN`: optional for private Notion access.
- `NOTION_API_KEY`, `NOTION_DATABASE_ID`, `NOTION_DATA_SOURCE_ID`: optional official Notion API path.

## Configuration

Edit `blog.config.js` for site title, author, language, theme, analytics, comments, and Notion settings.

## License

MIT.
