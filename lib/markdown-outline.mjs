const ATX_HEADING = /^( {0,3})(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/

export function extractMarkdownHeadings (markdown) {
  const source = String(markdown || '').replace(/\r\n?/g, '\n')
  const headings = []
  const usedIds = new Map()
  let activeFence = null
  let offset = 0
  let lineNumber = 0

  for (const line of source.split('\n')) {
    lineNumber += 1
    const fence = line.match(FENCE_OPEN)
    if (activeFence) {
      if (
        fence &&
        fence[1][0] === activeFence.character &&
        fence[1].length >= activeFence.length &&
        !fence[2].trim()
      ) {
        activeFence = null
      }
      offset += line.length + 1
      continue
    }

    if (fence) {
      activeFence = {
        character: fence[1][0],
        length: fence[1].length
      }
      offset += line.length + 1
      continue
    }

    const heading = line.match(ATX_HEADING)
    if (heading) {
      const text = cleanHeadingText(heading[3] || '')
      if (text) {
        headings.push({
          id: createMarkdownHeadingId(text, usedIds),
          level: heading[2].length,
          text,
          line: lineNumber,
          position: offset + heading[1].length
        })
      }
    }
    offset += line.length + 1
  }

  return headings
}

export function createMarkdownHeadingId (text, usedIds = new Map()) {
  const base = slugifyHeadingText(text) || 'section'
  const count = usedIds.get(base) || 0
  usedIds.set(base, count + 1)
  return count === 0 ? base : `${base}-${count + 1}`
}

export function slugifyHeadingText (text) {
  return String(text || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/['"“”‘’]/g, '')
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100)
}

function cleanHeadingText (value) {
  return String(value || '')
    .replace(/[ \t]+#+[ \t]*$/, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .replace(/\\([\\`*{}\[\]()#+\-.!_>])/g, '$1')
    .trim()
}