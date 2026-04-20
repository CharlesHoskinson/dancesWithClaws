import { buildServer, type CommandHandler, type ServerHandle } from "./server.js";

export interface SimulatorHandle {
  readonly port: number;
  readonly running: boolean;
  start(): Promise<number>;
  stop(): Promise<void>;
}

function defaultHandler(): CommandHandler {
  return () => new Uint8Array([0x7f, 0x00, 0x01, 0x10]);
}

export function createSimulator(handler: CommandHandler = defaultHandler()): SimulatorHandle {
  let port = 0;
  let running = false;
  let built: ServerHandle | undefined;
  return {
    get port() {
      return port;
    },
    get running() {
      return running;
    },
    async start() {
      built = buildServer(handler);
      port = await built.listen();
      running = true;
      return port;
    },
    async stop() {
      if (built) {
        await built.close();
      }
      running = false;
      port = 0;
      built = undefined;
    },
  };
}

export * from "./handlers.js";
export * from "./server.js";
export * from "./store.js";
export * from "./sessions.js";
