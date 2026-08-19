import Container from '@/components/Container'
import AIWorkspace from '@/components/AIWorkspace'

export default function AIPage () {
  return (
    <Container
      title="AI 工作间 · Ely"
      description="独立的本地 AI 会话工作间，会话仅保存在当前浏览器。"
      fullWidth
    >
      <AIWorkspace />
    </Container>
  )
}
