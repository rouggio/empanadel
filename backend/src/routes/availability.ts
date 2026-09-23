import type { FastifyInstance } from "fastify";
import { splitIntoSlots } from "../services/availability.js";

export default async function availabilityRoutes(fastify: FastifyInstance) {
  fastify.get("/api/availability", async (req, reply) => {
    const { court_id, date } = (req.query as any) || {};
    if (!court_id || !date) return reply.status(400).send({ error: "court_id and date required (YYYY-MM-DD)" });
    // TODO: load timetable + blocks + bookings, compute slots
    const demoSlots = splitIntoSlots("08:00", "22:00", 60).map((s) => ({ ...s, status: "available" as const }));
    return reply.send({ court_id, date, slots: demoSlots });
  });
}
