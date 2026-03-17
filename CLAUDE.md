# Coachvickk Sports Model - Claude Code Configuration

## Installed Skills & Tools

### gstack (garrytan/gstack)
Workflow skills for Claude Code. Installed at `~/.claude/skills/gstack`.

Available slash commands:
- `/plan-ceo-review` - Founder/product review (decides what to build)
- `/plan-eng-review` - Tech lead review (decides how to build)
- `/plan-design-review` - Design review
- `/review` - Code review
- `/ship` - One-command shipping
- `/browse` - Browser automation (requires Playwright Chromium)
- `/qa` - QA testing with screenshots
- `/setup-browser-cookies` - Import browser sessions
- `/retro` - Engineering retrospective
- `/document-release` - Post-ship documentation
- `/gstack-upgrade` - Upgrade gstack

### CLI-Anything (HKUDS/CLI-Anything)
Makes any GUI software agent-native via CLI generation. Installed at `~/.claude/plugins/cli-anything`.

Available commands:
- `/cli-anything:cli-anything <path>` - Generate CLI harness for software
- `/cli-anything:refine <path>` - Expand existing CLI
- `/cli-anything:test <path>` - Run test suites
- `/cli-anything:validate <path>` - Verify compliance
- `/cli-anything:list` - Discover available CLI tools

### GSD v2 (gsd-build/gsd-2)
Autonomous agent CLI for long-running tasks. Installed globally via `npm install -g gsd-pi`.

Run `gsd` to start. Available commands:
- `/gsd` - Step mode (one task at a time)
- `/gsd auto` - Fully autonomous execution
- `/gsd discuss` - Architecture discussions
- `/gsd status` - Progress dashboard
- `/gsd queue` - Queue future milestones
- `/gsd prefs` - Model selection and timeouts

## Project

This is a static web PWA (Progressive Web App) deployed via GitHub Pages.
