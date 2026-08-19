# Nobelium Blog

A personal blog powered by Notion, Next.js, Tailwind CSS, and Vercel.

This project uses Notion as the writing backend while adding a more personal visual layer: article cards, an About resume page, and optimized code/Markdown rendering.

## Features

- Notion database driven posts and pages
- About page rendered as a resume-style profile when `slug` is `about`
- Search and tag filtering
- Article reading progress and active table of contents
- RSS feed at `/feed`
- Syntax highlighting optimized to load common code languages on demand

## Notion Setup

### 1. Create a Notion Integration

1. Go to [https://www.notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click "New integration"
3. Give it a name (e.g., "Nobelium Blog")
4. Select your workspace
5. Copy the "Internal Integration Secret" — this is your `NOTION_API_KEY`

### 2. Share Your Database with the Integration

1. Open your Notion database
2. Click the `...` menu (top right) → "Connections" → select your integration

### 3. Get Your Database ID

1. Open your Notion database in a browser
2. The URL looks like: `https://notion.so/Your-Workspace/DATABASE_ID?v=...`
3. Copy the 32-character hex string (the DATABASE_ID)

### 4. Database Properties

Your Notion database should have these properties:

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

## Environment Variables

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Required variables:

| Variable | Description |
| --- | --- |
| `NOTION_API_KEY` | Notion integration token (recommended) |
| `NOTION_DATABASE_ID` | Your Notion database ID |

Legacy variables (only if NOTION_API_KEY is not configured):

| Variable | Description |
| --- | --- |
| `NOTION_PAGE_ID` | Notion page ID for unofficial API access |
| `NOTION_ACCESS_TOKEN` | Notion access token for unofficial API |

## Development

```bash
pnpm install
cp .env.example .env  # then fill in your values
pnpm dev
```

## Build

```bash
pnpm build
```

## Configuration

Edit `blog.config.js` for site title, author, language, theme, analytics, comments, and Notion settings.

## License

MIT.
