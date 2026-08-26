import * as assets from "hanami-assets";

// The rule editor is a React island: a node graph is real client-side state
// (dragging, edges, zoom) and hand-rolling it in vanilla JS is weeks of work
// for a worse result. Everything else on the site stays server-rendered.
await assets.run({
  esbuildOptionsFn: (args, options) => ({
    ...options,
    loader: {...options.loader, ".jsx": "jsx"},
    jsx: "automatic",
  }),
});
