const ATX_HEADING = /^( {0,3})(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/

export function extractMarkdownHeadings (markdown) {
  const source = String(markdown || '').replace(/\r\n?/g, '\n')
  const headings = []
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

function cleanHeadingText (value) {
  return String(value || '')
    .replace(/[ \t]+#+[ \t]*$/, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .replace(/\\([\\`*{}\[\]()#+\-.!_>])/g, '$1')
    .trim()
}