# Operator AI and the global golf opportunity

State of Stick Golf can become an operating layer for golf properties and
networks: a shared place to publish approved course context, connect physical
touchpoints, understand recorded activity, and help operators decide what to
do next.

This document separates the opportunity from the current implementation. The
repository contains foundations and demonstrations for several of these flows;
it does not claim that every workflow is production-connected or that any
course has adopted it.

## One system, many golf participants

```text
golfer
  ↕ passport, round, league, service, insight
course / resort operator
  ↕ approved knowledge, touchpoints, operations, analytics
league / event / commissioner
  ↕ eligibility, standings, announcements, portable competition
brand / sponsor / manufacturer
  ↕ physical objects, activations, attribution, repeat engagement
State of Stick platform
  ↕ identity, organizations, physical identity, entitlements, commerce, policy
```

Golf is the vertical context. State of Stick is the reusable platform layer.

## Operator workflows

### Course knowledge and publishing

An operator can claim a course, review its identity and scorecard facts,
approve geometry and local guidance, maintain services, publish announcements,
and decide what becomes public. AI can help organize approved material into a
clear answer or identify unanswered topics. It cannot publish a fact without
operator approval.

### Daily operations

The operator console can bring together round review, verification events,
tee-time activation, service requests, fulfillment states, tap activity, and
audit history. A future operator copilot could prepare a shift brief:

- rounds awaiting review;
- service requests that need a response;
- tee-time arrivals or incomplete handoffs;
- repeated golfer questions;
- course knowledge that needs an update;
- physical touchpoints generating activity.

The copilot should summarize and prioritize. Staff remain responsible for
approvals, prices, customer communication, score decisions, and fulfillment.

### Course intelligence

The current analytics surface is designed around authorized metrics such as tap
events, unique golfers, active rounds, service requests, completed services,
Golf Agent questions, and unanswered questions. AI can explain a pattern in
those recorded facts and suggest an investigation, such as reviewing a service
location or improving a course answer.

It must not turn recorded activity into settled revenue, guaranteed traffic,
sponsor reach, or proof of adoption. Those require separate source systems and
explicit evidence.

### Events, leagues, and destinations

The same network can support a club championship, charity outing, resort
season, portable amateur league, sponsor challenge, or destination-golf
passport. Operators and commissioners can use the system for approved
announcements, eligibility, check-in, round verification, published standings,
and physical event moments.

AI can prepare an event brief, explain published standings, summarize questions,
or suggest where participants need clearer guidance. Deterministic competition
rules remain the authority; AI never chooses a winner, changes a standing, or
creates an official handicap.

## The operator AI boundary

The safe pattern is:

```text
verified operator identity
        ↓
approved course / league / service facts
        ↓
deterministic metrics and rules
        ↓
bounded AI explanation or draft
        ↓
human review and explicit action
```

The assistant should refuse or defer when the request involves private player
data outside the operator's authority, medical or gambling advice, unsupported
live weather or course conditions, unverified official claims, or an action that
would write scores, standings, prices, orders, announcements, or staff
decisions.

Every generated result should retain the source facts, confidence, timestamp,
provider, rule version, and advisory/verified status. State of Stick's private
platform remains authoritative for identity, roles, entitlements, and AI
governance.

## Expansion paths

The architecture can extend from one pilot course to:

- multi-course operators and resort groups;
- public course discovery and destination itineraries;
- portable leagues and commissioner tools;
- tournaments and sponsor activations;
- course services and connected clubhouse operations;
- collectible course emblems and golfer passports;
- manufacturers producing durable, encoded physical touchpoints;
- course networks that compare approved activity without exposing private player data.

The opportunity is not “put a chatbot on a golf website.” It is to connect a
real physical property, its people, its operating context, and its repeatable
digital relationships — then use AI to make authorized information easier to
understand and act on.

## What still needs proof

Before describing any expansion as live, verify the relevant evidence:

- State of Stick identity and organization integration;
- operator approval and course publication;
- D1, Durable Object, secrets, and hostname configuration;
- manufacturing prototype, material choice, encoding, and installation;
- source-system integrations for tee times, POS, payments, or weather;
- AI provider configuration, allowance, refusal behavior, and auditability;
- customer, sponsor, revenue, and adoption claims.
