# ModCluster
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

Workflow:

Post flagged  
→ Case opened  
→ Moderators vote  
→ Consensus reached  
→ Action executed

Votes include:

- Approve
- Remove
- Abstain

Consensus-based moderation improves transparency and reduces unilateral decision-making.

---

### Shift Handover

Moderator teams can preserve operational context across shifts.

Outgoing moderators can submit:

- active situations
- users to monitor
- priority posts
- escalation notes
- moderation guidance

Incoming moderators immediately see current moderation status and unresolved situations.

This reduces duplicated investigation and improves team coordination.

---

## How ModCluster Solves Moderation Problems

Traditional moderation tools focus on individual actions.

ModCluster focuses on moderation workflows.

Instead of moderators working independently, ModCluster creates:

- shared moderation context
- safer automation deployment
- collaborative decision-making
- transparent moderation history
- operational visibility

This helps moderation teams:

- save moderation time
- reduce repetitive review work
- avoid context loss
- reduce moderator burnout
- maintain more consistent moderation decisions

---

## Architecture

| Layer | Stack |
|---|---|
| Frontend | React · Devvit Web · TypeScript · Vite |
| Backend | Devvit Handlers · Triggers · Scheduler · Hono |
| Storage | Redis |
| Platform | Devvit · Reddit API |

Redis acts as the operational source of truth for:

- handovers
- moderation rules
- jury workflows
- activity history
- analytics

Fully Devvit-native with no external infrastructure required.

---

## Quick Start

```bash
npm install -g devvit
npm install
devvit login
devvit playtest
devvit upload
