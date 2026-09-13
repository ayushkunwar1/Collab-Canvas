import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

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

  return res.status(201).json({
    workspace: {
      ...data,
      role: 'owner',
    },
  });
});

router.post('/:workspaceId/join', async (req, res) => {
  const { workspaceId } = req.params;

  if (!isUuid(workspaceId)) {
    return res.status(400).json({ error: 'Enter a valid workspace ID.' });
  }

  const { data: workspaceExists, error: workspaceError } = await req.supabase
    .rpc('workspace_exists', { target_workspace_id: workspaceId });

  if (workspaceError) {
    console.error('Check workspace:', workspaceError);
    return res.status(500).json({ error: 'Unable to check the workspace.' });
  }

  if (!workspaceExists) {
    return res.status(404).json({ error: 'Workspace not found.' });
  }

  const { data, error } = await req.supabase
    .from('workspace_members')
    .insert({
      workspace_id: workspaceId,
      user_id: req.user.id,
      role: 'member',
    })
    .select('workspace_id, user_id, role')
    .maybeSingle();

  if (error?.code === '23505') {
    return res.status(409).json({ error: 'You are already a member of this workspace.' });
  }

  if (error) {
    console.error('Join workspace:', error);
    return res.status(500).json({ error: 'Unable to join workspace.' });
  }

  return res.status(201).json({ membership: data });
});

router.delete('/:workspaceId', async (req, res) => {
  const { workspaceId } = req.params;

  if (!isUuid(workspaceId)) {
    return res.status(400).json({ error: 'Invalid workspace ID.' });
  }

  // The server uses the Supabase secret key, so RLS is bypassed here.
  // Explicitly verify ownership before deleting anything.
  const { data: workspace, error: workspaceError } = await req.supabase
    .from('workspaces')
    .select('id, owner_id')
    .eq('id', workspaceId)
    .maybeSingle();

  if (workspaceError) {
    console.error('Check workspace owner:', workspaceError);
    return res.status(500).json({ error: 'Unable to verify workspace ownership.' });
  }

  if (!workspace) {
    return res.status(404).json({ error: 'Workspace not found.' });
  }

  if (workspace.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the workspace owner can delete this workspace.' });
  }

  const { error: deleteError } = await req.supabase
    .from('workspaces')
    .delete()
    .eq('id', workspaceId)
    .eq('owner_id', req.user.id);

  if (deleteError) {
    console.error('Delete workspace:', deleteError);
    return res.status(500).json({ error: 'Unable to delete workspace.' });
  }

  return res.status(204).end();
});

router.get('/:workspaceId', async (req, res) => {
  const { workspaceId } = req.params;

  if (!isUuid(workspaceId)) {
    return res.status(400).json({ error: 'Invalid workspace ID.' });
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
    return res.status(404).json({ error: 'Workspace not found or you do not have access.' });
  }

  return res.json({
    workspace: data,
    isOwner: data.owner_id === req.user.id,
  });
});

export default router;
