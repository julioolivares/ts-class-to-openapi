import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: './src/index.ts',
  outDir: './dist',
  tsconfig: './tsconfig.json',
  format: ['cjs', 'esm'],
  dts: true,
  failOnWarn: true,
  clean: true,
})
