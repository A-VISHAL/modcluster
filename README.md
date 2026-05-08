<div align="center">

<br/>

```
███╗   ███╗ ██████╗ ██████╗ ██████╗ ██╗   ██╗██╗     ███████╗███████╗
████╗ ████║██╔═══██╗██╔══██╗██╔══██╗██║   ██║██║     ██╔════╝██╔════╝
██╔████╔██║██║   ██║██║  ██║██████╔╝██║   ██║██║     ███████╗█████╗  
██║╚██╔╝██║██║   ██║██║  ██║██╔═══╝ ██║   ██║██║     ╚════██║██╔══╝  
██║ ╚═╝ ██║╚██████╔╝██████╔╝██║     ╚██████╔╝███████╗███████║███████╗
╚═╝     ╚═╝ ╚═════╝ ╚═════╝ ╚═╝      ╚═════╝ ╚══════╝╚══════╝╚══════╝

              T H E   M O D   T E A M   C O M M A N D   C E N T E R
```

<br/>

**The first Reddit Devvit app that treats the mod team as a team —  
with shift-aware context handover and collaborative multi-mod verdict boards  
to eliminate dropped context, inconsistent rulings, and mod burnout.**

<br/>

![Devvit](https://img.shields.io/badge/Built%20with-Devvit-FF4500?style=for-the-badge&logo=reddit&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Redis](https://img.shields.io/badge/Storage-Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![Reddit](https://img.shields.io/badge/Platform-Reddit-FF4500?style=for-the-badge&logo=reddit&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)
![Hackathon](https://img.shields.io/badge/Reddit-Mod%20Tools%20Hackathon-brightgreen?style=for-the-badge)

<br/>

[View on Devvit App Directory](#) · [Report Bug](https://github.com) · [Request Feature](https://github.com)

</div>

---

<br/>

## Table of Contents

- [Project Overview](#project-overview)
- [The Problem](#the-problem)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Redis Schema](#redis-schema)
- [Devvit API Usage](#devvit-api-usage)
- [Project Structure](#project-structure)
- [Installation & Setup](#installation--setup)
- [How It Works](#how-it-works)
- [Community Impact](#community-impact)
- [Future Improvements](#future-improvements)
- [Hackathon Submission](#hackathon-submission)
- [License](#license)

<br/>

---

## Project Overview

ModPulse is a Devvit-native moderation command center for Reddit that solves two of the most universally painful problems in multi-mod subreddit management: **context loss between mod sessions** and **inconsistent unilateral post rulings**.

| Capability | Description |
|---|---|
| Shift Handover | Structured mod-to-mod context cards with open situations, watchlists, and priority threads |
| Jury Verdict Board | Multi-mod vote queue for borderline posts — 2-of-3 consensus before removal |
| User Watchlist | Persistent per-sub user flagging with reason tracking across all mod sessions |
| Handover History | Last 20 shift notes browseable from the mod menu |
| Auto-Resolve | Jury board auto-removes or auto-approves when vote threshold is reached |
| Verdict Log | Every jury decision is permanently logged with voter identities and rule citations |

<br/>

---

## The Problem

### Problem 1 — Mod Shift Handover

Large subreddits have mod teams across multiple time zones. When Mod A finishes their shift and Mod B comes online, **there is zero built-in context transfer**. Mod B starts completely blind:

- Which users are currently causing trouble?
- Which posts are pending a decision?
- Is there an ongoing drama thread that needs watching?
- Did someone just get a warning that's one step from a ban?

This causes mods to make decisions without context, re-investigate situations that were already handled, and miss escalating problems entirely. **ModPulse fixes this with a hospital-style shift handover card** — the outgoing mod fills in a structured form before they log off, and the incoming mod sees it the moment they open the mod tools.

### Problem 2 — Jury Verdict Board

Right now, one mod can unilaterally remove any post. This creates three serious problems:

1. **Inconsistency** — Mod A keeps a post, Mod B removes the same type of post. Users notice and complain.
2. **Disputes** — Users appeal removals, mod teams fight internally, ban appeals flood the queue.
3. **Accountability gaps** — No record of why a borderline call was made.

**ModPulse fixes this with the Jury Verdict Board** — any mod can flag a post as "borderline" and send it to a timed vote queue. Two out of three mods must agree before the post is actioned. Every verdict is logged with rule citations.

<br/>

---

## Features

### 🔁 Mod Shift Handover

**For the outgoing mod:**
- One-click "End Shift & Hand Over" from the subreddit mod menu
- Structured form: open situations, users to watch, priority posts, freeform notes
- Automatically timestamps and attaches the mod's username
- Optionally pings the next mod on shift via DM

**For the incoming mod:**
- "View Current Handover" shows the latest card instantly
- Displays all open watchlist items from previous sessions (not just the last note)
- Handover history — browse the last 20 shift notes without leaving Reddit

**Persistent across sessions:**
- The watchlist (`handover:{subId}:watchlist`) persists indefinitely until a mod explicitly clears a user
- Handover history is a Redis list, trimmed to 20 entries automatically

---

### ⚖️ Jury Verdict Board

**For the flagging mod:**
- "Send to Jury (2-of-3 vote)" option in the post mod menu
- Select the rule potentially violated and set a vote deadline (1–48 hours)
- Post is immediately visible in the jury queue to all mods

**For voting mods:**
- "Cast Jury Vote" on any queued post — Remove / Approve / Abstain
- See who flagged it, what rule they cited, and how long until deadline
- Real-time vote tally visible to all mods

**Auto-resolution:**
- When 2 Remove votes are cast → post is automatically removed
- When 2 Approve votes are cast → post is automatically approved
- At deadline with no consensus → post is escalated to senior mods via modmail

**Permanent verdict log:**
- Every resolved jury case logged with post ID, rule cited, voter list, and outcome
- Browseable from the mod menu — builds institutional rule precedent over time

<br/>

---

## Architecture

```
+-------------------------------------------------------+
|                     REDDIT CLIENT                     |
|                                                       |
|   Subreddit Mod Menu   |   Post Mod Menu              |
|   "End Shift"          |   "Send to Jury"             |
|   "View Handover"      |   "Cast Vote"                |
|   "Set Availability"   |                              |
+---------------------------+---------------------------+
                            |
                     Devvit Runtime
                            |
+---------------------------v---------------------------+
|                    MODPULSE APP                       |
|                                                       |
|   +-----------------+   +-------------------------+  |
|   | HANDOVER MODULE |   |  JURY BOARD MODULE      |  |
|   |                 |   |                         |  |
|   | addMenuItem ×3  |   | addMenuItem ×2          |  |
|   | addForm         |   | addForm (vote)          |  |
|   | ModAction trig  |   | ModAction trigger       |  |
|   |                 |   | Scheduler (jury-expiry) |  |
|   +-----------------+   +-------------------------+  |
|                                                       |
|   +-------------------------------------------------+ |
|   |              REDIS STORAGE LAYER                | |
|   |                                                 | |
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
|        REDDIT PLATFORM ACTIONS                        |
|  removePost | approvePost | sendModMail | sendDM      |
+-------------------------------------------------------+
```

**Data flow**

```
Outgoing mod fills handover form
  → Devvit serialises to JSON
  → Redis SET (active) + lPush (history) + hSet (watchlist items)
  → Optional DM to next mod

Mod flags borderline post for jury
  → Redis zAdd to jury queue (score = deadline epoch)
  → Redis hSet verdict hash with initial metadata
  → Scheduler job registered at deadline time

Mod casts jury vote
  → Redis hSet updates votes map in verdict hash
  → Check threshold → if met, call reddit.remove or reddit.approve
  → Push to verdict log

Deadline reached with no consensus
  → Scheduler fires jury-expiry job
  → Escalation modmail sent to mod team
  → Post status updated in hash
```

<br/>

---

## Tech Stack

| Technology | Role |
|---|---|
| **Devvit** | Reddit's native developer platform — all app logic runs here |
| **TypeScript** | Type-safe app code with Devvit SDK |
| **Redis (via Devvit)** | All persistent state — no external DB needed |
| **Devvit Scheduler** | Jury deadline enforcement and digest jobs |
| **Devvit Triggers** | ModAction, PostCreate event listeners |
| **Reddit Modmail API** | Escalation alerts and weekly digests |
| **Reddit Wiki API** | AutoMod builder reads/writes wiki pages |

<br/>

---

## Redis Schema

### Shift Handover

| Key | Type | Value |
|---|---|---|
| `handover:{subId}:active` | STRING | JSON HandoverNote `{author, ts, situations, watchlist[], priorityPosts, notes}` |
| `handover:{subId}:history` | LIST | lPush on each submit, lTrim 20. Full history of shift notes. |
| `handover:{subId}:watchlist` | HASH | `userId → reason`. Persists across sessions until explicitly cleared. |

### Jury Verdict Board

| Key | Type | Value |
|---|---|---|
| `jury:{subId}:queue` | ZSET | `postId → deadline epoch (score)`. zRangeByScore for expired items. |
| `jury:{subId}:verdict:{postId}` | HASH | `{flaggedBy, flaggedAt, rule, threshold, status, votes: {modName→decision}}` |
| `jury:{subId}:log` | LIST | lPush resolved verdict JSON on each resolution. lTrim 100. |

<br/>

---

## Devvit API Usage

| Module | Devvit API | Purpose |
|---|---|---|
| Handover | `Devvit.addMenuItem` | "End Shift & Hand Over", "View Current Handover" |
| Handover | `Devvit.addForm + context.ui.showForm` | Structured handover form |
| Handover | `context.redis.set / lPush / hSet` | Persist active note, history, watchlist |
| Handover | `context.reddit.sendPrivateMessage` | Optional next-mod DM ping |
| Jury | `Devvit.addMenuItem` | "Send to Jury", "Cast Jury Vote" |
| Jury | `context.redis.zAdd / hSet` | Enqueue post, store vote state |
| Jury | `context.scheduler.runJob` | Register deadline expiry job |
| Jury | `context.reddit.remove / approve` | Auto-resolve on vote threshold |
| Jury | `context.reddit.modMail.createConversation` | Escalation alert on deadline |

<br/>

---

## Project Structure

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
│   └── main.ts                        # App entry point — registers all modules
│
├── devvit.yaml                         # Devvit app manifest
├── package.json
├── tsconfig.json
└── README.md
```

<br/>

---

## Installation & Setup

### Prerequisites

- Node.js 18 or higher
- Devvit CLI installed: `npm install -g devvit`
- A Reddit account with mod access to a test subreddit

---

### Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/modpulse
cd modpulse

# Install dependencies
npm install

# Log in to Devvit
devvit login

# Upload the app to your test subreddit
devvit upload

# Install on your test subreddit
devvit install r/yourTestSubreddit
```

> The app will appear in the subreddit mod menu immediately after install.

---

### Development

```bash
# Run in dev mode with live reload
devvit dev r/yourTestSubreddit
```

<br/>

---

## How It Works

### Shift Handover — Step by Step

```
1. Outgoing mod opens Subreddit Mod Menu
2. Clicks "End Shift & Hand Over"
3. Fills in the structured form:
     - Open situations (e.g. "drama thread in top post comments")
     - Users to watch (usernames + reasons)
     - Priority posts (links)
     - Freeform notes
4. Submits → ModPulse:
     - Writes JSON to handover:{subId}:active (overwrites previous)
     - Prepends to handover:{subId}:history list (trimmed to 20)
     - Writes each watchlist user to handover:{subId}:watchlist hash
     - Optionally DMs the next scheduled mod
5. Incoming mod opens Subreddit Mod Menu
6. Clicks "View Current Handover"
7. Sees the full structured card instantly — no context lost
```

### Jury Verdict Board — Step by Step

```
1. Mod sees a borderline post
2. Opens Post Mod Menu → "Send to Jury (2-of-3 vote)"
3. Fills in:
     - Rule potentially violated (dropdown from subreddit rules)
     - Vote deadline (1 / 6 / 24 / 48 hours)
4. ModPulse:
     - Adds post to jury:{subId}:queue ZSET (score = deadline epoch)
     - Creates verdict hash with flagged metadata
     - Schedules a jury-expiry job at the deadline
5. Other mods see "Cast Jury Vote" on the post mod menu
6. Each mod votes: Remove / Approve / Abstain
7. ModPulse checks threshold after each vote:
     - 2× Remove → reddit.remove() called automatically
     - 2× Approve → reddit.approve() called automatically
8. On deadline with no consensus:
     - Escalation modmail sent to full mod team
9. Resolved verdict pushed to jury:{subId}:log for future reference
```

<br/>

---

## Community Impact

| Subreddit Type | Handover Impact | Jury Impact |
|---|---|---|
| Large news subs (100k+ WAU) | Mods covering different time zones stop re-investigating the same drama threads | Controversial news post removals become consensus decisions — fewer ban appeals |
| Gaming subs | Ongoing inter-user disputes tracked across mod sessions | Borderline spoiler/self-promo posts decided collectively |
| Support communities | Sensitive user situations tracked in watchlist with context | Posts requiring nuanced mental health judgement get multi-mod review |
| Meme / creative subs | Repetitive rule offenders tracked persistently | OC vs repost grey-area calls made with 2-mod consensus |

**Estimated time savings per mod team per week: 2–4 hours** — primarily from eliminating re-investigation of situations that were already handled in a previous session.

<br/>

---

## Future Improvements

- [ ] Handover card custom fields per subreddit
- [ ] Mobile-optimised handover view (custom post component)
- [ ] Jury board visible as a pinned mod dashboard post
- [ ] Vote notifications via Reddit DM to all eligible mods
- [ ] Verdict search — find past jury decisions by rule or keyword
- [ ] Workload balancer — route reports to least-burdened active mod
- [ ] Community health dashboard — report spike detection and alerts
- [ ] AutoMod visual rule builder

<br/>

---


## License

This project is licensed under the **MIT License**.  
See the `LICENSE` file for full details.

---

<div align="center">

**🛡️ Built for moderators. By someone who's watched great communities suffer from bad tooling.**

If this helped your mod team, please give it a ⭐

</div>
The latest update added comprehensive security hardening to ModPulse AI.

The system is now fully subreddit-scoped, meaning all moderation workflows are restricted to the currently active subreddit and cannot affect other communities.

Key improvements include:

* validation checks before moderation actions,
* secure jury vote verification,
* subreddit ownership enforcement,
* Redis scope validation,
* audit logging for all moderator actions,
* security event logging,
* and a visible “🔒 Scoped” trust indicator in the dashboard UI.

The platform now logs:

* moderator identity,
* subreddit ID,
* timestamps,
* vote actions,
* handover actions,
* and verdict resolution events.

Cross-subreddit moderation attempts are blocked and logged automatically.

The update also preserved all existing functionality:

* Jury Verdict Board
* Shift Handovers
* Activity Feed
* AI moderation workflows
* Redis persistence
* Devvit Web dashboard architecture

Overall, the system now feels significantly more trustworthy, transparent, auditable, and production-oriented while maintaining the existing moderator experience.
