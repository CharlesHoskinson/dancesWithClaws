# Building a Cardano plugin

Every plugin follows the same structure:

```
extensions/cardano-yourservice/
  package.json
  tsconfig.json
  vitest.config.ts
  src/
    index.ts          # Plugin entry point
    client.ts         # HTTP client
    types.ts          # Response types
    tools/
      your-tool.ts    # Individual tools
      index.ts
    __tests__/
      plugin.test.ts
      client.test.ts
      tools.test.ts
```

## Step 1: Create the client

The client wraps API calls and returns `Result<T>` -- either `{ ok: true, data: T }` or `{ ok: false, error: string }`. No exceptions.

```typescript
// client.ts
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export function createYourClient(config: { apiKey?: string }) {
  async function request<T>(endpoint: string): Promise<Result<T>> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (config.apiKey) headers["x-api-key"] = config.apiKey;

    const res = await fetch(`https://api.yourservice.io${endpoint}`, { headers });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const safeError = text.length > 200 ? `${text.slice(0, 200)}...` : text;
      return { ok: false, error: `${res.status}: ${safeError || res.statusText}` };
    }
    return { ok: true, data: await res.json() };
  }

  return {
    async getSomething(id: string) {
      return request<YourType>(`/things/${encodeURIComponent(id)}`);
    },
  };
}
```

## Step 2: Create tools

Each tool has a name, description, TypeBox schema, and execute function:

```typescript
// tools/get-something.ts
import { Type } from "@sinclair/typebox";

export function createGetSomethingTool(client: YourClient) {
  return {
    name: "yourservice_get_something",
    description: "Fetches something from YourService.",
    parameters: Type.Object({
      id: Type.String({ description: "The thing ID" }),
    }),
    async execute(_conversationId: string, args: unknown) {
      const { id } = args as { id: string };
      if (!id) return [{ type: "text", text: JSON.stringify({ error: "id required" }) }];

      const result = await client.getSomething(id);
      if (!result.ok) return [{ type: "text", text: JSON.stringify({ error: result.error }) }];
      return [{ type: "text", text: JSON.stringify(result.data) }];
    },
  };
}
```

## Step 3: Wire up the plugin

```typescript
// index.ts
function validateApiKey(key: string | undefined, name: string): string | undefined {
  if (!key) return undefined;
  if (key.length < 16) console.warn(`[${name}] API key too short`);
  return key;
}

export function createYourPlugin() {
  return {
    id: "cardano-yourservice",
    name: "Your Service",
    register(api) {
      const config = api.pluginConfig ?? {};
      if (config.enabled === false) return;

      const apiKey = validateApiKey(
        config.apiKey || process.env.YOUR_API_KEY,
        "cardano-yourservice",
      );
      const client = createYourClient({ apiKey });

      api.registerTool(() => createGetSomethingTool(client), { name: "yourservice_get_something" });
    },
  };
}
```

## Step 4: Write tests

Test the client with mocked fetch, the tools with mocked client responses, and the plugin registration:

```typescript
// __tests__/client.test.ts
describe("client", () => {
  it("adds api key header", async () => {
    mockFetch.mockResolvedValue(mockJson({ data: "test" }));
    await createYourClient({ apiKey: "secret" }).getSomething("123");
    expect(mockFetch.mock.calls[0][1].headers["x-api-key"]).toBe("secret");
  });
});
```

Run tests: `npx vitest run extensions/cardano-yourservice/`

## Architecture diagrams

C4 model docs in [`docs/architecture/`](architecture/):

- [System context](architecture/c4-context.md) -- what talks to what
- [Containers](architecture/c4-containers.md) -- the 8 plugins
- [Components](architecture/c4-components-plugin.md) -- inside a plugin
- [Request flow](architecture/c4-dynamic-tool-execution.md) -- how a tool call works
