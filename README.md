# ModCluster
<<<<<<< HEAD
## Collaborative Moderation Infrastructure for Reddit

ModCluster is a Devvit-native moderation platform designed for Reddit moderator teams.

It combines moderation automation, collaborative review workflows, and operational coordination into a single moderation workspace built directly inside Reddit.

Built with Devvit · TypeScript · React · Redis

---

## Overview

Moderating active communities is often fragmented.

Moderator teams face recurring challenges:

- loss of context between moderator shifts
- inconsistent moderation decisions
- repetitive manual moderation work
- risky automation deployed without testing
- limited visibility into moderation activity

ModCluster addresses these problems through coordinated moderation workflows, programmable moderation rules, and real-time operational insights.

Rather than acting as a simple moderation dashboard, ModCluster functions as moderation infrastructure designed for teams.

---

## What ModCluster Does

ModCluster provides moderators with a centralized moderation workspace where they can:

- configure moderation rules
- test and validate moderation logic
- review operational insights
- manage moderation workflows
- coordinate on sensitive cases
- track moderation activity
- preserve moderation context

All moderation state is backed by Redis and integrated directly with Reddit through Devvit APIs.

---

## Core Features

### Programmable Moderation Rules

Moderators can build configurable moderation rules using:

- visual editor
- YAML editor
- reusable templates

Rules can evaluate:

- account age
- karma
- posting frequency
- repeated links
- suspicious domains
- keyword triggers
- spam indicators
- moderation risk patterns

Supported actions include:

- remove content
- filter to review queue
- notify moderators
- add moderator notes
- lock threads
- escalate for review

This allows moderators to customize moderation logic according to subreddit policies.

---

### Validation and Live Testing

Before deployment, ModCluster validates moderation logic.

The system detects:

- duplicate rules
- conflicting logic
- dangerous removals
- broad keyword matches
- deployment risks

Rules can be tested against subreddit content before deployment.

Moderators can preview:

- matched posts
- triggered conditions
- predicted actions
- moderation outcomes

This creates safer and more explainable moderation automation.

---

### Deployment and Rollback

ModCluster creates Redis snapshots during deployment.

Moderators can:

- deploy moderation rules
- track deployment history
- restore earlier configurations
- rollback instantly

This ensures moderation changes remain reversible and safe.

---

### Operational Dashboard

The dashboard provides live moderation visibility.

Moderators can monitor:

- queue pressure
- moderation activity
- flagged users
- workload indicators
- rule analytics
- operational insights
- moderation history

Insights help moderators understand community conditions without reviewing raw logs.

---

### Collaborative Moderation

ModCluster supports collaborative workflows for sensitive moderation situations.

#### Jury Review

Borderline moderation cases can be escalated to a Jury Board.
=======

ModCluster is a Devvit-native moderation platform built for Reddit moderator teams.

It combines moderation automation, rule management, collaborative moderation, and moderator coordination directly inside Reddit.

Rather than treating moderation as isolated actions, ModCluster provides moderators with a shared moderation workspace where policies can be configured, validated, deployed, and reviewed with operational visibility.

Built with Devvit, TypeScript, React, Redis, and Reddit APIs.

---

## Why ModCluster

Traditional moderation tools focus on isolated actions.

# ModCluster

ModCluster is a Devvit-native moderation platform for Reddit moderator teams. It combines rule management, moderation automation, collaboration, and operational visibility in one workspace built directly inside Reddit.

Built with Devvit, TypeScript, React, Vite, Redis, Hono, YAML, and Reddit APIs.

---

## What It Does

ModCluster gives moderators a shared workspace where they can:

- create and edit moderation rules in a visual editor or YAML
- validate rules before deployment
- test rule behavior against sample content
- deploy and rollback rule sets safely
- review analytics, activity, and flagged users
- coordinate sensitive cases with other moderators
- preserve shift handover context
- use moderator menu actions and bulk moderation tools

All moderation state is backed by Redis and executed through Devvit and Reddit APIs.

---

## Core Features

### Rule Authoring

Moderators can build rules using templates, a blank rule editor, or YAML. Rules support conditions like account age, karma, posting rate, repeated links, suspicious domains, keyword triggers, spam signals, toxicity signals, and other risk patterns.

Supported actions include removing content, filtering to review, sending to jury review, adding moderator notes, notifying moderators, locking threads, and temporary moderation actions.

### Validation and Live Testing

Before deployment, ModCluster analyzes rules for duplicate logic, conflicts, dangerous removals, broad matches, and other risks. Moderators can preview matched content, triggered conditions, confidence, risk scores, and sample decisions before rules affect live communities.

### Deployment and Rollback

Deployments create Redis snapshots, store history, and update analytics. Moderators can restore earlier versions or roll back instantly when needed. Risky deployments may require extra confirmation.

### Dashboard and Insights

The React dashboard shows moderation activity, event history, queue pressure, repeated offenders, flagged users, rule analytics, workload indicators, and operational insights.

### Collaborative Moderation

Borderline cases can be escalated to jury review. Moderators can open a case, vote approve/remove/abstain, and review resolved verdicts. This improves transparency and reduces one-person decision making.

### Shift Handover

Outgoing moderators can submit active situations, users to watch, priority posts, escalation notes, and moderation guidance. Incoming moderators can immediately see the current handover and unresolved context.

### Moderator Menu Tools

The app exposes Reddit menu actions such as Mop Post and Mop Comments, plus forms for workflow shortcuts and bulk moderation actions.

---

## How It Works

1. Moderators create or edit rules in the Devvit Web dashboard.
2. The app validates the rules and shows warnings or risk analysis.
3. Moderators run tests to preview how rules will behave.
4. When deployed, the rule set is saved with snapshots and analytics.
5. Moderation actions run through Devvit and Reddit APIs.
6. Activity, events, and insights are logged back into the dashboard.

Data flow:

UI -> validation/testing -> snapshot storage and analytics -> deployment -> moderation execution -> activity logging -> dashboard insights

---

## Architecture

| Layer | Stack |
|---|---|
| Frontend | React · Devvit Web · TypeScript · Vite |
| Backend | Devvit handlers · triggers · scheduler · Hono |
| Storage | Redis |
| Platform | Devvit · Reddit API |

---

## Why It Exists

ModCluster is designed for active moderator teams that need safer automation, consistent decisions, and less context loss between shifts. It focuses on moderation workflows instead of isolated actions.

---

## Links

GitHub: https://github.com/A-VISHAL/modcluster

Playtest: https://www.reddit.com/r/modcluster_dev/?playtest=modcluster

