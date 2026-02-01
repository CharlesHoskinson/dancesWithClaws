#!/usr/bin/env python3
"""Sokosumi marketplace CLI client with auto-monitoring.

Usage:
    python3 sokosumi_client.py list
    python3 sokosumi_client.py agent <agent_id>
    python3 sokosumi_client.py hire <agent_id> '<json_input>' <max_credits> [job_name]
    python3 sokosumi_client.py hire-auto <agent_id> '<json_input>' <max_credits> [job_name]
    python3 sokosumi_client.py status <job_id>
    python3 sokosumi_client.py result <job_id>
    python3 sokosumi_client.py orgs
    python3 sokosumi_client.py monitor
    python3 sokosumi_client.py cleanup
    python3 sokosumi_client.py status-all

Environment:
    SOKOSUMI_API_KEY  - Required. Your Sokosumi API key.
"""

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

API_BASE = "https://api.sokosumi.com/v1"
STATE_FILE = Path.home() / ".openclaw" / "sokosumi-state.json"
MAX_CHECKS = 20  # 20 checks * 5 min = 100 min timeout


def get_api_key() -> str:
    key = os.environ.get("SOKOSUMI_API_KEY", "").strip()
    if not key:
        print("Error: SOKOSUMI_API_KEY environment variable not set.", file=sys.stderr)
        sys.exit(1)
    return key


def api_request(method: str, path: str, body: dict | None = None) -> dict:
    url = f"{API_BASE}{path}"
    headers = {
        "Authorization": f"Bearer {get_api_key()}",
        "Content-Type": "application/json",
    }
    data = json.dumps(body).encode() if body else None
    req = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except HTTPError as e:
        error_body = e.read().decode() if e.fp else str(e)
        print(f"API error ({e.code}): {error_body}", file=sys.stderr)
        sys.exit(1)
    except URLError as e:
        print(f"Network error: {e.reason}", file=sys.stderr)
        sys.exit(1)


# --- State management ---


def load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return {"active_jobs": {}, "completed_jobs": []}


def save_state(state: dict) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2))


def track_active_job(
    job_id: str, hire_result: dict, cron_job_id: str | None = None
) -> None:
    state = load_state()
    state["active_jobs"][job_id] = {
        "agentId": hire_result.get("agentId", ""),
        "agentName": hire_result.get("agentName", ""),
        "hiredAt": datetime.now(timezone.utc).isoformat(),
        "cronJobId": cron_job_id,
        "checkCount": 0,
        "maxChecks": MAX_CHECKS,
    }
    save_state(state)


def complete_job(job_id: str, results: dict) -> None:
    state = load_state()
    job_info = state["active_jobs"].pop(job_id, {})
    job_info["completedAt"] = datetime.now(timezone.utc).isoformat()
    job_info["results"] = results
    job_info["jobId"] = job_id
    state["completed_jobs"].append(job_info)
    state["completed_jobs"] = state["completed_jobs"][-50:]
    save_state(state)


def timeout_job(job_id: str, job_info: dict) -> None:
    state = load_state()
    state["active_jobs"].pop(job_id, None)
    job_info["timedOutAt"] = datetime.now(timezone.utc).isoformat()
    job_info["jobId"] = job_id
    job_info["status"] = "timed_out"
    state["completed_jobs"].append(job_info)
    save_state(state)


# --- Cron job management ---


