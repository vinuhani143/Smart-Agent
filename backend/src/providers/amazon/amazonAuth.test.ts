import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ErrorCode } from '../../types/errors';
import { AMAZON_MUSIC_SCOPE_STRING, LWA_AUTHORIZE_URL } from './amazonConfig';
import { buildLwaAuthorizationUrl, lwaTokenRequestBody, tokensFromLwaResponse } from './amazonAuth';

describe('Login With Amazon OAuth', () => {
  it('builds the official authorization URL without the client secret', () => {
    const { authorizationUrl, state } = buildLwaAuthorizationUrl(
      {
        clientId: 'amzn1.application-oa2-client.test',
        redirectUri: 'http://localhost:4000/api/auth/amazon/callback',
      },
      'csrf-state',
    );
    const url = new URL(authorizationUrl);
    assert.equal(`${url.origin}${url.pathname}`, LWA_AUTHORIZE_URL);
    assert.equal(url.searchParams.get('client_id'), 'amzn1.application-oa2-client.test');
    assert.equal(url.searchParams.get('response_type'), 'code');
    assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:4000/api/auth/amazon/callback');
    assert.equal(url.searchParams.get('state'), 'csrf-state');
    assert.equal(url.searchParams.get('scope'), AMAZON_MUSIC_SCOPE_STRING);
    assert.equal(state, 'csrf-state');
    assert.equal(authorizationUrl.includes('client_secret'), false);
    assert.equal(authorizationUrl.includes('test-secret'), false);
  });

  it('puts the client secret only in the token request body', () => {
    const body = lwaTokenRequestBody({
      grantType: 'authorization_code',
      clientId: 'amzn1.application-oa2-client.test',
      clientSecret: 'test-secret',
      redirectUri: 'http://localhost:4000/api/auth/amazon/callback',
      code: 'auth-code',
    });
    assert.equal(body.get('grant_type'), 'authorization_code');
    assert.equal(body.get('client_secret'), 'test-secret');
    assert.equal(body.get('code'), 'auth-code');
    assert.equal(body.get('refresh_token'), null);
  });

  it('maps a successful LWA token payload and keeps the previous refresh token', () => {
    const tokens = tokensFromLwaResponse(
      {
        access_token: 'Atza|access',
        expires_in: 3600,
        token_type: 'bearer',
        scope: AMAZON_MUSIC_SCOPE_STRING,
      },
      'Atzr|existing',
    );
    assert.equal(tokens.accessToken, 'Atza|access');
    assert.equal(tokens.refreshToken, 'Atzr|existing');
    assert.ok(tokens.expiresAt && tokens.expiresAt.getTime() > Date.now());
  });

  it('prefers a new refresh token from LWA', () => {
    const tokens = tokensFromLwaResponse({
      access_token: 'Atza|access',
      refresh_token: 'Atzr|new',
      expires_in: 3600,
    });
    assert.equal(tokens.refreshToken, 'Atzr|new');
  });

  it('fails token mapping without exposing secrets', () => {
    assert.throws(
      () => tokensFromLwaResponse({ error: 'invalid_client', error_description: 'bad secret' }),
      (error: Error & { code?: string }) =>
        error.code === ErrorCode.OAUTH_FAILED && !/Atza|Atzr|secret/i.test(error.message),
    );
  });
});
