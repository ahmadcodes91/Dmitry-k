import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { authenticateRequest } from "./kimi/auth";
import { verifyLocalToken } from "./localAuth-router";
import { getDb } from "./queries/connection";
import { localUsers } from "@db/schema";
import { eq } from "drizzle-orm";

export type UnifiedUser = {
  id: number;
  name: string | null;
  email: string | null;
  avatar?: string | null;
  role: "user" | "admin";
  source: "oauth" | "local";
};

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user?: UnifiedUser;
};

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<TrpcContext> {
  const ctx: TrpcContext = { req: opts.req, resHeaders: opts.resHeaders };

  // Try Kimi OAuth first
  try {
    const oauthUser = await authenticateRequest(opts.req.headers);
    if (oauthUser) {
      ctx.user = {
        id: oauthUser.id,
        name: oauthUser.name,
        email: oauthUser.email,
        avatar: oauthUser.avatar,
        role: oauthUser.role as "user" | "admin",
        source: "oauth",
      };
      return ctx;
    }
  } catch {
    // OAuth auth failed, try local auth
  }

  // Try local auth via x-local-auth-token header
  try {
    const localToken = opts.req.headers.get("x-local-auth-token");
    if (localToken) {
      const decoded = verifyLocalToken(localToken);
      if (decoded) {
        const db = getDb();
        const rows = await db
          .select()
          .from(localUsers)
          .where(eq(localUsers.id, decoded.userId))
          .limit(1);

        if (rows.length > 0) {
          const localUser = rows[0];
          ctx.user = {
            id: localUser.id,
            name: localUser.displayName || localUser.username,
            email: localUser.email,
            role: localUser.role as "user" | "admin",
            source: "local",
          };
        }
      }
    }
  } catch {
    // Local auth failed
  }

  return ctx;
}
