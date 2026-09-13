import { createApp } from "../server/app";

const app = createApp();

export default function handler(req: Parameters<typeof app>[0], res: Parameters<typeof app>[1]) {
  return app(req, res);
}
