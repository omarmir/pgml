import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const rootDirectory = process.cwd()
const vueRouterPackageJsonPath = path.join(rootDirectory, 'node_modules', 'vue-router', 'package.json')
const vueRouterVolarDirectory = path.join(rootDirectory, 'node_modules', 'vue-router', 'volar')
const compatRuntimePath = path.join(vueRouterVolarDirectory, 'sfc-route-blocks.cjs')
const compatTypesPath = path.join(vueRouterVolarDirectory, 'sfc-route-blocks.d.cts')

const compatRuntimeSource = 'module.exports = require(\'unplugin-vue-router/volar/sfc-route-blocks\')\n'
const compatTypesSource = 'export * from \'unplugin-vue-router/volar/sfc-route-blocks\'\n'

const patchVueRouterVolarCompat = async () => {
  const rawPackageJson = await readFile(vueRouterPackageJsonPath, 'utf8')
  const packageJson = JSON.parse(rawPackageJson)
  const nextExports = {
    ...(packageJson.exports || {}),
    './volar/sfc-route-blocks': {
      types: './volar/sfc-route-blocks.d.cts',
      default: './volar/sfc-route-blocks.cjs'
    }
  }

  packageJson.exports = nextExports

  await mkdir(vueRouterVolarDirectory, {
    recursive: true
  })
  await writeFile(compatRuntimePath, compatRuntimeSource, 'utf8')
  await writeFile(compatTypesPath, compatTypesSource, 'utf8')
  await writeFile(vueRouterPackageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8')
}

await patchVueRouterVolarCompat()
