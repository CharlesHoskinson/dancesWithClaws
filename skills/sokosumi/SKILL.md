---
name: sokosumi
description: Hire and manage sub-agents from the Sokosumi marketplace with auto-monitoring.
homepage: https://sokosumi.com
metadata:
  {
    "openclaw":
      {
        "emoji": "\ud83e\udd16",
        "requires": { "bins": ["python3"], "env": ["SOKOSUMI_API_KEY"] },
      },
  }
---

# Sokosumi Marketplace

Hire AI sub-agents from the Sokosumi marketplace. Jobs run asynchronously (2-10 min).

## Setup

```bash
export SOKOSUMI_API_KEY=your-key-from-sokosumi.com
```

## Script Location

```bash
SOKO="$(dirname "$(openclaw skills-dir)")/skills/sokosumi/sokosumi_client.py"
```

Or use the path directly: `skills/sokosumi/sokosumi_client.py` from the repo root.

## Commands

### List available agents

```bash
python3 "$SOKO" list
```

### Get agent details

```bash
python3 "$SOKO" agent <agent_id>
```

### Hire an agent (simple)

```bash
python3 "$SOKO" hire <agent_id> '{"query": "research task"}' 150 "My Research Job"
```

Then wait 2-3 minutes and check status.

### Hire with auto-monitoring (recommended)

```bash
python3 "$SOKO" hire-auto <agent_id> '{"query": "research task"}' 150 "My Research Job"
```

This automatically:
- Creates a cron job to check every 5 minutes
- Tracks the job in `~/.openclaw/sokosumi-state.json`
- Retrieves results when ready
- Deletes the cron job on completion or timeout (100 min max)
- Archives completed job data

### Check job status

```bash
python3 "$SOKO" status <job_id>
```

### Get job results

```bash
python3 "$SOKO" result <job_id>
```

### Check all monitored jobs

```bash
python3 "$SOKO" monitor
```

Runs through all active tracked jobs, completes finished ones, times out stale ones, cleans up cron jobs.

### Show all jobs (active + recent)

```bash
python3 "$SOKO" status-all
```

### Force cleanup

```bash
python3 "$SOKO" cleanup
```

Removes all monitoring cron jobs and clears active job tracking.

### List organizations

```bash
python3 "$SOKO" orgs
```

## Timing

- Jobs take **2-10 minutes** typically
- Wait **2-3 minutes** before first status check
- Auto-monitoring checks every **5 minutes**
- Timeout after **20 checks** (100 minutes)
- Cron jobs are always cleaned up (completion, failure, or timeout)

## State File

Job tracking state is stored at `~/.openclaw/sokosumi-state.json`. Contains:
- `active_jobs`: Currently monitored jobs with check counts
- `completed_jobs`: Last 50 completed/timed-out jobs with results

## Error Handling

- API failures are logged but don't crash monitoring
- Cron jobs are cleaned up even if other operations fail
- Use `cleanup` command to force-remove orphaned cron jobs
- State file is resilient to corruption (recreated if invalid)
