# Four outcomes, never two

Binary reporting (pass or fail, verified or not) has no state for a check
that was never run. It is where verification goes to be lied about, usually
by accident.
A check that nobody ran gets reported next to checks that passed. A record
that is simply not there gets reported as a record that failed. AER-1
Section 6 fixes a vocabulary with more states, and one hard rule underneath
it: an unevaluated check must never be reported with an evaluated outcome.

The specification is AER-1, draft-zambo-aer1-26:
https://datatracker.ietf.org/doc/draft-zambo-aer1/26/

## See it on a live record first

Here is the designated public sample receipt:
https://zambo.dev/run/ef28b4c2-4355-479e-bd43-22a05122a574

The verify endpoint for that receipt reports each check it ran with its
own outcome, alongside the overall status. Verify it with:

```bash
curl https://zambo.dev/api/v2/receipt/ef28b4c2-4355-479e-bd43-22a05122a574/verify
```

To produce records of your own to check, add the endpoint to an MCP client:

```json
{
  "mcpServers": {
    "zambo": {
      "url": "https://zambo.dev/mcp"
    }
  }
}
```

Per-client steps are at https://zambo.dev/add. No signup, no key
needed, first call in seconds; the free tier is
20 free calls per day, then they upgrade. This vocabulary is specified
in AER-1 Section 6, so other record systems can report the same states
the same way.

## The states

- **Verified.** The check ran, against the actual record, and the record
  recomputed: the saved bytes produce the stored digest, and the binding
  fields hold. This is the only state that means "checked and good".
- **Verification failed.** The check ran and the record did not hold: the
  digest does not recompute, a binding field does not match, the shape is
  wrong. A real evaluation with a bad answer.
- **Absent.** The check ran and the thing it looks for is not there. A read
  that returns nothing is an evaluation, not a shrug: the record, the field,
  or the anchor is absent, and "absent" says exactly that. Absent is not a
  softer word for failed. A missing record did not fail verification; it
  was never available to pass it.
- **Not checked.** Nobody ran the check, or it could not be run. This state
  is a confession about the report, not a claim about the record. It is the
  state binary reporting deletes, and deleting it is how "we checked
  everything" gets printed over a table where half the rows were never
  evaluated.

For anchors, the vocabulary carries one more precise outcome: a record
whose anchor cannot be resolved is reported as "rejected: unresolvable
record". That is a rejection with a named cause, distinct from a content
failure. The anchor might resolve later; the content of the record was
never the problem, and the report must not pretend it was.

## How reports go wrong without the vocabulary

- **Absent collapses into failed.** A status page shows a red mark for a
  record that was never submitted. Someone goes hunting for corruption in a
  file that does not exist.
- **Not checked collapses into verified.** A verifier skips the checks it
  cannot run and reports the overall status of the ones it could. The
  headline says verified; the fine print, if any, lists five of seven
  checks. The two missing checks are exactly the ones a careful reader
  needed.
- **Two reads can give two different evaluated findings.** A lookup finds a record in
  one place and nothing in another, and the report keeps whichever answer
  arrived last. Two evaluated facts about two different reads are not in
  conflict, and a report that flattens them into one loses both.

Each failure is a reporting failure before it is a data failure. The data
was fine. The sentence about the data was wrong.

## Apply it to any verifier

Whatever you use to check records, hold its reporting to three rules:

1. Every check in the report carries one of the evaluated states or is
   marked not checked. There is no third option where a check is silently
   missing from the table.
2. The overall verdict never upgrades a component. If any component is not
   checked, the overall verdict must not be reported as verified; report
   the overall as not checked and name the unchecked components.
3. Absence is reported as its own finding, with the read that produced it
   named: what was queried, where, and what came back (nothing).

The AER-1 conformance corpus tests this vocabulary directly: its anchor
vectors include the unresolvable case, and a verifier that reports it as
verified or as a plain failure fails the vector. See
[Run the AER-1 conformance corpus](./conformance-corpus.md).

## Related

- Why checks exist even for calls that produced nothing:
  [Every call gets a receipt](./every-call-gets-a-receipt.md)
- The method the vocabulary serves:
  [Verify AI agent work before you trust it](https://github.com/zambodotdev/zambo-mcp/blob/main/docs/verify-ai-agent-work.md)

## Closing note

Reading reports costs nothing. Producing records at all-day volume is a
Day Pass at $0.99 USDC on Base for 24 hours or the Zambo Pass at $29 for 30 days, one payment. The vocabulary above applies identically either way.
