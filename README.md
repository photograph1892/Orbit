# Orbit

Orbit is a React + Vite prototype for an AI emotional memory device.

It lets a user record a photo, room sound, and mood, then simulates an AI-generated instrumental BGM as an LP-style archive. The app supports localStorage records, playlist saving, sharing links, replay UI, and a standalone `Orbit-share.html` demo file.

## Run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## GitHub Pages

This project is a Vite app, so the root `index.html` is a source entry file,
not a finished static page. GitHub Pages should deploy the built `dist` output.

The included GitHub Actions workflow builds the app on pushes to `main` or
`master` and publishes `dist` to GitHub Pages. In the repository settings, set
Pages to use **GitHub Actions** as the source.

To also regenerate the standalone share page:

```bash
npm run build:share
```
