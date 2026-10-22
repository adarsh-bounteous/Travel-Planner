---
id: ADR-0001
category: component
title: Web App
status: accepted
superseded_by: null
component_id: comp_web_app
responsibility: Browser UI where individual travelers plan trips (create trips, build
  itineraries, view plans).
kind: web_ui
split_reason: Distinct client runtime (browser); user answered 'Web app + API for
  individual travelers planning trips'.
talks_to:
- component_id: comp_trip_planner_api
  interaction: sync
  evidence: 'Web client calls the API; user: ''Web app + API'''
evidence: 'User: ''Web app + API for individual travelers planning trips'''
---

## Context

User: 'Web app + API for individual travelers planning trips'

## Decision

Browser UI where individual travelers plan trips (create trips, build itineraries, view plans).

Kept separate because Distinct client runtime (browser); user answered 'Web app + API for individual travelers planning trips'..

## Talks to

- **Trip Planner API** (sync) — Web client calls the API; user: 'Web app + API'
