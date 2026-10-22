---
id: ADR-0003
category: component
title: Trip Database
status: accepted
superseded_by: null
component_id: comp_trip_database
responsibility: Persistent store for traveler accounts' trips, itineraries and preferences;
  runs on Amazon DynamoDB (NoSQL).
kind: managed_service
split_reason: Backing service the project uses but doesn't build; holds personal data
  under GDPR.
evidence: 'User: ''DynamoDB (NoSQL)'''
contested: true
alternatives_considered:
- 'Aurora Serverless (PostgreSQL): relational model, but not chosen by the user'
- 'Aurora Serverless (MySQL): not chosen by the user'
consequences:
- Access patterns must be designed up front around keys and indexes
- Fits the AWS serverless target with no servers to manage
- Ad-hoc relational queries and joins are harder
---

## Context

User: 'DynamoDB (NoSQL)'

## Decision

Persistent store for traveler accounts' trips, itineraries and preferences; runs on Amazon DynamoDB (NoSQL).

Kept separate because Backing service the project uses but doesn't build; holds personal data under GDPR..

## Alternatives considered

- Aurora Serverless (PostgreSQL): relational model, but not chosen by the user
- Aurora Serverless (MySQL): not chosen by the user

## Consequences

- Access patterns must be designed up front around keys and indexes
- Fits the AWS serverless target with no servers to manage
- Ad-hoc relational queries and joins are harder
