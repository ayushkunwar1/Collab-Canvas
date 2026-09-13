export async function getWorkspaceMembership(supabase, workspaceId, userId) {
  const { data, error } = await supabase
    .from('workspace_members')
    .select('workspace_id, user_id, role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function requireWorkspaceMember(req, res, next) {
  try {
    const workspaceId = req.params.workspaceId || req.params.id;
    const membership = await getWorkspaceMembership(
      req.supabase,
      workspaceId,
      req.user.id,
    );

    if (!membership) {
      return res.status(403).json({ error: 'You do not have access to this workspace.' });
    }

    req.workspaceMembership = membership;
    return next();
  } catch (error) {
    console.error('Workspace membership check:', error);
    return res.status(500).json({ error: 'Unable to verify workspace access.' });
  }
}

export async function requireWorkspaceOwner(req, res, next) {
  try {
    const workspaceId = req.params.workspaceId || req.params.id;
    const { data: workspace, error } = await req.supabase
      .from('workspaces')
      .select('id, owner_id')
      .eq('id', workspaceId)
      .maybeSingle();

    if (error) throw error;

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found.' });
    }

    if (workspace.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the workspace owner can perform this action.' });
    }

    req.workspace = workspace;
    return next();
  } catch (error) {
    console.error('Workspace owner check:', error);
    return res.status(500).json({ error: 'Unable to verify workspace ownership.' });
  }
}
