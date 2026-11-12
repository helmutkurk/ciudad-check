# 0004. License: BUSL-1.1, source-available

- Status: accepted (Helmut's license selection; team IP agreement pending)
- Date: 2026-10-30
- Deciders: Helmut

## Context

The repository is public from the first push ([0003](0003-public-repo-from-the-start.md)).
The recorded Devfolio submission requirements need public code, and the team
intends to retain commercial options for Shelfie. Public visibility alone does
not grant reuse rights. The four members' IP arrangements and any outside claims
still need written confirmation.

## Decision

Use Business Source License 1.1 (BUSL-1.1) for team-authored files, with the four
members jointly identified as licensor. Permit non-production use, including
evaluation, education, research and hackathon judging; specify Change Date
2030-10-31 and Change License Apache License, Version 2.0.

The parameters are proposals pending the [team IP agreement](../ip-agreement.md).
Missing full names remain placeholders. The root [LICENSE](../../LICENSE) contains
the parameter block followed by the official text fetched verbatim from the
[SPDX license list](https://raw.githubusercontent.com/spdx/license-list-data/main/text/BUSL-1.1.txt).

## Consequences

- Shelfie is source-available, not OSI open source. Non-production reuse is
  permitted under BUSL-1.1; production use requires separate permission until
  conversion under the license terms.
- The Change License is Apache-2.0. Conversion occurs on 2030-10-31 or the fourth
  anniversary of a specific version's first public distribution, whichever is
  earlier, as the verbatim license requires.
- Dependencies and organisers' starter/template code keep their own licenses;
  [NOTICE](../../NOTICE) records exclusions and outstanding license checks.
- Joint ownership and commercial decisions require the four members' written
  agreement. Confirm names, financial terms, outside rights and license parameters
  before relying on the draft; seek TUM founder services or legal advice before a sale.
- BUSL grants no trademark rights. License metadata does not relicense third-party code.

## Alternatives considered

- All rights reserved: preserves control but gives judges and other readers no
  express non-production reuse permission.
- BUSL-1.1: chosen for explicit non-production rights, production restrictions
  during the initial period and eventual conversion to Apache-2.0.
- MIT / Apache-2.0 from the start: straightforward permissive reuse, including
  commercial production use, which does not match the current business intent.
