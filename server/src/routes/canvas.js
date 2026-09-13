import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getWorkspaceMembership } from '../middleware/workspaceAuth.js';

const router = Router();
router.use(requireAuth);

async function isMember(supabase, workspaceId, userId) {
  const membership = await getWorkspaceMembership(supabase, workspaceId, userId);
  return Boolean(membership);
}

router.get('/workspace/:workspaceId', async (req, res) => {
  const workspaceId = req.params.workspaceId;

  if (!(await isMember(req.supabase, workspaceId, req.user.id))) {
    return res.status(403).json({ error: 'You do not have access to this workspace.' });
  }

  const { data, error } = await req.supabase
    .from('canvas_actions')
    .select('id, workspace_id, user_id, action, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Load canvas:', error);
    return res.status(500).json({ error: 'Unable to load canvas.' });
  }

  return res.json({ actions: data || [] });
});

router.post('/workspace/:workspaceId', async (req, res) => {
  const workspaceId = req.params.workspaceId;

  if (!(await isMember(req.supabase, workspaceId, req.user.id))) {
    return res.status(403).json({ error: 'You do not have access to this workspace.' });
  }

  const action = req.body?.action;

  if (!action || typeof action !== 'object' || Array.isArray(action)) {
    return res.status(400).json({ error: 'A valid canvas action is required.' });
  }

  if (JSON.stringify(action).length > 100000) {
    return res.status(413).json({ error: 'Canvas action is too large.' });
  }

  const { data, error } = await req.supabase
    .from('canvas_actions')
    .insert({ workspace_id: workspaceId, user_id: req.user.id, action })
    .select('id, workspace_id, user_id, action, created_at')
    .single();

  if (error) {
    console.error('Create canvas action:', error);
    return res.status(500).json({ error: 'Unable to save canvas action.' });
  }

  return res.status(201).json({ canvasAction: data });
});

router.delete('/workspace/:workspaceId', async (req, res) => {
  const workspaceId = req.params.workspaceId;

  const { data: workspace, error: workspaceError } = await req.supabase
    .from('workspaces')
    .select('owner_id')
    .eq('id', workspaceId)
    .maybeSingle();

  if (workspaceError) {
    console.error('Check canvas owner:', workspaceError);
    return res.status(500).json({ error: 'Unable to clear canvas.' });
  }

  if (!workspace) return res.status(404).json({ error: 'Workspace not found.' });
  if (workspace.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the workspace owner can clear the canvas.' });
  }

  const { error } = await req.supabase
    .from('canvas_actions')
    .delete()
    .eq('workspace_id', workspaceId);

  if (error) {
    console.error('Clear canvas:', error);
    return res.status(500).json({ error: 'Unable to clear canvas.' });
  }

  return res.status(204).end();
});

export default router;
