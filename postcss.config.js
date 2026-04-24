// Required so Next.js / Turbopack runs the Tailwind + Autoprefixer plugins
// when compiling globals.css. Without this file Turbopack ships the raw
// `@tailwind base/components/utilities` directives to the browser and every
// utility class (text-3xl, max-w-3xl, mx-auto, px-6, …) silently no-ops.
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
