import { createServer, type Server } from "node:http";

export type CommandHandler = (apdu: Uint8Array) => Uint8Array;

export interface ServerHandle {
  server: Server;
  listen(): Promise<number>;
  close(): Promise<void>;
}

export function buildServer(handler: CommandHandler): ServerHandle {
  const server = createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/connector/api") {
      res.statusCode = 404;
      res.end();
      return;
    }
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      try {
        const rsp = handler(new Uint8Array(Buffer.concat(chunks)));
        res.setHeader("Content-Type", "application/octet-stream");
        res.end(Buffer.from(rsp));
      } catch {
        res.statusCode = 500;
        res.end();
      }
    });
  });
  return {
    server,
    listen() {
      return new Promise<number>((resolve) => {
        server.listen(0, "127.0.0.1", () => {
          const addr = server.address();
          if (addr && typeof addr !== "string") {
            resolve(addr.port);
          } else {
            resolve(0);
          }
        });
      });
    },
    close() {
      return new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
