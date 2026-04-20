import { authRouter } from "./auth-router";
import { contactRouter } from "./contact-router";
import { localAuthRouter } from "./localAuth-router";
import { reservationRouter } from "./reservation-router";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  localAuth: localAuthRouter,
  contact: contactRouter,
  reservation: reservationRouter,
});

export type AppRouter = typeof appRouter;
