import { useConfig } from '@/lib/config'
import Vercel from '@/components/Vercel'

const Footer = ({ fullWidth }) => {
  const BLOG = useConfig()

  const d = new Date()
  const y = d.getFullYear()
  const from = +BLOG.since

  return (
    <div
      className={`m-auto mt-10 w-full flex-shrink-0 text-gray-500 transition-all dark:text-gray-500 ${
        !fullWidth ? 'max-w-3xl px-4 sm:px-6' : 'px-4 md:px-24'
      }`}
    >
      <hr className="border-gray-200 dark:border-gray-800" />
      <div className="my-5 text-sm leading-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p>
            &copy; {BLOG.author} {from === y || !from ? y : `${from} - ${y}`}
          </p>
          <Vercel />
        </div>
      </div>
    </div>
  )
}

export default Footer
