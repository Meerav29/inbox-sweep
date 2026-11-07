import { describe, expect, it } from 'vitest';
import { classify } from '../../../server/doctor/errors';

describe('classify', () => {
  it('network errors, top level or in cause', () => {
    expect(classify('typesafe', { code: 'ENOTFOUND' }).errorCode).toBe('network');
    expect(classify('gmail', { cause: { code: 'ECONNREFUSED' } }).errorCode).toBe('network');
  });
  it('walks a nested cause chain', () => {
    expect(classify('anthropic', { message: 'fetch failed', cause: { cause: { code: 'ENOTFOUND' } } }).errorCode).toBe('network');
  });
  it('401 depends on the check', () => {
    expect(classify('typesafe', { status: 401 }).errorCode).toBe('typesafe_bad_key');
    expect(classify('anthropic', { status: 401 }).errorCode).toBe('anthropic_bad_key');
  });
  it('anthropic 404 is a bad model', () => {
    expect(classify('anthropic', { status: 404 }).errorCode).toBe('anthropic_bad_model');
  });
  it('invalid_grant means the token expired', () => {
    const r = classify('gmail', { response: { data: { error: 'invalid_grant' } } });
    expect(r.errorCode).toBe('gmail_token_expired');
    expect(r.hint).toContain('Connect Gmail');
    expect(r.hint).toContain('7 days');
  });
  it('invalid_client', () => {
    expect(classify('gmail', { response: { data: { error: 'invalid_client' } } }).errorCode).toBe('google_invalid_client');
  });
  it('gmail api disabled', () => {
    expect(classify('gmail', { status: 403, message: 'Gmail API has not been used in project 123' }).errorCode).toBe('gmail_api_disabled');
  });
  it('unknown never echoes the message', () => {
    const r = classify('typesafe', new Error('weird'));
    expect(r.errorCode).toBe('unknown');
    expect(r.hint).not.toContain('weird');
  });
});
