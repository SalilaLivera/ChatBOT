/**
 * ★ C7 Part B — POST /api/v1/conversations, GET/POST
 * /api/v1/conversations/:id/messages (§10, §9.3, TRAP 1).
 *
 * ⛔ TRAP 1 — message text IS persisted to Postgres (`persistence/messages.ts`)
 * and is NEVER logged, at any level. This file logs conversation/message ids
 * and counts only; it never passes `req.body` or a message's `content` field
 * to `logger`.
 *
 * TRAP 2 — a conversation id that does not exist and one owned by another
 * user are externally indistinguishable (both 404 `conversation_not_found`);
 * the diagnostic is logged server-side only.
 */
import express, { Router, type Request, type Response } from 'express';
import { requireAuth } from '../auth/authMiddleware.js';
import { createSupabaseJwks, type TokenVerificationKey } from '../auth/tokens.js';
import { env } from '../config/env.js';
import { createConversation, findOwnedConversation } from '../persistence/conversations.js';
import { insertMessage, listMessages } from '../persistence/messages.js';
import { ensureUser } from '../persistence/users.js';
import { logger } from '../logging/logger.js';

function sendConversationNotAccessible(res: Response, conversationId: string, userId: string, diagnostic: 'not_found' | 'wrong_owner'): void {
  logger.warn({ conversationId, userId, diagnostic }, 'conversation lookup denied (TRAP 2 — externally uniform response)');
  res.status(404).json({ error: { code: 'conversation_not_found', message: 'No conversation was found for this id.' } });
}

/**
 * ⛔ `authKey` is INJECTABLE — see `buildApp()` in server.ts for why. The
 * default builds a real JWKS resolver, but this router is not the one
 * `server.ts` mounts in the live app (server.ts builds its own `jwks` once
 * and calls `requireAuth(jwks)` directly on `conversationsRouter`); this
 * factory exists so a test can construct an independent, injected instance
 * without triggering a real network-backed resolver at import time.
 */
export function createConversationsRouter(
  authKey: TokenVerificationKey = createSupabaseJwks(env.SUPABASE_URL),
): Router {
  const router = Router();
  const jsonBody = express.json({ limit: '10kb' });
  router.use(requireAuth(authKey));

  router.post('/api/v1/conversations', (req: Request, res: Response) => {
    void (async () => {
      await ensureUser(req.userId!);
      const conversation = await createConversation(req.userId!);
      logger.info({ conversationId: conversation.id }, 'conversation created');
      res.status(201).json({ id: conversation.id, created_at: conversation.createdAt });
    })();
  });

  router.get('/api/v1/conversations/:id/messages', (req: Request, res: Response) => {
    void (async () => {
      const id = req.params.id;
      if (!id) {
        res.status(400).json({ error: { code: 'invalid_body', message: 'conversation id is required.' } });
        return;
      }
      const { found, owned } = await findOwnedConversation(id, req.userId!);
      if (!found) return sendConversationNotAccessible(res, id, req.userId!, 'not_found');
      if (!owned) return sendConversationNotAccessible(res, id, req.userId!, 'wrong_owner');
      const messages = await listMessages(id);
      res.status(200).json({
        messages: messages.map((m) => ({ id: m.id, role: m.role, content: m.content, created_at: m.createdAt })),
      });
    })();
  });

  router.post('/api/v1/conversations/:id/messages', jsonBody, (req: Request, res: Response) => {
    void (async () => {
      const id = req.params.id;
      if (!id) {
        res.status(400).json({ error: { code: 'invalid_body', message: 'conversation id is required.' } });
        return;
      }
      const { found, owned } = await findOwnedConversation(id, req.userId!);
      if (!found) return sendConversationNotAccessible(res, id, req.userId!, 'not_found');
      if (!owned) return sendConversationNotAccessible(res, id, req.userId!, 'wrong_owner');

      const content = (req.body as { content?: unknown } | undefined)?.content;
      if (typeof content !== 'string' || content.length === 0) {
        res.status(400).json({ error: { code: 'content_required', message: 'content is required and must be a non-empty string.' } });
        return;
      }
      // ⛔ `content` is never passed to `logger` anywhere in this handler.
      const message = await insertMessage(id, 'user', content);
      logger.info({ conversationId: id, messageId: message.id }, 'message persisted');
      res.status(201).json({ id: message.id, role: message.role, created_at: message.createdAt });
    })();
  });

  return router;
}

// ⛔ NOT constructed eagerly anymore. The old module-level
// `export const conversationsRouter = createConversationsRouter()` built a
// SECOND, independent JWKS resolver (a network-backed object) the instant
// this file was imported — including by a test that merely imports this
// module for its types — rather than sharing the one resolver `buildApp()`
// already builds. `server.ts` now calls `createConversationsRouter(jwks)`
// itself, passing the SAME resolver used for every other route, so the whole
// process holds exactly one JWKS client.
