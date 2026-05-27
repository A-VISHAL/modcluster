# 🛡️ ModPulse AI
### The Reddit Moderation Command Center

*Shift handovers. Jury verdicts. Programmable rules. All in one place.*

Built with Devvit · TypeScript · React · Redis

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

## ▶ See It In Action

📺 **[VIDEO PLACEHOLDER — How ModPulse Works]**
*A 2-minute walkthrough of shift handovers, jury verdicts, and rule deployment.*
*→ Replace this with your YouTube link once recorded.*

---

## Core Features

### 🔁 Shift Handover
*Hospital-style moderation continuity.*

Outgoing mods submit active situations, watchlists, and escalation notes. Incoming mods open ModPulse and see exactly where things stand — latest context, unresolved situations, users to watch. No DMs. No guesswork.

> 📸 Screenshot: `docs/screenshots/shift-handover.png`
![Shift Handover](docs/screenshots/shift-handover.png)

---

### ⚖️ Jury Verdict Board
*Borderline calls decided by consensus, not whoever clicked fastest.*

Flag a post → cite a rule → open a timed jury case. Mods vote Remove / Approve / Abstain. Action only triggers when the team agrees. Every verdict is permanently logged with rule citations.

> 📸 Screenshot: `docs/screenshots/jury-board.png`
![Jury Verdict Board](docs/screenshots/jury-board.png)

---

### 🤖 Programmable Moderation Rules
*AutoModerator, but you can actually understand it.*

Build rules with a visual editor or raw YAML. Conditions include account age, karma, posting frequency, toxicity signals, and ban-evasion patterns. Actions range from queue filter to temp ban.

> 📸 Screenshot: `docs/screenshots/mod-rules.png`
![Programmable Rules](docs/screenshots/mod-rules.png)

---

### 🧪 Live Rule Testing
*Deploy nothing you haven't already seen work.*

Test any rule against live subreddit content before it goes live. See exactly which posts match, why they matched, and what action would fire.

> 📸 Screenshot: `docs/screenshots/rule-testing.png`
![Live Rule Testing](docs/screenshots/rule-testing.png)

---

### ⚠️ Conflict Detection
*Your moderation logic, validated before it does damage.*

ModPulse catches duplicate rules, conflicting logic, dangerous removals, and shadowed conditions. Risk scoring surfaces problems before deployment.

> 📸 Screenshot: `docs/screenshots/conflict-detection.png`
![Conflict Detection](docs/screenshots/conflict-detection.png)

---

### 🔄 One-Click Deploy + Rollback
*Every deployment is reversible.*

Redis snapshots on every deploy. If something breaks, roll back instantly. Automation finally has an undo button.

> 📸 Screenshot: `docs/screenshots/deploy-rollback.png`
![Deploy and Rollback](docs/screenshots/deploy-rollback.png)

---

### 📊 Operational Dashboard
*Live moderation command center.*

Queue pressure, rule analytics, repeated offenders, flagged users, workload, deployment history — all surfaced as explainable insights so moderators understand community health without reading raw logs.

> 📸 Screenshot: `docs/screenshots/dashboard.png`
![Dashboard](docs/screenshots/dashboard.png)

---

## How It Works

**Shift Handover**
1. Outgoing mod opens Subreddit Mod Menu → clicks "End Shift & Hand Over"
2. Fills in open situations, users to watch, priority posts, and notes
3. ModPulse writes context to Redis — persists across sessions
4. Incoming mod clicks "View Current Handover" and sees everything instantly

**Jury Verdict Board**
1. Mod flags a borderline post → selects rule violated → sets vote deadline
2. All mods see the case and cast votes: Remove / Approve / Abstain
3. ModPulse checks threshold after every vote
4. 2× Remove → `reddit.remove()` fires automatically
5. 2× Approve → `reddit.approve()` fires automatically
6. No consensus by deadline → escalated via modmail

**Rule Deployment**
1. Mod builds a rule in the visual editor or YAML
2. ModPulse validates for conflicts, duplicates, and risk
3. Rule tested against live subreddit content
4. One-click deploy — Redis snapshot created
5. If anything breaks → instant rollback

---

## Architecture

| Layer | Stack |
|---|---|
| **Frontend** | React · Devvit Web · TypeScript · Vite |
| **Backend** | Devvit Handlers · Triggers · Scheduler · Hono · Reddit API |
| **Storage** | Redis — `handover:{subId}:*` · `jury:{subId}:*` · `rules:{subId}:*` · `activity:{subId}:*` |

Fully Devvit-native. No external database. No infrastructure to manage.

---

## Quick Start

```bash
# Install Devvit CLI
npm install -g devvit

# Clone and install
git clone https://github.com/your-org/modpulse-ai
cd modpulse-ai && npm install

# Log in
devvit login

# Develop locally
devvit dev r/yourTestSubreddit

# Deploy
devvit upload
```

---

*ModPulse AI — Built for mod teams who take moderation seriously.*
