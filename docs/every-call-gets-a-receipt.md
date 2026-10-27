# Every call gets a receipt, including the rejected ones

A record that only keeps successes is not an audit trail. It is a press
release with timestamps. AER-1 states the rule plainly in Section 3:
receipts issue for every call, including calls that are rejected. If an
agent attempted the call, the attempt is part of the work's history, and the
record exists whether the call produced a result or a refusal.

The specification is AER-1, draft-zambo-aer1-26:
https://datatracker.ietf.org/doc/draft-zambo-aer1/26/

## What a rejection receipt records

A rejected call has no result, so its receipt carries no result. It records
the call itself: what was asked, when, under which session, and that it was
rejected. The record is the same shape as any other receipt, so it sits in
the same sequence, digests the same way, and verifies the same way. The
absence of an output is itself recorded, rather than the attempt vanishing
from the sequence and leaving a gap nobody can explain later.

This matters because a gap is ambiguous forever. An auditor reading a chain
with a missing step cannot tell whether nothing happened, something happened
off the record, or the record was edited. A rejection receipt removes the
ambiguity at the only moment it can be removed: when the call happens.

## What recording rejections makes auditable

- **Probing.** Repeated malformed or out-of-scope calls are how a tool
  surface gets mapped by someone looking for a way through it. If only
  successes are recorded, the probing is invisible by construction.
- **Limit behavior.** An agent brushing against its free tier or a rate
  limit looks, in a success-only log, like an agent that worked smoothly
  and stopped. The rejection receipts show the brushing, which is usually
  the fact that explains the rest of the session.
- **Disputed attempts.** "The agent never tried" is a claim a success-only
  record cannot settle either way. With rejection receipts, the attempts
  are in the chain with their outcomes, and the dispute ends at the record.
- **Failure shape.** A rejection caused by bad inputs, a rejection caused
  by policy, and a rejection caused by a limit are different events with
  different fixes. Recording all three, distinctly, is what turns a pile of
  errors into a diagnosable pattern.

## See it live

You can watch the rule operate with one deliberate mistake. Connect a
client:

```json
{
  "mcpServers": {
    "zambo": {
      "url": "https://zambo.dev/mcp"
    }
  }
}
```

Per-client steps are at https://zambo.dev/add. No signup and no key are
needed to start, the first call lands in seconds.
The free tier is 20 free calls per day, then they upgrade.
Now make a call with malformed
arguments, for example a memory write with an empty fact. The call is
rejected, and the rejection still returns a receipt link. Open it: the
attempt is on the record, marked as what it is. For comparison, a normal
successful record: https://zambo.dev/run/ef28b4c2-4355-479e-bd43-22a05122a574

A rejection receipt carries the same fields as a success receipt, sits in
the same sequence, and verifies by the same check, except that it carries
no result.

## The honest boundary

A receipt for a rejected call proves the attempt was recorded and the
record was not changed afterward. It does not prove the rejection was
correct. Whether a refusal was the right call is a policy question, and the
record's job is narrower: to make sure the question can be asked later,
with the attempt in front of the person asking. The same boundary applies
to successful receipts, and it is stated in full in
[Verify AI agent work before you trust it](https://github.com/zambodotdev/zambo-mcp/blob/main/docs/verify-ai-agent-work.md).

## Related

- How the corpus tests verifiers that implement this rule:
  [Run the AER-1 conformance corpus](./conformance-corpus.md)
- How outcomes, including the ones for calls and checks that never
  completed, are reported: [Four outcomes, never two](./four-outcomes.md)

## Closing note

The rule costs nothing to test at free-tier volume. Where calls run all
day, a Day Pass is $0.99 USDC on Base for 24 hours and the Zambo Pass is $29 for 30 days, one payment. The recording rule is the same at every tier.
