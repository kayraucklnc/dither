# Contributing

Thanks for helping. Dither is small on purpose. These notes keep it that way.

## Getting set up

```bash
make setup      # app dependencies (Node.js 24+)
make firmware   # firmware image for the app to flash (needs uv)
make dev        # http://localhost:5173 in Chrome or Edge
make test       # everything: app tests, types, firmware host tests, golden images
```

You don't need a panel to work on most things. The simulator in the app uses
the same drawing code as the panel.

## The one rule

[`docs/format.md`](docs/format.md) is the contract, and it's implemented twice:
in TypeScript for the simulator (`app/src/runtime/`) and in C++ for the panel
(`firmware/src/runtime/`). If a change affects how anything is drawn,
formatted or decided, update the spec, both implementations and the golden
images in the same pull request. `make test` fails if the two renderers
disagree on a single pixel.

After an intended visual change, run `make goldens`, look at what changed in
`spec/fixtures/`, then run `make test`.

## Adding a widget

A widget is one folder in `app/src/extensions/`, and the firmware doesn't
change. [docs/extensions.md](docs/extensions.md) walks through it. Some
things to keep in mind:

- Lay it out for the worst case, not the sample. The real values arrive after
  drawing.
- Draw it so it reads from across a room. One number that matters is better
  than a scatter of labels.
- If it prints a character the font doesn't have (a new currency sign, say),
  add the character to the font generator. See [`tools/README.md`](tools/README.md).

## Adding a board

A board is an entry in `app/src/device/boards.ts` plus a firmware build. Open
an issue first so we can talk about the display driver.

## Pull requests

- Keep each one to a single change, with a short explanation of why.
- Use conventional commit messages: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.
- Never commit API keys, Wi-Fi passwords or project files that contain them.
