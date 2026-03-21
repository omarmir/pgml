const args = process.argv.slice(2)

if (args.length === 0) {
  console.error('Usage: bun run test:e2e:fast:spec -- <spec-or-args>')
  process.exit(1)
}

const subprocess = Bun.spawn([
  'bun',
  'run',
  'test:e2e',
  '--',
  ...args
], {
  stderr: 'inherit',
  stdin: 'inherit',
  stdout: 'inherit'
})

const exitCode = await subprocess.exited

process.exit(exitCode)