def openclaw_cron_add(payload: dict) -> dict | None:
    """Create an OpenClaw cron job. Returns cron job info or None."""
    try:
        result = subprocess.run(
            ["openclaw", "cron", "add", "--json", json.dumps(payload)],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0:
            return json.loads(result.stdout)
    except (FileNotFoundError, subprocess.TimeoutExpired, json.JSONDecodeError):
        pass
    return None


def openclaw_cron_remove(cron_job_id: str) -> bool:
    """Remove an OpenClaw cron job. Returns True on success."""
    try:
        result = subprocess.run(
            ["openclaw", "cron", "remove", cron_job_id],
            capture_output=True,
            text=True,
            timeout=10,
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def create_monitoring_cron(job_id: str) -> str | None:
    """Create a cron job to monitor a Sokosumi job every 5 minutes."""
    cron_payload = {
        "name": f"Sokosumi Monitor - {job_id[:8]}",
        "schedule": {"kind": "cron", "expr": "*/5 * * * *"},
        "payload": {
            "kind": "systemEvent",
            "text": f"Check Sokosumi job {job_id}: python3 {__file__} monitor",
        },
        "sessionTarget": "main",
        "enabled": True,
    }
    result = openclaw_cron_add(cron_payload)
    if result and "id" in result:
        return result["id"]
    return None


def delete_monitoring_cron(cron_job_id: str | None) -> None:
    """Delete a monitoring cron job if it exists."""
    if cron_job_id:
        openclaw_cron_remove(cron_job_id)


# --- Commands ---


def cmd_list() -> None:
    """List available agents."""
    data = api_request("GET", "/agents")
    agents = data.get("data", data.get("agents", []))
    if not agents:
        print("No agents available.")
        return
    for a in agents:
        pricing = a.get("pricing", {})
        credits_str = ""
        if pricing.get("credits"):
            credits_str = f" ({pricing['credits']} credits)"
        elif pricing.get("amounts"):
            amounts = pricing["amounts"]
            credits_str = (
                f" ({amounts[0].get('amount', '?')} {amounts[0].get('unit', '')})"
            )
        print(f"  {a['id']}  {a.get('name', 'unnamed')}{credits_str}")
        if a.get("description"):
            print(f"    {a['description'][:100]}")


def cmd_agent(agent_id: str) -> None:
    """Get agent details."""
    data = api_request("GET", f"/agents/{agent_id}")
    print(json.dumps(data, indent=2))


def cmd_hire(
    agent_id: str, input_json: str, max_credits: int, job_name: str | None = None
) -> dict:
    """Hire an agent (create a job)."""
    try:
        input_data = json.loads(input_json)
    except json.JSONDecodeError:
        print("Error: input must be valid JSON.", file=sys.stderr)
        sys.exit(1)

    body: dict = {
        "inputData": input_data,
        "maxAcceptedCredits": max_credits,
    }
    if job_name:
        body["name"] = job_name

    data = api_request("POST", f"/agents/{agent_id}/jobs", body)
    job = data.get("data", data)
    job_id = job.get("id", job.get("jobId", "unknown"))
    print(f"Job created: {job_id}")
    print(f"Status: {job.get('status', 'unknown')}")
    print(
        f"Jobs typically take 2-10 minutes. "
        f"Check with: python3 {os.path.basename(__file__)} status {job_id}"
    )
    return job


def cmd_hire_auto(
    agent_id: str, input_json: str, max_credits: int, job_name: str | None = None
) -> None:
    """Hire an agent with automatic monitoring and cleanup."""
    job = cmd_hire(agent_id, input_json, max_credits, job_name)
    job_id = job.get("id", job.get("jobId"))
    if not job_id:
        print("Warning: Could not extract job ID for monitoring.", file=sys.stderr)
        return

    cron_id = create_monitoring_cron(job_id)
    if cron_id:
        print(f"Auto-monitoring enabled (cron: {cron_id}, every 5 min)")
    else:
        print("Note: Cron not available. Use 'monitor' command to check manually.")

    track_active_job(
        job_id,
        {"agentId": agent_id, "agentName": job_name or agent_id},
        cron_id,
    )

    print(
        json.dumps(
            {
                "jobId": job_id,
                "monitoring": {
                    "cronJobId": cron_id,
                    "checkInterval": "5 minutes",
                    "autoCleanup": True,
                    "maxChecks": MAX_CHECKS,
                },
            },
            indent=2,
        )
    )


def cmd_status(job_id: str) -> None:
    """Check job status."""
    data = api_request("GET", f"/jobs/{job_id}")
    job = data.get("data", data)
    print(json.dumps(job, indent=2))


def cmd_result(job_id: str) -> None:
    """Get job result."""
    data = api_request("GET", f"/jobs/{job_id}")
    job = data.get("data", data)
    status = job.get("status", "")
    if status != "completed":
        print(f"Job not completed yet. Status: {status}")
        return
    result = job.get("result", job.get("output", {}))
    print(json.dumps(result, indent=2))


def cmd_orgs() -> None:
    """List organizations."""
    data = api_request("GET", "/orgs")
    print(json.dumps(data, indent=2))


def cmd_monitor() -> None:
    """Check all monitored jobs. Complete or timeout as needed."""
    state = load_state()
    active = state.get("active_jobs", {})
    if not active:
        print("No active monitored jobs.")
        return

    print(f"Checking {len(active)} active job(s)...")
    completed_ids = []
    timed_out_ids = []

    for job_id, job_info in list(active.items()):
        job_info["checkCount"] = job_info.get("checkCount", 0) + 1
        print(f"\n  Job {job_id[:12]}... (check #{job_info['checkCount']})")

        try:
            data = api_request("GET", f"/jobs/{job_id}")
            job = data.get("data", data)
            status = job.get("status", "unknown")
            print(f"    Status: {status}")

            if status == "completed":
                result = job.get("result", job.get("output", {}))
                delete_monitoring_cron(job_info.get("cronJobId"))
                complete_job(job_id, result)
                completed_ids.append(job_id)
                print("    Completed! Results saved. Cron cleaned up.")
                print(f"    Result: {json.dumps(result, indent=2)[:500]}")

            elif status == "failed":
                delete_monitoring_cron(job_info.get("cronJobId"))
                timeout_job(job_id, job_info)
                timed_out_ids.append(job_id)
                print("    Failed. Cron cleaned up.")

            elif job_info["checkCount"] >= MAX_CHECKS:
                delete_monitoring_cron(job_info.get("cronJobId"))
                timeout_job(job_id, job_info)
                timed_out_ids.append(job_id)
                print(f"    Timed out after {MAX_CHECKS} checks. Cron cleaned up.")

        except SystemExit:
            print("    Error checking job (will retry next cycle).")

    save_state(load_state())

    still_active = len(active) - len(completed_ids) - len(timed_out_ids)
    print(
        f"\nSummary: {len(completed_ids)} completed, "
        f"{len(timed_out_ids)} timed out, {still_active} still active."
    )


def cmd_cleanup() -> None:
    """Force cleanup of all monitoring cron jobs and stale state."""
    state = load_state()
    active = state.get("active_jobs", {})
    cleaned = 0
    for job_id, job_info in list(active.items()):
        cron_id = job_info.get("cronJobId")
        if cron_id:
            delete_monitoring_cron(cron_id)
            cleaned += 1
        timeout_job(job_id, job_info)
    print(f"Cleaned up {cleaned} cron job(s) and {len(active)} tracked job(s).")


def cmd_status_all() -> None:
    """Show all active and recent completed jobs."""
    state = load_state()
    active = state.get("active_jobs", {})
    completed = state.get("completed_jobs", [])

    if active:
        print(f"Active jobs ({len(active)}):")
        for job_id, info in active.items():
            checks = info.get("checkCount", 0)
            print(
                f"  {job_id[:12]}...  agent={info.get('agentName', '?')}  "
                f"checks={checks}/{MAX_CHECKS}  hired={info.get('hiredAt', '?')}"
            )
    else:
        print("No active jobs.")

    if completed:
        print(f"\nRecent completed ({len(completed)}):")
        for job in completed[-10:]:
            status = job.get("status", "completed")
            done_at = job.get("completedAt", job.get("timedOutAt", "?"))
            print(
                f"  {job.get('jobId', '?')[:12]}...  "
                f"status={status}  completed={done_at}"
            )
    else:
        print("\nNo completed jobs.")


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == "list":
        cmd_list()
    elif cmd == "agent" and len(sys.argv) >= 3:
        cmd_agent(sys.argv[2])
    elif cmd == "hire" and len(sys.argv) >= 5:
        name = sys.argv[5] if len(sys.argv) > 5 else None
        cmd_hire(sys.argv[2], sys.argv[3], int(sys.argv[4]), name)
    elif cmd == "hire-auto" and len(sys.argv) >= 5:
        name = sys.argv[5] if len(sys.argv) > 5 else None
        cmd_hire_auto(sys.argv[2], sys.argv[3], int(sys.argv[4]), name)
    elif cmd == "status" and len(sys.argv) >= 3:
        cmd_status(sys.argv[2])
    elif cmd == "result" and len(sys.argv) >= 3:
        cmd_result(sys.argv[2])
    elif cmd == "orgs":
        cmd_orgs()
    elif cmd == "monitor":
        cmd_monitor()
    elif cmd == "cleanup":
        cmd_cleanup()
    elif cmd == "status-all":
        cmd_status_all()
    else:
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
