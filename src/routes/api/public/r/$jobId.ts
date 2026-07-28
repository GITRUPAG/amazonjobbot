import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/r/$jobId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const jobId = params.jobId;
        const { data: job } = await supabaseAdmin
          .from("jobs")
          .select("url")
          .eq("id", jobId)
          .maybeSingle();
        if (!job?.url) return new Response("Not found", { status: 404 });

        const url = new URL(request.url);
        const subscriberId = url.searchParams.get("u");

        // Fire-and-forget click record.
        supabaseAdmin
          .from("clicks")
          .insert({
            job_id: jobId,
            subscriber_id: subscriberId ?? null,
            user_agent: request.headers.get("user-agent") ?? null,
          })
          .then(() => {}, (e) => console.error("click insert", e));

        return new Response(null, { status: 302, headers: { Location: job.url } });
      },
    },
  },
});
