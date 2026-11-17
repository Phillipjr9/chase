import { Client } from "pg";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      const client = new Client({ connectionString: env.HYPERDRIVE.connectionString });
      await client.connect();
      try {
        const result = await client.query("SELECT * FROM pg_tables");
        return Response.json({ result: result.rows });
      } catch (e) {
        return Response.json({ error: e instanceof Error ? e.message : e }, { status: 500 });
      } finally {
        client.end().catch(() => {});
      }
    }

    return env.ASSETS.fetch(request);
  },
};
