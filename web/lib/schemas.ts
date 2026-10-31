import { z } from "zod";

/** Request-body schemas. They encode the limits the routes already enforced by hand. */

export const VID = /^v_[A-Za-z0-9_-]{12,40}$/;
export const SID = /^s_[a-z0-9]{4,16}_[A-Za-z0-9_-]{8,24}$/;

/** A field we sanitize ourselves: anything that is not valid becomes undefined instead of rejecting the body. */
const soft = <T extends z.ZodType>(s: T) => s.optional().catch(undefined);

export const sessionHintsSchema = z.object({
  vid: soft(z.string().regex(VID)),
  ts: soft(z.string().max(2048)),
});

export const trackSchema = z.object({
  t: z.enum(["visit", "click"]),
  vid: soft(z.string().regex(VID)),
  sid: soft(z.string().regex(SID)),
  utm: soft(z.record(z.string(), z.unknown())),
  path: z.unknown().optional(),
  ref: z.unknown().optional(),
  lang: z.unknown().optional(),
  tz: z.unknown().optional(),
  label: z.unknown().optional(),
  href: z.unknown().optional(),
});

export const finishSchema = z.object({
  ticket: soft(z.string()),
  messages: z.array(z.unknown()).catch([]),
});

export const messageSchema = z.object({ role: z.enum(["user", "assistant"]), text: z.string() });

export const toolExecuteSchema = z.object({
  name: z.string().catch(""),
  args: z.unknown().optional(),
});

export const clientErrorSchema = z.object({
  message: z.string().min(1).max(500),
  stack: soft(z.string().max(2000)),
  context: soft(z.string().max(100)),
  path: soft(z.string().max(200)),
});
