import svelte from 'rollup-plugin-svelte';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

export default {
  input: 'src/NostrEmbed.svelte', // Entry point is the Svelte component
  output: [
    {
      file: 'public/nostr-embed.js', // Output file for your CDN
      format: 'iife', // Immediately Invoked Function Expression
      name: 'NostrEmbed', // Global variable name (optional)
    },
    {
      file: 'dist/nostr-embed.min.js', // Output file for your CDN
      format: 'iife', // Immediately Invoked Function Expression
      name: 'NostrEmbed', // Global variable name (optional)
      plugins: [terser()]
    }, 
  ], 
  plugins: [
    svelte({
      // Enable custom element mode
      compilerOptions: {
        customElement: true,
      },
    }),
    resolve(),
    commonjs(),
  ],
};