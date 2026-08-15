import { defineConfig } from "astro/config";

// The deployed site lives under a path (github.io/<repo>/), not at a domain
// root. Two ways to survive that: bake the repo name into every absolute URL
// via `base`, or emit relative URLs that don't care where the site is mounted.
//
// Relative wins here, because CI's links check crawls `dist/` as if it were
// the site root — a baked-in `/<repo>/` prefix 404s against that even though
// it would resolve once deployed. Relative URLs are correct in both places.
//
// `format: "file"` is what makes relative URLs uniform: every page lands at
// the top level of dist/ (menu.html, not menu/index.html), so "./menu.html"
// means the same thing from every page. With directory format each page sits
// one level deeper and would need its own "../" prefix.
export default defineConfig({
  build: { format: "file", assetsPrefix: "." },
});
