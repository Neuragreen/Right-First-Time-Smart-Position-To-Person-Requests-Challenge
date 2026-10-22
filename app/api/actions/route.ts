import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { createApiHandlers } from "../../../lib/p2p-store.mjs";
import * as domain from "../../../public/compass/workflow.js";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return createApiHandlers({ getUser: getChatGPTUser, getDatabase: () => env.DB, domain }).actions(request);
}
