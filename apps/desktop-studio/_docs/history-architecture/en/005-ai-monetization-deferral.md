# ADR 005: AI Monetization Deferral

[한국어](../ko/005-ai-monetization-deferral.md)

- **Status**: Accepted
- **Date**: 2026-05-22
- **Context**: `desktop-studio` needs AI features to remain available while paid billing and server-operated AI services are deferred until the business registration and monetization path are ready.

## Context

Rendium Studio explored paid AI monetization paths, including payment providers and a server-backed cloud AI service. That direction introduced billing, account, quota, API server, and operational-cost concerns before the business registration status was ready to support a production paid service.

For the current product stage, the safer product behavior is to keep AI functionality available without requiring Rendium-operated billing or server infrastructure.

The immediate constraints are:

- Rendium should not ship a paid checkout flow before the business setup is clear.
- Desktop Studio should avoid depending on a Rendium-hosted AI proxy, quota service, or subscription backend.
- Users still need a way to use AI features during this deferral period.
- The codebase should retain the history of why payment and server-backed AI paths were removed.

## Decision

Defer paid billing and Rendium-hosted AI service work for now.

AI access in `desktop-studio` stays open through user-configured providers:

- OpenAI with the user's own API key.
- Local Ollama with the user's local model and host.

Do not include the following in the active desktop app path until the business and monetization plan is intentionally reopened:

- checkout or payment-provider integration
- subscription plans
- billing status checks
- server-side AI proxying
- Rendium Cloud AI provider selection
- server-enforced AI quota errors
- Prisma or database-backed billing service code

## Implementation Notes

The deferral removed the server and payment-oriented work from the current diff:

- removed the untracked `apps/cloud-api` service
- removed the `tsconfig.base.json` file that only supported that service
- restored `pnpm-lock.yaml` to remove cloud API and Prisma dependencies
- removed `Rendium Cloud` / `cloudApiUrl` AI provider UI and settings
- removed AI quota-specific error handling from the desktop chat path

The retained desktop behavior is BYOK/local:

- the AI settings button lives beside `Clear Chat`
- settings are stored in the Electron app user data directory
- the renderer only sees whether an OpenAI API key exists, not the key value itself
- OpenAI and Ollama requests are initiated from the desktop app instead of a Rendium server

## Consequences

- Rendium can keep testing AI-assisted workflows without operating paid AI infrastructure.
- Users can bring their own AI account or local runtime, so app-side AI cost is not owned by Rendium during this phase.
- No subscription or quota UX is active, which keeps product expectations simpler.
- Future monetization can be reintroduced deliberately with a new ADR or product decision once business registration, merchant-of-record choice, tax handling, and support obligations are clear.
- Any future server-backed AI path should be treated as a new product and architecture decision, not as an implicit continuation of the removed prototype.

## Reopen Criteria

Reconsider payment or server-backed AI only when:

- the business registration and payment settlement path are confirmed
- the intended merchant-of-record or direct payment provider is selected
- pricing, refund, tax, and support policies are documented
- server operating cost and AI quota policy are modeled
- the desktop app has a clear UX for paid access, account state, failures, and cancellation
