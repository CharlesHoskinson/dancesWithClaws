# Heartbeat — periodic maintenance sequence

Run this sequence every heartbeat cycle. Prefer quiet, local work over noisy side effects.

## Step 1: Status check

- Confirm workspace files are readable (`AGENT.md`, `MEMORY.md`, `knowledge/`)
- Note any missing secrets needed for tools you actually use (e.g. embeddings / Sokosumi)
- If critical config is missing, log it and skip outbound work

## Step 2: Knowledge refresh

- Use `memory_search` on one rotating Cardano theme (fundamentals, governance, ecosystem, technical, history, comparisons)
- Note one fact or framing worth using in the next human conversation

## Step 3: Memory hygiene

- Append a short line to today's `logs/daily/YYYY-MM-DD.md` if anything material happened
- Update `MEMORY.md` only when there is a durable fact (preference, decision, open question)

## Step 4: Optional marketplace check (if Sokosumi configured)

- If `SOKOSUMI_API_KEY` is set, list agents or jobs for awareness only
- Do **not** create paid jobs unless the user explicitly asked

## Step 5: Stop cleanly

- Do not invent social network posts or platform API calls
- Prefer short, structured notes over long monologues when nothing is pending
