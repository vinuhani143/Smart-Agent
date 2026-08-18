import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AMAZON_MUSIC_DEFAULT_API_BASE,
  AMAZON_MUSIC_UNAVAILABLE_MESSAGE,
  buildAmazonFeatureStatus,
  credentialsConfigured,
  isAmazonMusicUsable,
  parseEnabledFlag,
  resolveAmazonAccessStatus,
  type AmazonRuntimeConfig,
} from './amazonConfig';

function config(overrides: Partial<AmazonRuntimeConfig> = {}): AmazonRuntimeConfig {
  return {
    featureEnabled: false,
    clientId: '',
    clientSecret: '',
    securityProfileId: '',
    redirectUri: '',
    apiBaseUrl: AMAZON_MUSIC_DEFAULT_API_BASE,
    ...overrides,
  };
}

const completeCreds = {
  clientId: 'amzn1.application-oa2-client.test',
  clientSecret: 'test-secret',
  securityProfileId: 'amzn1.application.test-profile',
  redirectUri: 'http://localhost:4000/api/auth/amazon/callback',
};

describe('Amazon Music configuration', () => {
  it('defaults the feature flag to disabled', () => {
    assert.equal(parseEnabledFlag(undefined), false);
    assert.equal(parseEnabledFlag(''), false);
    assert.equal(parseEnabledFlag('false'), false);
    assert.equal(parseEnabledFlag('true'), true);
  });

  it('requires LWA client id, secret, security profile id, and redirect URI', () => {
    assert.equal(credentialsConfigured(config()), false);
    assert.equal(credentialsConfigured(config({ clientId: 'id' })), false);
    assert.equal(credentialsConfigured(config(completeCreds)), true);
  });

  it('is usable only when the flag is on and credentials are present', () => {
    assert.equal(isAmazonMusicUsable(config({ featureEnabled: true })), false);
    assert.equal(isAmazonMusicUsable(config({ ...completeCreds, featureEnabled: false })), false);
    assert.equal(isAmazonMusicUsable(config({ ...completeCreds, featureEnabled: true })), true);
  });

  it('reports closed_beta when the flag is off and credentials are missing', () => {
    assert.equal(
      resolveAmazonAccessStatus({
        featureEnabled: false,
        credentialsConfigured: false,
        authenticated: false,
      }),
      'closed_beta',
    );
  });

  it('reports disabled when the flag is off even if credentials exist', () => {
    assert.equal(
      resolveAmazonAccessStatus({
        featureEnabled: false,
        credentialsConfigured: true,
        authenticated: false,
      }),
      'disabled',
    );
  });

  it('reports not_configured, configured, and authenticated', () => {
    assert.equal(
      resolveAmazonAccessStatus({
        featureEnabled: true,
        credentialsConfigured: false,
        authenticated: false,
      }),
      'not_configured',
    );
    assert.equal(
      resolveAmazonAccessStatus({
        featureEnabled: true,
        credentialsConfigured: true,
        authenticated: false,
      }),
      'configured',
    );
    assert.equal(
      resolveAmazonAccessStatus({
        featureEnabled: true,
        credentialsConfigured: true,
        authenticated: true,
      }),
      'authenticated',
    );
  });

  it('reports api_access_denied when Amazon rejected the Security Profile', () => {
    assert.equal(
      resolveAmazonAccessStatus({
        featureEnabled: true,
        credentialsConfigured: true,
        authenticated: false,
        apiAccessDenied: true,
      }),
      'api_access_denied',
    );
  });

  it('builds the provider status payload without secrets', () => {
    const status = buildAmazonFeatureStatus({
      featureEnabled: false,
      credentialsConfigured: false,
      authenticated: false,
    });
    assert.deepEqual(status, {
      enabled: false,
      configured: false,
      accessStatus: 'closed_beta',
    });
    assert.equal(JSON.stringify(status).includes('secret'), false);
    assert.equal(AMAZON_MUSIC_UNAVAILABLE_MESSAGE.includes('configured'), true);
  });
});
