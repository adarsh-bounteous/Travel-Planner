---
id: ADR-0011
category: cross_cutting
title: 'Cross-cutting: GDPR compliance'
status: accepted
superseded_by: null
component_id: null
decision: 'Personal data of travelers is handled under GDPR: lawful basis and consent,
  data access/export and erasure on request, data minimisation, and encryption in
  transit and at rest. Data is hosted in a single US region, so EU travelers'' data
  needs a valid cross-border transfer mechanism (e.g. Standard Contractual Clauses)
  and disclosure in the privacy notice.'
evidence: 'User: ''GDPR applies'' and ''Single region, US (e.g. us-east-1)'''
---

## Context

User: 'GDPR applies' and 'Single region, US (e.g. us-east-1)'

## Decision

Personal data of travelers is handled under GDPR: lawful basis and consent, data access/export and erasure on request, data minimisation, and encryption in transit and at rest. Data is hosted in a single US region, so EU travelers' data needs a valid cross-border transfer mechanism (e.g. Standard Contractual Clauses) and disclosure in the privacy notice.
