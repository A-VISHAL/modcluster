<div align="center">

<pre>
███╗   ███╗ ██████╗ ██████╗ ██████╗ ██╗   ██╗██╗     ███████╗███████╗
████╗ ████║██╔═══██╗██╔══██╗██╔══██╗██║   ██║██║     ██╔════╝██╔════╝
██╔████╔██║██║   ██║██║  ██║██████╔╝██║   ██║██║     ███████╗█████╗
██║╚██╔╝██║██║   ██║██║  ██║██╔═══╝ ██║   ██║██║     ╚════██║██╔══╝
██║ ╚═╝ ██║╚██████╔╝██████╔╝██║     ╚██████╔╝███████╗███████║███████╗
╚═╝     ╚═╝ ╚═════╝ ╚═════╝ ╚═╝      ╚═════╝ ╚══════╝╚══════╝╚══════╝
</pre>

### **The Reddit Moderation Command Center**

*Shift handovers. Jury verdicts. Programmable rules. All in one place.*

<br>

<a href="https://developers.reddit.com/docs/devvit">
  <img src="https://img.shields.io/badge/Built%20with-Devvit-FF4500?style=for-the-badge&logo=reddit&logoColor=white">
</a>

<a href="https://www.typescriptlang.org/">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white">
</a>

<a href="https://redis.io/">
  <img src="https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white">
</a>

<a href="https://react.dev/">
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB">
</a>

</div>

---

<div align="center">

<a href="https://youtu.be/s8XZ3z1VhNk" target="_blank">
  <img src="https://img.youtube.com/vi/s8XZ3z1VhNk/maxresdefault.jpg" width="700" alt="How ModPulse Works">
</a>

<br>

<em>A 1-minute walkthrough of shift handovers, jury verdicts, and rule deployment.</em>

</div>

---

## The Problem

Moderation is a team sport. The tools aren't built that way.

| Pain Point | What Actually Happens |
|---|---|
| **Context loss** | Mod A logs off. Mod B starts from scratch. Same user investigated twice. |
| **Solo decisions** | One mod removes a borderline post. No audit trail. Appeals go nowhere. |
| **Risky automation** | YAML copied blindly. Rules deployed untested. Subreddit breaks. |

ModPulse fixes all three.

---

## Core Features

### 🔁 Shift Handover
> *Hospital-style moderation continuity.*

Outgoing mods submit active situations, watchlists, and escalation notes. Incoming mods open ModPulse and see exactly where things stand. No DMs. No guesswork.

---

### ⚖️ Jury Verdict Board
> *Borderline calls decided by consensus, not whoever clicked fastest.*

Flag a post → cite a rule → open a timed jury case. Mods vote Remove / Approve / Abstain. Action only triggers when the team agrees. Every verdict is permanently logged.

---

### 🤖 Programmable Moderation Rules
> *AutoModerator, but you can actually understand it.*

Build rules with a visual editor or raw YAML. Conditions include account age, karma, posting frequency, toxicity signals, ban-evasion patterns, and more. Actions range from queue filter to temp ban.

---

### 🧪 Live Rule Testing
> *Deploy nothing you haven't already seen work.*

Test any rule against live subreddit content before it goes live. See exactly which posts match, why they matched, and what action would fire.

---

### ⚠️ Conflict Detection
> *Your moderation logic, validated before it does damage.*

ModPulse catches duplicate rules, conflicting logic, dangerous removals, and shadowed conditions. Risk scoring surfaces problems before deployment.

---

### 🔄 One-Click Deploy + Rollback
> *Every deployment is reversible.*

Redis snapshots on every deploy. If something breaks, roll back instantly. Automation finally has an undo button.

---

## Architecture

```
Frontend          Backend              Storage
─────────         ────────             ───────
React             Devvit Handlers      Redis
Devvit Web        Devvit Triggers        handover:{subId}:*
TypeScript        Devvit Scheduler       jury:{subId}:*
Vite              Hono Routing           rules:{subId}:*
                  Reddit API             activity:{subId}:*
```

Fully Devvit-native. No external database. No infrastructure to manage.

---

## Quick Start

```bash
# Install Devvit CLI
npm install -g devvit

# Clone and install
git clone https://github.com/your-org/modpulse-ai
cd modpulse-ai && npm install

# Develop locally
devvit playtest r/your_test_subreddit

# Deploy
devvit upload
```

---

<div align="center">

**Built for mod teams who take moderation seriously.**

*ModPulse AI — Devvit-native · Redis-backed · Open coordination*

</div>
