import { describe, expect, it } from 'vitest';
import {
  isInstallCallback,
  isOAuthCallback,
  isOAuthErrorCallback,
  parseWorkflowUrl,
  stripWorkflowSearch,
} from './workflowUrl';

describe('workflow URL parsing', () => {
  it('recognizes new/edit actions and editor tab', () => {
    const params = parseWorkflowUrl(new URL('https://example.test/?action=edit&tab=keyboard&part=1'));
    expect(params).toEqual({
      action: 'edit',
      code: null,
      state: null,
      error: null,
      errorDescription: null,
      setupAction: null,
      installationId: null,
      tab: 'keyboard',
      part: 1,
    });
  });

  it('recognizes OAuth and installation callbacks', () => {
    expect(isOAuthCallback(parseWorkflowUrl(new URL('https://example.test/?code=abc&state=def')))).toBe(true);
    expect(isOAuthErrorCallback(parseWorkflowUrl(new URL('https://example.test/?error=access_denied&state=def')))).toBe(true);
    expect(isInstallCallback(parseWorkflowUrl(new URL('https://example.test/?setup_action=install&state=def')))).toBe(true);
  });

  it('drops unknown actions and malformed tab values', () => {
    const params = parseWorkflowUrl(new URL('https://example.test/?action=other&tab=whatever'));
    expect(params.action).toBeNull();
    expect(params.tab).toBeNull();
  });

  it('strips workflow keys but preserves hash and unrelated query', () => {
    const url = new URL('https://example.test/?action=edit&code=abc&state=def&error=access_denied&error_description=denied&setup_action=install&installation_id=1&tab=layout&part=0&iss=https%3A%2F%2Fgithub.com%2Flogin%2Foauth&keep=1#kle=xyz');
    const stripped = stripWorkflowSearch(url);

    expect(stripped).toContain('keep=1');
    expect(stripped).toContain('#kle=xyz');
    for (const key of ['action', 'code', 'state', 'error', 'error_description', 'setup_action', 'installation_id', 'tab', 'part', 'iss']) {
      expect(stripped).not.toContain(`${key}=`);
    }
  });
});
