# 🛡️ ModPulse — The Mod Team Command Center

<div align="center">

<!-- Banner Image -->
<img src="https://placehold.co/1200x400/1E293B/FFFFFF?text=ModPulse+Banner" alt="ModPulse Banner" width="100%" />

<br/>

<p align="center">
  <img src="https://placehold.co/250x140/FF4500/FFFFFF?text=Devvit" alt="Devvit Badge" />
  <img src="https://placehold.co/250x140/3178C6/FFFFFF?text=TypeScript+5.0" alt="TypeScript Badge" />
  <img src="https://placehold.co/250x140/DC382D/FFFFFF?text=Redis+Powered" alt="Redis Badge" />
  <img src="https://placehold.co/250x140/22C55E/FFFFFF?text=MIT+License" alt="License Badge" />
  <img src="https://placehold.co/250x140/FF4500/FFFFFF?text=Hackathon+2025" alt="Hackathon Badge" />

**The first Reddit Devvit app that treats the mod team as a team —**  
with shift-aware context handover and collaborative multi-mod verdict boards  
to eliminate dropped context, inconsistent rulings, and mod burnout.

[View on Devvit App Directory](#) · [Report Bug](../../issues) · [Request Feature](../../issues)

</div>

---

## 📺 Demo

<div align="center">

<!-- YouTube Demo Placeholder -->
[![ModPulse Demo Video](assets/demo-thumbnail.png)](https://youtube.com/watch?v=PLACEHOLDER)

> Click to watch the full walkthrough on YouTube

</div>

---

## 📋 Table of Contents

- [Project Overview](#-project-overview)
- [The Problem](#-the-problem)
- [Features](#-features)
- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [Redis Schema](#-redis-schema)
- [Devvit API Usage](#-devvit-api-usage)
- [Project Structure](#-project-structure)
- [Installation & Setup](#-installation--setup)
- [How It Works](#-how-it-works)
- [Security](#-security)
- [Community Impact](#-community-impact)
- [Roadmap](#-roadmap)
- [License](#-license)

---

## 🧩 Project Overview

ModPulse is a Devvit-native moderation command center for Reddit that solves two of the most universally painful problems in multi-mod subreddit management: **context loss between mod sessions** and **inconsistent unilateral post rulings**.

| Capability | Description |
|---|---|
| 🔁 Shift Handover | Structured mod-to-mod context cards with open situations, watchlists, and priority threads |
| ⚖️ Jury Verdict Board | Multi-mod vote queue for borderline posts — 2-of-3 consensus before removal |
| 👁️ User Watchlist | Persistent per-sub user flagging with reason tracking across all mod sessions |
| 📜 Handover History | Last 20 shift notes browseable from the mod menu |
| ✅ Auto-Resolve | Jury board auto-removes or auto-approves when vote threshold is reached |
| 🗂️ Verdict Log | Every jury decision permanently logged with voter identities and rule citations |
| 🔒 Security Scoping | All actions subreddit-scoped with full audit logging |

---

## 🔥 The Problem

### Problem 1 — Mod Shift Handover

Large subreddits have mod teams across multiple time zones. When Mod A finishes their shift and Mod B comes online, there is **zero built-in context transfer**. Mod B starts completely blind:

- Which users are currently causing trouble?
- Which posts are pending a decision?
- Is there an ongoing drama thread that needs watching?
- Did someone just get a warning that's one step from a ban?

This causes mods to make decisions without context, re-investigate situations already handled, and miss escalating problems entirely.

> **ModPulse fixes this** with a hospital-style shift handover card — the outgoing mod fills a structured form before logging off, and the incoming mod sees it the moment they open mod tools.

### Problem 2 — Jury Verdict Board

Right now, one mod can unilaterally remove any post. This creates three serious problems:

- **Inconsistency** — Mod A keeps a post. Mod B removes the same type of post. Users notice and complain.
- **Disputes** — Users appeal removals, teams fight internally, ban appeals flood the queue.
- **Accountability gaps** — No record of why a borderline call was made.

> **ModPulse fixes this** with the Jury Verdict Board — any mod can flag a post as "borderline" and send it to a timed vote queue. Two out of three mods must agree before the post is actioned. Every verdict is logged.

---

## ✨ Features

### 🔁 Mod Shift Handover

**For the outgoing mod:**
- One-click "End Shift & Hand Over" from the subreddit mod menu
- Structured form: open situations, users to watch, priority posts, freeform notes
- Auto-timestamps and attaches the mod's username
- Optionally pings the next mod on shift via DM

**For the incoming mod:**
- "View Current Handover" shows the latest card instantly
- Displays all open watchlist items from previous sessions (not just the last note)
- Handover history — browse the last 20 shift notes without leaving Reddit

**Persistent across sessions:**
- The watchlist persists indefinitely until a mod explicitly clears a user
- Handover history is a Redis list, trimmed to 20 entries automatically

---

### ⚖️ Jury Verdict Board

**For the flagging mod:**
- "Send to Jury (2-of-3 vote)" in the post mod menu
- Select the rule potentially violated and set a vote deadline (1–48 hours)
- Post is immediately visible in the jury queue to all mods

**For voting mods:**
- "Cast Jury Vote" on any queued post — Remove / Approve / Abstain
- See who flagged it, what rule they cited, and time until deadline
- Real-time vote tally visible to all mods

**Auto-resolution:**
- 2× Remove votes → post automatically removed
- 2× Approve votes → post automatically approved
- Deadline with no consensus → escalation modmail sent to senior mods

**Permanent verdict log:**
- Every resolved jury case logged with post ID, rule cited, voter list, and outcome
- Builds institutional rule precedent over time

---

## 🏗️ Architecture

```
+-------------------------------------------------------+
|                     REDDIT CLIENT                     |
|                                                       |
|   Subreddit Mod Menu   |   Post Mod Menu              |
|   "End Shift"          |   "Send to Jury"             |
|   "View Handover"      |   "Cast Vote"                |
+---------------------------+---------------------------+
                            |
                     Devvit Runtime
                            |
+---------------------------v---------------------------+
|                    MODPULSE APP                       |
|                                                       |
|   +-----------------+   +-------------------------+  |
|   | HANDOVER MODULE |   |  JURY BOARD MODULE      |  |
|   | addMenuItem ×3  |   | addMenuItem ×2          |  |
|   | addForm         |   | addForm (vote)          |  |
|   | ModAction trig  |   | Scheduler (jury-expiry) |  |
|   +-----------------+   +-------------------------+  |
|                                                       |
|   +-------------------------------------------------+ |
|   |              REDIS STORAGE LAYER                | |
|   |  handover:{subId}:active        STRING (JSON)   | |
|   |  handover:{subId}:history       LIST             | |
|   |  handover:{subId}:watchlist     HASH             | |
|   |  jury:{subId}:queue             ZSET (by expiry) | |
|   |  jury:{subId}:verdict:{postId}  HASH             | |
|   |  jury:{subId}:log               LIST             | |
|   +-------------------------------------------------+ |
+-------------------------------------------------------+
                            |
              Reddit Data API (via context.reddit)
                            |
+---------------------------v---------------------------+
|  removePost | approvePost | sendModMail | sendDM      |
+-------------------------------------------------------+
```

---

## 🛠️ Tech Stack

| Technology | Role |
|---|---|
| **Devvit** | Reddit's native developer platform — all app logic runs here |
| **TypeScript** | Type-safe app code with Devvit SDK |
| **Redis** (via Devvit) | All persistent state — no external DB needed |
| **Devvit Scheduler** | Jury deadline enforcement |
| **Devvit Triggers** | ModAction, PostCreate event listeners |
| **Reddit Modmail API** | Escalation alerts |

---

## 🗃️ Redis Schema

### Shift Handover

| Key | Type | Value |
|---|---|---|
| `handover:{subId}:active` | STRING | JSON HandoverNote `{author, ts, situations, watchlist[], priorityPosts, notes}` |
| `handover:{subId}:history` | LIST | lPush on each submit, lTrim 20 |
| `handover:{subId}:watchlist` | HASH | `userId → reason` — persists until explicitly cleared |

### Jury Verdict Board

| Key | Type | Value |
|---|---|---|
| `jury:{subId}:queue` | ZSET | `postId → deadline epoch` |
| `jury:{subId}:verdict:{postId}` | HASH | `{flaggedBy, rule, threshold, status, votes: {modName→decision}}` |
| `jury:{subId}:log` | LIST | lPush resolved verdict JSON, lTrim 100 |

---

## 📡 Devvit API Usage

| Module | Devvit API | Purpose |
|---|---|---|
| Handover | `Devvit.addMenuItem` | "End Shift & Hand Over", "View Current Handover" |
| Handover | `Devvit.addForm` + `context.ui.showForm` | Structured handover form |
| Handover | `context.redis.set / lPush / hSet` | Persist note, history, watchlist |
| Handover | `context.reddit.sendPrivateMessage` | Optional next-mod DM ping |
| Jury | `Devvit.addMenuItem` | "Send to Jury", "Cast Jury Vote" |
| Jury | `context.redis.zAdd / hSet` | Enqueue post, store vote state |
| Jury | `context.scheduler.runJob` | Register deadline expiry job |
| Jury | `context.reddit.remove / approve` | Auto-resolve on vote threshold |
| Jury | `context.reddit.modMail.createConversation` | Escalation alert on deadline |

---

## 📁 Project Structure

```
modpulse/
│
├── src/
│   ├── modules/
│   │   ├── handover/
│   │   │   ├── handoverMenu.ts        # addMenuItem definitions
│   │   │   ├── handoverForm.ts        # Devvit form schema
│   │   │   ├── handoverRedis.ts       # Redis read/write helpers
│   │   │   └── handoverTypes.ts       # TypeScript interfaces
│   │   │
│   │   └── jury/
│   │       ├── juryMenu.ts            # addMenuItem definitions
│   │       ├── juryForm.ts            # Flag + vote form schemas
│   │       ├── juryRedis.ts           # ZSET queue + hash helpers
│   │       ├── juryScheduler.ts       # Deadline expiry job
│   │       └── juryTypes.ts           # TypeScript interfaces
│   │
│   ├── shared/
│   │   ├── redisKeys.ts               # Centralised key builder functions
│   │   └── modmail.ts                 # Modmail alert helpers
│   │
│   └── main.ts                        # App entry point
│
├── assets/
│   ├── banner.png
│   └── demo-thumbnail.png
├── devvit.yaml
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🚀 Installation & Setup

### Prerequisites

- Node.js 18+
- Devvit CLI: `npm install -g devvit`
- Reddit account with mod access to a test subreddit

### Setup

```bash
# Clone the repo
git clone https://github.com/yourusername/modpulse
cd modpulse

# Install dependencies
npm install

# Log in to Devvit
devvit login

# Upload to Devvit
devvit upload

# Install on your test subreddit
devvit install r/yourTestSubreddit
```

### Development

```bash
# Live reload dev mode
devvit dev r/yourTestSubreddit
```

---

## ⚙️ How It Works

### Shift Handover — Step by Step

```
1. Outgoing mod → Subreddit Mod Menu → "End Shift & Hand Over"
2. Fills structured form (situations, watchlist, priority posts, notes)
3. ModPulse writes:
     → handover:{subId}:active  (active card)
     → handover:{subId}:history (prepend, trim to 20)
     → handover:{subId}:watchlist (each flagged user)
     → Optional DM to next mod
4. Incoming mod → "View Current Handover" → full card, zero context lost
```

### Jury Verdict Board — Step by Step

```
1. Mod sees borderline post → "Send to Jury (2-of-3 vote)"
2. Selects rule + deadline (1 / 6 / 24 / 48 hours)
3. ModPulse:
     → zAdd to jury:{subId}:queue (score = deadline epoch)
     → hSet verdict hash with metadata
     → Schedules jury-expiry job
4. Other mods → "Cast Jury Vote" → Remove / Approve / Abstain
5. After each vote, ModPulse checks threshold:
     → 2× Remove  → reddit.remove() auto-called
     → 2× Approve → reddit.approve() auto-called
6. Deadline with no consensus → escalation modmail to mod team
7. Resolved verdict pushed to jury:{subId}:log
```

---

## 🔒 Security

ModPulse is fully **subreddit-scoped** — all moderation workflows are restricted to the currently active subreddit and cannot affect other communities.

Security hardening includes:

- Validation checks before every moderation action
- Secure jury vote verification (one vote per mod enforced)
- Subreddit ownership enforcement on all Redis keys
- Full audit logging — mod identity, subreddit ID, timestamps, action type
- Cross-subreddit moderation attempts are **blocked and logged automatically**
- `🔒 Scoped` trust indicator visible in the dashboard UI

---

## 🌍 Community Impact

| Subreddit Type | Handover Impact | Jury Impact |
|---|---|---|
| Large news subs (100k+ WAU) | Mods stop re-investigating the same drama threads | Controversial removals become consensus decisions — fewer appeals |
| Gaming subs | Ongoing user disputes tracked across sessions | Borderline spoiler/self-promo posts decided collectively |
| Support communities | Sensitive situations tracked with full context | Posts needing nuanced judgement get multi-mod review |
| Meme/creative subs | Repeat offenders tracked persistently | OC vs repost grey-area calls made with 2-mod consensus |

> **Estimated time savings:** 2–4 hours per mod team per week — primarily from eliminating re-investigation of already-handled situations.

---

## 🗺️ Roadmap

- [x] Shift Handover card (auto + manual)
- [x] Jury Verdict Board with scheduler
- [x] Redis persistence with full schema
- [x] Verdict logging
- [x] Security hardening + audit log
- [ ] Mobile-optimised handover view (custom post component)
- [ ] Vote notifications via Reddit DM to all eligible mods
- [ ] Verdict search — find past decisions by rule or keyword
- [ ] Workload balancer — route reports to least-burdened active mod
- [ ] Community health dashboard — report spike detection
- [ ] AutoMod visual rule builder
- [ ] Export handover cards to mod wiki

---

## 📄 License

MIT © 2025 — Built with [Devvit](https://developers.reddit.com/devvit)

---

<div align="center">

🛡️ **Built for moderators. By someone who's watched great communities suffer from bad tooling.**

If ModPulse helped your mod team, please give it a ⭐

</div>
