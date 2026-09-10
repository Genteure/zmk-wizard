import { beforeEach, describe, expect, test } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { EditingRepository } from './workflow';
import { useWorkflowStore } from './workflow';

function sampleRepository(): EditingRepository {
  return {
    id: 1,
    name: 'zmk-config',
    fullName: 'octocat/zmk-config',
    htmlUrl: 'https://github.com/octocat/zmk-config',
    defaultBranch: 'main',
    isPrivate: false,
    owner: { login: 'octocat', avatarUrl: '' },
    dataFileSha: 'abc123',
  };
}

describe('useWorkflowStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  test('new editor sessions get a fresh editor session id', () => {
    const workflow = useWorkflowStore();
    const initial = workflow.editorSessionId;

    workflow.enterNewEditor();
    expect(workflow.editorSessionId).toBeGreaterThan(initial);

    const afterNew = workflow.editorSessionId;
    workflow.enterEditor(sampleRepository());
    expect(workflow.editorSessionId).toBeGreaterThan(afterNew);
  });

  test('cancelling back to an existing editor keeps its session id', () => {
    const workflow = useWorkflowStore();
    workflow.enterNewEditor();
    const sessionId = workflow.editorSessionId;

    // Simulate startEditFlow(), which records where to return.
    workflow.githubReturnScreen = 'editor';
    workflow.githubReturnMode = workflow.mode;
    workflow.enterGithub('repositories');
    expect(workflow.screen).toBe('github');

    workflow.cancelGithub();
    expect(workflow.screen).toBe('editor');
    expect(workflow.editorSessionId).toBe(sessionId);
  });

  test('entering the editor clears stale GitHub return metadata', () => {
    const workflow = useWorkflowStore();
    workflow.githubReturnScreen = 'editor';
    workflow.githubReturnMode = 'edit';

    workflow.enterEditor(sampleRepository());

    expect(workflow.githubReturnScreen).toBeNull();
    expect(workflow.githubReturnMode).toBeNull();
  });

  test('an expired session keeps the editor and its unsaved work', () => {
    const workflow = useWorkflowStore();
    workflow.enterEditor(sampleRepository());
    workflow.commitMessage = 'draft message';

    workflow.expireSession('expired');

    expect(workflow.screen).toBe('editor');
    expect(workflow.isEditing).toBe(true);
    expect(workflow.editingRepository?.fullName).toBe('octocat/zmk-config');
    expect(workflow.sessionExpired).toBe(true);
    expect(workflow.githubUser).toBeNull();
    // The commit message belongs to the editor session, not the session
    // cookie, so it must survive the expiry.
    expect(workflow.commitMessage).toBe('draft message');
  });

  test('a new editor session clears the reconnect state', () => {
    const workflow = useWorkflowStore();
    workflow.enterEditor(sampleRepository());
    workflow.expireSession('expired');
    workflow.commitMessage = 'kept';
    workflow.resumeCommit = true;

    workflow.enterEditor(sampleRepository());

    expect(workflow.sessionExpired).toBe(false);
    expect(workflow.resumeCommit).toBe(false);
    expect(workflow.commitMessage).toBe('');
  });

  test('a fresh session clears the expired flag', () => {
    const workflow = useWorkflowStore();
    workflow.enterEditor(sampleRepository());
    workflow.expireSession('expired');
    expect(workflow.sessionExpired).toBe(true);

    workflow.setSession({
      configured: true,
      user: { login: 'octocat', id: 1, avatarUrl: '', name: null },
      installations: [],
      installUrl: null,
      githubError: null,
    });

    expect(workflow.sessionExpired).toBe(false);
  });
});
