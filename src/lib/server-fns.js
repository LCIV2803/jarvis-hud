import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/lib/auth-middleware";

export const getServerInfo = createServerFn({ method: "GET" }).handler(async () => ({
  renderedAt: new Date().toISOString(),
}));

// Jarvis's web voice: one consistent AI voice for every reply, in the language spoken.
export const generateJarvisSpeech = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ text: z.string().min(1).max(1000) }))
  .handler(async ({ data, context }) => {
    const result = await context.getBase44().asServiceRole.integrations.Core.GenerateSpeech({
      text: data.text,
      voice: "storm",
    });
    return { url: result?.url };
  });