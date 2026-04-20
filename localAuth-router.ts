import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { localUsers } from "@db/schema";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

const JWT_SECRET = process.env.SESSION_SECRET || "local-auth-secret-key";

function generateToken(userId: number): string {
  return jwt.sign({ userId, type: "local" }, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyLocalToken(token: string): { userId: number } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { clockTolerance: 60 }) as { userId: number; type: string };
    if (decoded.type === "local") {
      return { userId: decoded.userId };
    }
    return null;
  } catch {
    return null;
  }
}

export const localAuthRouter = createRouter({
  register: publicQuery
    .input(
      z.object({
        username: z.string().min(3).max(50),
        password: z.string().min(6).max(100),
        displayName: z.string().optional(),
        email: z.string().email().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const existing = await db
        .select()
        .from(localUsers)
        .where(eq(localUsers.username, input.username))
        .limit(1);

      if (existing.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Username already exists",
        });
      }

      const passwordHash = await bcrypt.hash(input.password, 12);
      const result = await db.insert(localUsers).values({
        username: input.username,
        passwordHash,
        displayName: input.displayName || input.username,
        email: input.email || null,
      });

      const userId = Number(result[0].insertId);
      const token = generateToken(userId);

      return { token, userId };
    }),

  login: publicQuery
    .input(
      z.object({
        username: z.string().min(1),
        password: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(localUsers)
        .where(eq(localUsers.username, input.username))
        .limit(1);

      if (rows.length === 0) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid username or password",
        });
      }

      const user = rows[0];
      const valid = await bcrypt.compare(input.password, user.passwordHash);

      if (!valid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid username or password",
        });
      }

      const token = generateToken(user.id);
      return {
        token,
        user: {
          id: user.id,
          name: user.displayName || user.username,
          username: user.username,
          email: user.email,
          role: user.role,
        },
      };
    }),

  me: publicQuery.query(async ({ ctx }) => {
    const authHeader = ctx.req.headers.get("x-local-auth-token");
    if (!authHeader) {
      return null;
    }

    const decoded = verifyLocalToken(authHeader);
    if (!decoded) {
      return null;
    }

    const db = getDb();
    const rows = await db
      .select()
      .from(localUsers)
      .where(eq(localUsers.id, decoded.userId))
      .limit(1);

    if (rows.length === 0) {
      return null;
    }

    const user = rows[0];
    return {
      id: user.id,
      name: user.displayName || user.username,
      username: user.username,
      email: user.email,
      role: user.role,
    };
  }),
});
