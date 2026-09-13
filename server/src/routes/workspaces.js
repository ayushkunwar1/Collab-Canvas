import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getWorkspaceMembership } from '../middleware/workspaceAuth.js';

const router = Router();
router.use(requireAuth);

function cleanText(value, max) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

router.get('/', async (req, res) => {
  const { data, error } = await req.supabase
    .from('workspace_members')
    .select('workspace_id, role, created_at, workspaces(id, owner_id, name, description, created_at, updated_at)')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('List workspaces:', error);
    return res.status(500).json({ error: 'Unable to load workspaces.' });
  }

  const workspaces = (data || [])
    .map((row) => ({ ...row.workspaces, role: row.role }))
    .filter(Boolean);

  return res.json({ workspaces });
});

router.post('/', async (req, res) => {
  const name = cleanText(req.body?.name, 80);
  const description = cleanText(req.body?.description, 500);

  if (name.length < 2) {
    return res.status(400).json({ error: 'Workspace name must be at least 2 characters.' });
  }

  const { data, error } = await req.supabase
    .from('workspaces')
    .insert({
      owner_id: req.user.id,
      name,
      description,
    })
    .select('id, owner_id, name, description, created_at, updated_at')
    .single();

  if (error) {
    console.error('Create workspace:', error);
    return res.status(500).json({ error: 'Unable to create workspace.' });
  }

  return res.status(201).json({ workspace: { ...data, role: 'owner' } });
});

router.post('/:workspaceId/join', async (req, res) => {
  const { workspaceId } = req.params;

  if (!isUuid(workspaceId)) {
    return res.status(400).json({ error: 'Enter a valid workspace ID.' });
  }

  const { data: workspace, error: workspaceError } = await req.supabase
    .from('workspaces')
    .select('id, owner_id')
    .eq('id', workspaceId)
    .maybeSingle();

  if (workspaceError) {
    console.error('Check workspace:', workspaceError);
    return res.status(500).json({ error: 'Unable to check the workspace.' });
  }

  if (!workspace) {
    return res.status(404).json({ error: 'Workspace not found.' });
  }

  const existing = await getWorkspaceMembership(req.supabase, workspaceId, req.user.id);

  if (existing) {
    return res.status(409).json({ error: 'You are already a member of this workspace.' });
  }

  const { data, error } = await req.supabase
    .from('workspace_members')
    .insert({
      workspace_id: workspaceId,
      user_id: req.user.id,
      role: workspace.owner_id === req.user.id ? 'owner' : 'member',
    })
    .select('workspace_id, user_id, role')
    .single();

  if (error) {
    console.error('Join workspace:', error);
    return res.status(500).json({ error: 'Unable to join workspace.' });
  }

  return res.status(201).json({ membership: data });
});

router.get('/:workspaceId', async (req, res) => {
  const { workspaceId } = req.params;

  if (!isUuid(workspaceId)) {
    return res.status(400).json({ error: 'Invalid workspace ID.' });
  }

  const membership = await getWorkspaceMembership(req.supabase, workspaceId, req.user.id);

  if (!membership) {
    return res.status(403).json({ error: 'Workspace not found or you do not have access.' });
  }

  const { data, error } = await req.supabase
    .from('workspaces')
    .select('id, owner_id, name, description, created_at, updated_at')
    .eq('id', workspaceId)
    .maybeSingle();

  if (error) {
    console.error('Get workspace:', error);
    return res.status(500).json({ error: 'Unable to load workspace.' });
  }

  if (!data) {
    return res.status(404).json({ error: 'Workspace not found.' });
  }

  return res.json({
    workspace: data,
    isOwner: data.owner_id === req.user.id,
  });
});

export default router;
