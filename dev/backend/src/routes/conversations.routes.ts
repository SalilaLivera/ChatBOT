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
import { sessionStore } from '../capture/sessionStore.js';
import { UpstreamHttpClient } from '../clients/httpClient.js';
import { SentimentClient } from '../clients/sentiment.client.js';
import { FusionClient } from '../clients/fusion.client.js';
import { analyseMood, type MoodServiceDeps } from '../mood/moodService.js';
import { createProvider } from '../llm/factory.js';
import { LlmService } from '../llm/service.js';
import type { Language, MoodState } from '../llm/contract.js';

// ⛔ I1-B SCAFFOLDING ONLY — reuses the existing C6 mood pipeline and the
// existing (mock-only, D-6-gated) LlmService so the owner can see real
// chat replies rendered locally. This is NOT the real `/reply` contract:
// `response_mode` is intentionally always `null` below because B-1 (the
// M6/M8 mood → response-mode mapping) is unresolved — do not infer a real
// value from anywhere in this handler. Do not build the permanent
// frontend contract on this shape.
let lazyMoodDeps: MoodServiceDeps | undefined;
function getMoodDeps(): MoodServiceDeps {
  lazyMoodDeps ??= {
    sessionStore,
    sentimentClient: new SentimentClient(
      new UpstreamHttpClient({ baseUrl: env.SENTIMENT_SERVICE_URL, timeoutMs: env.SENTIMENT_TIMEOUT_MS }),
    ),
    fusionClient: new FusionClient(
      new UpstreamHttpClient({ baseUrl: env.FUSION_SERVICE_URL, timeoutMs: env.FUSION_TIMEOUT_MS }),
    ),
    languageBounds: { siRatioHigh: env.LANGUAGE_SI_RATIO_HIGH, siRatioLow: env.LANGUAGE_SI_RATIO_LOW },
    languagePolicy: env.LANGUAGE_POLICY,
    nodeEnv: env.NODE_ENV,
  };
  return lazyMoodDeps;
}

let lazyLlmService: LlmService | undefined;
function getLlmService(): LlmService {
  // ⛔ `createProvider` resolves to `mock` unless LLM_PROVIDER=groq is
  // explicitly set AND a key is present (see llm/factory.ts). Nothing here
  // changes that gate.
  lazyLlmService ??= new LlmService({
    provider: createProvider({ providerName: env.LLM_PROVIDER, apiKey: env.GROQ_API_KEY, model: env.LLM_MODEL }),
    maxOutputTokens: env.LLM_MAX_OUTPUT_TOKENS,
    timeoutMs: env.LLM_TIMEOUT_MS,
  });
  return lazyLlmService;
}

function toLlmLanguage(languageDetected: string): Language {
  return languageDetected === 'si' ? 'si' : 'en';
}

// Same header, same parsing, as session.routes.ts's `sessionIdOf` — kept as
// a second small function rather than a shared import so this scaffolding
// file's dependencies stay easy to delete wholesale once D-1 lands for real.
const SESSION_HEADER = 'x-session-id';
function sessionIdOf(req: Request): string | undefined {
  const raw = req.header(SESSION_HEADER);
  return raw && raw.trim().length > 0 ? raw.trim() : undefined;
}

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

      // ── I1-B: measure mood via the existing C6 pipeline, then generate a
      // reply via the existing (mock) LlmService. Never fabricate mood — and
      // never silently degrade to a fabricated 'unknown' either: if the mood
      // pipeline itself fails (e.g. fusion is down), the whole turn fails
      // visibly rather than returning a reply as if nothing were wrong.
      //
      // ⛔ FIXED (post-manual-verification) — this previously hardcoded
      // `sessionId: undefined`, so a chat reply's mood_debug NEVER
      // incorporated the camera, regardless of consent/frames. Confirmed
      // live: the same message sent with a detected, tracked face produced
      // the byte-identical confidence as the same message sent with the
      // camera off. Now reads the same `x-session-id` header every other
      // authenticated route already uses (session.routes.ts's
      // `sessionIdOf`), so a session genuinely reaches `analyseMood()` when
      // the client sends one.
      const sessionId = sessionIdOf(req);
      const moodOutcome = await analyseMood(
        { sessionId, ownerId: req.userId, text: content },
        getMoodDeps(),
      );
      if (moodOutcome.kind === 'upstream_unavailable') {
        res.status(503).json({ error: { code: moodOutcome.code, message: moodOutcome.message } });
        return;
      }
      if (moodOutcome.kind === 'rejected') {
        res.status(moodOutcome.httpStatus).json({ error: { code: moodOutcome.code, message: moodOutcome.message } });
        return;
      }
      const moodState: MoodState = moodOutcome.body.state;
      const confidence = moodOutcome.body.confidence;
      const language = toLlmLanguage(moodOutcome.body.language_detected);

      const llmOutcome = await getLlmService().generate({
        moodState,
        language,
        userText: content,
        contentType: null,
      });
      const replyText = llmOutcome.ok ? llmOutcome.content!.message : llmOutcome.fallbackText!;
      const assistantMessage = await insertMessage(id, 'assistant', replyText);
      logger.info({ conversationId: id, messageId: assistantMessage.id }, 'assistant reply persisted');

      // ⛔ I1-B SCAFFOLDING RESPONSE SHAPE — NOT D-1's `ChatResponse`.
      // `mood_debug` is a DEV-ONLY diagnostic field, distinct from D-1's
      // `mood` field. `response_mode` is EXPLICITLY `null`: B-1 (the M6/M8
      // mood → response-mode mapping) is unresolved, and no value is guessed
      // here. Do not treat this shape as the permanent frontend contract.
      //
      // `modalities_used` and `language_detected` added (post-manual-
      // verification): the missing session id above meant every reply's
      // mood_debug was silently text-only, and there was no field in this
      // response that could have revealed that without cross-referencing the
      // database. These two make it directly observable from the response
      // itself.
      res.status(201).json({
        id: assistantMessage.id,
        role: assistantMessage.role,
        created_at: assistantMessage.createdAt,
        content: replyText,
        mood_debug: {
          state: moodState,
          confidence,
          modalities_used: moodOutcome.body.modalities_used,
          language_detected: moodOutcome.body.language_detected,
        },
        response_mode: null,
      });
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
