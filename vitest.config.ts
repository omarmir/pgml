import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'

const isCoverageRun = process.argv.includes('--coverage')

export default defineConfig({
  test: {
    maxWorkers: isCoverageRun ? 1 : undefined,
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/unit/*.{test,spec}.ts'],
          environment: 'node'
        }
      },
      await defineVitestProject({
        test: {
          name: 'nuxt',
          include: ['test/nuxt/*.{test,spec}.ts'],
          environment: 'nuxt',
          environmentOptions: {
            nuxt: {
              rootDir: fileURLToPath(new URL('.', import.meta.url)),
              domEnvironment: 'happy-dom'
            }
          }
        }
      })
    ],
    coverage: {
      clean: true,
      exclude: [
        'app.config.ts',
        'app.vue',
        'app/assets/**',
        'app/components/**/*.vue',
        'app/composables/usePrimaryNavigation.ts',
        'app/composables/useStudioEditorLayout.ts',
        'app/composables/useStudioHeaderState.ts',
        'app/pages/**/*.vue',
        'app/utils/computer-files.ts',
        'app/utils/diagram-gpu-scene.ts',
        'app/utils/diagram-spatial-index.ts',
        'app/utils/pg-dump-import.ts',
        'app/utils/pgml-export-preferences.ts',
        'app/utils/studio-workspace.ts'
      ],
      include: [
        'app/composables/**/*.ts',
        'app/stores/**/*.ts',
        'app/utils/**/*.ts'
      ],
      provider: 'v8',
      reportsDirectory: './coverage'
    }
  }
})
