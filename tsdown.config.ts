import { defineConfig } from 'tsdown'

export default defineConfig({
  outDir: './dist',
  tsconfig: './tsconfig.json',
  format: ['cjs', 'esm'],
  dts: true,
  inputOptions: {
    resolve: { mainFields: ['module', 'main'] },
  },
})
