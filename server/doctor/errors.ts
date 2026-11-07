export type ErrorCode = 'network' | 'typesafe_bad_key' | 'anthropic_bad_key' | 'anthropic_bad_model' | 'gmail_token_expired'
  | 'google_invalid_client' | 'gmail_api_disabled' | 'unknown';

type Check = 'typesafe' | 'anthropic' | 'gmail';
const NETWORK_CODES = new Set(['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT']);

const HINTS: Record<ErrorCode, string> = {
  network: 'Could not reach the service. Check your internet connection (and any proxy or VPN), then run doctor again.',
  typesafe_bad_key: 'TypeSafe rejected the key. Get a new key from typesafe.ai and put it in .env as TYPESAFE_API_KEY.',
  anthropic_bad_key: 'Anthropic rejected the key. Check ANTHROPIC_API_KEY in .env, or remove it (it is optional).',
  anthropic_bad_model: 'Anthropic does not know the configured Claude model. Check CLAUDE_MODEL in .env.',
  gmail_token_expired: 'The Gmail connection expired or was revoked (tokens in Testing mode expire after 7 days). Press Connect Gmail again in the app.',
  google_invalid_client: 'Google rejected the client ID or secret. Re-copy them into .env without stray spaces, then restart the app.',
  gmail_api_disabled: 'The Gmail API is not enabled for your Google Cloud project. Enable it, wait about a minute, then retry.',
  unknown: 'Something unexpected went wrong. Re-run doctor; if it persists, check the setup steps for this item.',
};

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? v as Record<string, unknown> : {});

export function classify(check: Check, err: unknown): { errorCode: ErrorCode; hint: string } {
  const e = obj(err);
  const response = obj(e.response);
  const status = e.status ?? response.status;
  const grant = obj(response.data).error;
  const code = e.code ?? obj(e.cause).code ?? obj(obj(e.cause).cause).code;
  const message = typeof e.message === 'string' ? e.message : '';
  const pick = (errorCode: ErrorCode) => ({ errorCode, hint: HINTS[errorCode] });

  if (typeof code === 'string' && NETWORK_CODES.has(code)) return pick('network');
  if (check === 'gmail') {
    if (grant === 'invalid_grant') return pick('gmail_token_expired');
    if (grant === 'invalid_client') return pick('google_invalid_client');
    if (status === 403 && /gmail api|accessNotConfigured|has not been used/i.test(message)) return pick('gmail_api_disabled');
  }
  if (check === 'typesafe' && (status === 401 || status === 403)) return pick('typesafe_bad_key');
  if (check === 'anthropic') {
    if (status === 401 || status === 403) return pick('anthropic_bad_key');
    if (status === 404) return pick('anthropic_bad_model');
  }
  return pick('unknown');
}
