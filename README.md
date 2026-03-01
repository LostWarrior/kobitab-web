# KobiTab Public Web Project

This is a separate web project for the KobiTab public download hub.

## Purpose

- `/`: public release hub with package downloads for `kobitab.com`.
- `/download/`: dedicated macOS install page with DMG + Homebrew guidance.
- Everything else (docs/source details) stays on GitHub.

## Release Automation

GitHub Actions deploys this project automatically to GitHub Pages when:

- commits are pushed to `main` with site changes,
- workflow is manually dispatched.

Release links and DMG links always resolve to the latest KobiTab app release (`LostWarrior/Kobitab`).

## Local Build

From repo root:

```bash
npm run build
```

Output:

- `dist`

## Domain

`CNAME` is set to `kobitab.com`.

Configure DNS so:

- `kobitab.com` points to GitHub Pages,
- optional `www.kobitab.com` CNAME points to the same target.

## Homebrew Install

```bash
brew tap LostWarrior/kobitab
brew install kobitab
```

Direct cask URL:

```bash
brew install --cask https://kobitab.com/download/homebrew/kobitab.rb
```
