import { hashAdminPassword } from '../lib/server/admin-auth.mjs'

const password = process.argv.slice(2).join(' ') || process.env.ADMIN_PASSWORD

if (!password) {
  console.error('Usage: pnpm admin:hash-password "your-password"')
  console.error('Or set ADMIN_PASSWORD in the current shell and run the command without an argument.')
  process.exit(1)
}

console.log(hashAdminPassword(password))
