import { rateLimit } from 'express-rate-limit';

// Broad limiter for the whole API — a backstop against abuse/scraping.
// Generous enough not to bother a normal client polling + chatting.
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  limit: 1000, // per IP per window
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Tight limiter for the unauthenticated auth surface (login + signup).
// This is the endpoint credential-stuffing targets, so it's much stricter.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  limit: 20, // per IP per window
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later.' },
});
