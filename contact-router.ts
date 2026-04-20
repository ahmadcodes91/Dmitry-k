import { z } from "zod";
import { createRouter, publicQuery, adminQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { contactSubmissions } from "@db/schema";
import { eq, desc, sql } from "drizzle-orm";

export const contactRouter = createRouter({
  submit: publicQuery
    .input(
      z.object({
        name: z.string().min(1).max(255),
        email: z.string().email(),
        phone: z.string().max(50).optional(),
        message: z.string().min(1),
        propertyInterest: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const result = await db.insert(contactSubmissions).values({
        name: input.name,
        email: input.email,
        phone: input.phone ?? null,
        message: input.message,
        propertyInterest: input.propertyInterest ?? null,
      });
      return { id: Number(result[0].insertId), success: true };
    }),

  list: adminQuery
    .input(
      z.object({
        status: z.enum(["new", "read", "replied", "archived"]).optional(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
      }).optional()
    )
    .query(async ({ input }) => {
      const db = getDb();
      const page = input?.page ?? 1;
      const limit = input?.limit ?? 20;
      const offset = (page - 1) * limit;

      let query = db.select().from(contactSubmissions).orderBy(desc(contactSubmissions.createdAt));

      if (input?.status) {
        const rows = await db
          .select()
          .from(contactSubmissions)
          .where(eq(contactSubmissions.status, input.status))
          .orderBy(desc(contactSubmissions.createdAt))
          .limit(limit)
          .offset(offset);

        const countResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(contactSubmissions)
          .where(eq(contactSubmissions.status, input.status));

        return {
          items: rows,
          total: Number(countResult[0].count),
          page,
          limit,
        };
      }

      const rows = await query.limit(limit).offset(offset);
      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(contactSubmissions);

      return {
        items: rows,
        total: Number(countResult[0].count),
        page,
        limit,
      };
    }),

  getById: adminQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(contactSubmissions)
        .where(eq(contactSubmissions.id, input.id))
        .limit(1);

      if (rows.length === 0) {
        return null;
      }
      return rows[0];
    }),

  updateStatus: adminQuery
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["new", "read", "replied", "archived"]),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      await db
        .update(contactSubmissions)
        .set({ status: input.status })
        .where(eq(contactSubmissions.id, input.id));
      return { success: true };
    }),

  delete: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db
        .delete(contactSubmissions)
        .where(eq(contactSubmissions.id, input.id));
      return { success: true };
    }),

  stats: adminQuery.query(async () => {
    const db = getDb();
    const allStatuses = await db
      .select({
        status: contactSubmissions.status,
        count: sql<number>`count(*)`,
      })
      .from(contactSubmissions)
      .groupBy(contactSubmissions.status);

    const total = await db
      .select({ count: sql<number>`count(*)` })
      .from(contactSubmissions);

    return {
      byStatus: allStatuses,
      total: Number(total[0].count),
    };
  }),
});
