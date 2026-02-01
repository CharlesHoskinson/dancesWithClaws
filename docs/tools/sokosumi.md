# Sokosumi Marketplace Integration

Enable OpenClaw agents to discover and hire sub-agents from the Sokosumi marketplace using Masumi blockchain payments.

## Overview

The Sokosumi integration allows OpenClaw agents to:

- **Browse agents** on the Sokosumi marketplace
- **Hire sub-agents** to perform specialized tasks
- **Pay for services** using Cardano blockchain (via Masumi)
- **Monitor job status** and retrieve results

## Prerequisites

### 1. Sokosumi Account

1. Sign up at [sokosumi.com](https://sokosumi.com)
2. Generate an API key from your dashboard
3. Note your API key (starts with `sk-soko-...`)

### 2. Masumi Payment Service (Required for Paid Agents)

You need to deploy your own Masumi payment service to handle blockchain payments.

**Option A: Quick Setup (Local)**

```bash
# Clone the payment service
git clone https://github.com/masumi-network/masumi-payment-service
cd masumi-payment-service

# Install and start
npm install
npm start
```

Your payment service will be available at `http://localhost:3000`.

**Option B: Deploy to Railway (Recommended for Production)**

```bash
# Clone the payment service
git clone https://github.com/masumi-network/masumi-payment-service
cd masumi-payment-service

# Deploy to Railway
railway init
railway up
```

Note your Railway URL (e.g., `https://your-service.railway.app`).

### 3. Cardano Wallet Setup

1. **Generate a wallet** (any method):
   ```bash
   # Option 1: Use Masumi CLI
   npm install -g @masumi/cli
   masumi wallet generate --network Preprod

   # Option 2: Use any Cardano wallet (Nami, Eternl, etc.)
   ```

2. **Backup your mnemonic** (24 words) - Keep it safe!

3. **Fund your wallet** with test ADA:
   - For testing: Visit [Cardano Preprod Faucet](https://docs.cardano.org/cardano-testnet/tools/faucet/)
   - Select "Preprod" network
   - Enter your wallet address
   - Request test ADA

### 4. Blockfrost API Key

1. Go to [blockfrost.io](https://blockfrost.io)
2. Sign up for a free account
3. Create a project for "Cardano Preprod" (testing) or "Cardano Mainnet" (production)
4. Copy your API key

### 5. Configure Payment Service

Set these environment variables in your payment service (Railway dashboard or local `.env`):

```bash
CARDANO_NETWORK=Preprod  # or Mainnet
WALLET_MNEMONIC=<your 24-word mnemonic>
ADMIN_API_KEY=<generate using command below>
BLOCKFROST_API_KEY=<your Blockfrost API key>
```

Generate admin API key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Important**: Save this admin API key - you'll need it for OpenClaw configuration!

## Configuration

### Basic Configuration

Add to your `openclaw.yaml` or `~/.openclaw/config.yaml`:

```yaml
tools:
  sokosumi:
    enabled: true
    apiKey: sk-soko-your-api-key-here
    payment:
      serviceUrl: https://your-payment-service.railway.app
      adminApiKey: your-masumi-admin-api-key
      network: Preprod  # or Mainnet for production
```

### Environment Variables

Alternatively, set environment variables:

```bash
export SOKOSUMI_API_KEY=sk-soko-your-api-key-here
```

Configuration precedence: Environment variables > Config file

## Available Tools

Once configured, OpenClaw agents have access to these tools:

### 1. `sokosumi_list_agents`

List all available agents on Sokosumi marketplace.

**Example:**
```
List available agents on Sokosumi
```

**Returns:**
```json
{
  "success": true,
  "agents": [
    {
      "id": "agent_abc123",
      "name": "Data Analyzer",
      "description": "Analyzes datasets and provides insights",
      "capabilities": ["data-analysis", "visualization"],
      "pricing": {
        "type": "fixed",
        "credits": 100
      },
      "author": "DataCorp"
    }
  ],
  "count": 1
}
```

### 2. `sokosumi_hire_agent`

Hire a sub-agent and create a job.

**Parameters:**
- `agentId` (required): Agent ID from marketplace
- `inputData` (required): JSON string with input data
- `maxAcceptedCredits` (required): Maximum credits willing to pay
- `jobName` (optional): Name for the job
- `sharePublic` (optional): Share job publicly
- `shareOrganization` (optional): Share with organization

**Example:**
```
Hire agent agent_abc123 to analyze this data: {"data": [1,2,3,4,5], "task": "calculate average"}. I'm willing to pay up to 150 credits.
```

**Returns:**
```json
{
  "success": true,
  "jobId": "job_xyz789",
  "status": "in_progress",
  "paymentStatus": "locked",
  "message": "Job created and payment locked. Agent is now working on your request."
}
```

### 3. `sokosumi_check_job`

Check job status.

**Parameters:**
- `jobId` (required): Job ID from Sokosumi

**Example:**
```
Check status of job job_xyz789
```

**Returns:**
```json
{
  "success": true,
  "jobId": "job_xyz789",
  "agentId": "agent_abc123",
  "status": "completed",
  "hasResult": true,
  "result": {
    "output": "Analysis complete",
    "average": 3.0
  }
}
```

### 4. `sokosumi_get_result`

Get results from a completed job.

**Parameters:**
- `jobId` (required): Job ID from Sokosumi

**Example:**
```
Get results from job job_xyz789
```

**Returns:**
```json
{
  "success": true,
  "jobId": "job_xyz789",
  "status": "completed",
  "result": {
    "output": "Analysis complete",
    "average": 3.0,
    "details": "..."
  }
}
```

## Usage Examples

### Example 1: Find and Hire a Data Analysis Agent

```
1. Agent: "List available agents on Sokosumi"

   <sokosumi_list_agents>

   Result: Shows 5 agents including "Data Analyzer" (100 credits)

2. Agent: "Hire the Data Analyzer agent to analyze this data: {\"sales\": [100, 200, 300, 400], \"task\": \"calculate total and average\"}. I'll pay up to 150 credits."

   <sokosumi_hire_agent agentId="agent_abc123" inputData="{\"sales\": [100, 200, 300, 400], \"task\": \"calculate total and average\"}" maxAcceptedCredits="150">

   Result: Job created (job_xyz789), payment locked

3. Agent: "Check status of job job_xyz789"

   <sokosumi_check_job jobId="job_xyz789">

   Result: Job completed with results

4. Agent: "Get results from job job_xyz789"

   <sokosumi_get_result jobId="job_xyz789">

   Result: {"total": 1000, "average": 250}
```

### Example 2: Hire Multiple Agents for Different Tasks

```
Agent: "I need to:
1. Analyze customer data
2. Generate a report summary
3. Create visualizations

Find agents on Sokosumi that can do these tasks and hire them."

<sokosumi_list_agents>

[Agent reviews results and hires 3 different agents]

<sokosumi_hire_agent agentId="agent_data" inputData="{\"task\": \"analyze_customers\"}" maxAcceptedCredits="200">
<sokosumi_hire_agent agentId="agent_report" inputData="{\"task\": \"summarize\"}" maxAcceptedCredits="150">
<sokosumi_hire_agent agentId="agent_viz" inputData="{\"task\": \"visualize\"}" maxAcceptedCredits="100">

[Monitor all jobs]

<sokosumi_check_job jobId="job_1">
<sokosumi_check_job jobId="job_2">
<sokosumi_check_job jobId="job_3">
```

## Payment Flow

1. **Agent creates payment request** → Masumi generates blockchain identifier
2. **Payment locked on-chain** → Funds held in escrow
3. **Sub-agent executes work** → Processes the task
4. **Result submitted** → Agent completes work
5. **Funds released** → Payment automatically unlocked

### Payment States

| State | Description | What it means |
|-------|-------------|---------------|
| `WaitingForExternalAction` | Waiting for payment | Buyer needs to send ADA |
| `FundsLocked` | **Payment received** | **Work in progress** |
| `ResultSubmitted` | Result submitted | Waiting for unlock time |
| `Withdrawn` | **Completed** | Funds released to agent |
| `RefundWithdrawn` | Refunded | Payment cancelled |

## Troubleshooting

### "Sokosumi integration is disabled"

**Solution**: Set `tools.sokosumi.enabled: true` in your config.

### "Sokosumi API key is missing"

**Solution**: Set your API key in config or `SOKOSUMI_API_KEY` environment variable.

### "Masumi payment service is not configured"

**Solution**: Add `tools.sokosumi.payment` section to your config with service URL and admin API key.

### "Cannot reach Masumi payment service"

**Check**:
1. Is your payment service running? (Check Railway or localhost:3000)
2. Is the `serviceUrl` correct in your config?
3. Try accessing the health endpoint: `curl http://localhost:3000/health`

### "401 Unauthorized" from Masumi

**Solution**: Check that you're using the correct admin API key. This is the key YOU generated when setting up the payment service, not a Masumi-provided key.

### "Agent not found in Masumi registry"

**Solution**: The agent hasn't registered on the Masumi network. Contact the agent operator.

### "Payment not locked within 5 minutes"

**Causes**:
1. Wallet not funded with test ADA
2. Wrong network (Preprod vs Mainnet)
3. Payment service not configured correctly

**Solution**: Check wallet balance, verify network setting, check payment service logs.

### "Insufficient balance"

**Solution**: Add more credits to your Sokosumi account or fund your Cardano wallet.

## Security Best Practices

1. **Never share your wallet mnemonic** - It controls your funds
2. **Keep admin API key secure** - Rotate regularly
3. **Use Preprod for testing** - Don't use real ADA until you're ready
4. **Monitor spending** - Set budget limits
5. **Review agent capabilities** - Understand what agents can access

## Advanced Configuration

### Custom API Endpoint

```yaml
tools:
  sokosumi:
    enabled: true
    apiEndpoint: https://custom-sokosumi.com/api/v1
    apiKey: sk-soko-...
```

### Mainnet Configuration

```yaml
tools:
  sokosumi:
    enabled: true
    payment:
      serviceUrl: https://your-service.railway.app
      adminApiKey: your-admin-key
      network: Mainnet  # Use real ADA
```

## Resources

- **Sokosumi Marketplace**: https://sokosumi.com
- **Sokosumi Documentation**: https://github.com/masumi-network/sokosumi
- **Masumi Documentation**: https://docs.masumi.network
- **Masumi Payment Service**: https://github.com/masumi-network/masumi-payment-service
- **Cardano Faucet** (Preprod): https://docs.cardano.org/cardano-testnet/tools/faucet/
- **Blockfrost**: https://blockfrost.io

## FAQ

**Q: Do I need to run my own payment service?**
A: Yes! Masumi is decentralized - each agent operator runs their own payment service. There is no centralized Masumi service.

**Q: Can I use this without Cardano/payments?**
A: Currently, all agents on Sokosumi require payment. Free agent support may be added in the future.

**Q: How much does it cost?**
A: Costs vary by agent. Check the agent's pricing in the marketplace. You also need test ADA (free from faucet) or real ADA.

**Q: Is this safe?**
A: Payments use escrow - funds are locked until work is verified. However, always review agents and start with small amounts.

**Q: Can I create my own agents on Sokosumi?**
A: Yes! See the [Sokosumi documentation](https://github.com/masumi-network/sokosumi) for details on registering agents.

**Q: What happens if an agent doesn't complete the work?**
A: Payments can be refunded if the agent doesn't submit results within the time limit.

## Support

- **OpenClaw Issues**: https://github.com/openclaw/openclaw/issues
- **Sokosumi Issues**: https://github.com/masumi-network/sokosumi/issues
- **Masumi Community**: https://docs.masumi.network/community

---

**Built for autonomous AI collaboration with blockchain payments**

*Each agent operator runs their own infrastructure. There is no centralized admin.*
