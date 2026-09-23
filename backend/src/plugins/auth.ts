import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

export interface JwtPayload {
  id: string;
  username: string;
  role: "visitor" | "associate" | "admin";
  preferred_language?: "it" | "en" | "fr" | "de" | "es";
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (roles: string[]) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

export default fp(async function authPlugin(fastify: FastifyInstance) {
  fastify.decorate("authenticate", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch (err) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
  });

  fastify.decorate("requireRole", (roles: string[]) => {
    return async (req: FastifyRequest, reply: FastifyReply) => {
      const user = (req as any).user as JwtPayload | undefined;
      if (!user || !roles.includes(user.role)) {
        return reply.status(403).send({ error: "Forbidden" });
      }
    };
  });
});
