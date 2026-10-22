---
id: ADR-0002
category: component
title: Trip Planner API
status: accepted
superseded_by: null
component_id: comp_trip_planner_api
responsibility: 'Backend API serving the Web App: trip and itinerary management, traveler
  accounts and business logic; a single API exposed to clients through Amazon API
  Gateway.'
kind: api_service
split_reason: Separate runtime from the browser client; user named an API as a deployable
  piece.
talks_to:
- component_id: comp_trip_database
  interaction: shared-storage
  evidence: API persists trips and itineraries
evidence: 'User: ''One API behind API Gateway'''
---

## Context

User: 'One API behind API Gateway'

## Decision

Backend API serving the Web App: trip and itinerary management, traveler accounts and business logic; a single API exposed to clients through Amazon API Gateway.

Kept separate because Separate runtime from the browser client; user named an API as a deployable piece..

## Talks to

- **Trip Database** (shared-storage) — API persists trips and itineraries
