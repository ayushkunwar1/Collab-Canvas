import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const categories = ['General', 'Product', 'Study', 'Event', 'Design', 'Tech'];

function cleanText(value, max) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function normalizeCategory(value) {
  const category = cleanText(value, 32);
  return categories.includes(category) ? category : 'General';
}

function safeSearch(value) {
  return String(value ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 50);
}

const profileSelect = 'id, workspace_id, user_id, title, description, category, created_at, updated_at, profiles!ideas_user_id_fkey(id, display_name, avatar_url)';

async function getIdeaPayload(supabase, workspaceId, userId, query = {}) {
  const search = safeSearch(query.search);
  const category = cleanText(query.category, 32);

  let ideasQuery = supabase
    .from('ideas')
    .select(profileSelect)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (category && category !== 'All' && categories.includes(category)) {
    ideasQuery = ideasQuery.eq('category', category);
  }

  if (search) {
    ideasQuery = ideasQuery.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
  }

  const [{ data: ideas, error: ideasError }, { data: votes, error: votesError }] = await Promise.all([
    ideasQuery,
    supabase.from('upvotes').select('idea_id, user_id').eq('workspace_id', workspaceId),
  ]);

  if (ideasError || votesError) {
    console.error('Load ideas:', ideasError || votesError);
    throw new Error('Unable to load ideas.');
  }

  const voteMap = new Map();
  const votedByCurrentUser = new Set();

  for (const vote of votes || []) {
    voteMap.set(vote.idea_id, (voteMap.get(vote.idea_id) || 0) + 1);
    if (vote.user_id === userId) votedByCurrentUser.add(vote.idea_id);
  }

  return (ideas || []).map((idea) => ({
    ...idea,
    profile: idea.profiles || {
      id: idea.user_id,
      display_name: 'User',
      avatar_url: null,
    },
    profiles: undefined,
    upvoteCount: voteMap.get(idea.id) || 0,
    hasUpvoted: votedByCurrentUser.has(idea.id),
  }));
}

router.get('/workspace/:workspaceId', async (req, res) => {
  try {
    const ideas = await getIdeaPayload(
      req.supabase,
      req.params.workspaceId,
      req.user.id,
      req.query,
    );

    return res.json({ ideas, categories });
  } catch (error) {
    console.error('Ideas route:', error);
    return res.status(500).json({ error: error.message || 'Unable to load ideas.' });
  }
});

router.post('/workspace/:workspaceId', async (req, res) => {
  const title = cleanText(req.body?.title, 120);
  const description = cleanText(req.body?.description, 2000);
  const category = normalizeCategory(req.body?.category);

  if (title.length < 3) {
    return res.status(400).json({ error: 'Title must be at least 3 characters.' });
  }

  const { data, error } = await req.supabase
    .from('ideas')
    .insert({
      workspace_id: req.params.workspaceId,
      user_id: req.user.id,
      title,
      description,
      category,
    })
    .select(profileSelect)
    .single();

  if (error) {
    console.error('Create idea:', error);
    return res.status(500).json({ error: 'Unable to create idea. Make sure you belong to this workspace.' });
  }

  return res.status(201).json({
    idea: {
      ...data,
      profile: data.profiles,
      profiles: undefined,
      upvoteCount: 0,
      hasUpvoted: false,
    },
  });
});

router.patch('/:ideaId', async (req, res) => {
  const title = cleanText(req.body?.title, 120);
  const description = cleanText(req.body?.description, 2000);
  const category = normalizeCategory(req.body?.category);

  if (title.length < 3) {
    return res.status(400).json({ error: 'Title must be at least 3 characters.' });
  }

  const { data, error } = await req.supabase
    .from('ideas')
    .update({ title, description, category })
    .eq('id', req.params.ideaId)
    .eq('user_id', req.user.id)
    .select(profileSelect)
    .maybeSingle();

  if (error) {
    console.error('Update idea:', error);
    return res.status(500).json({ error: 'Unable to update idea.' });
  }

  if (!data) {
    return res.status(403).json({ error: 'You do not have permission to edit this idea.' });
  }

  return res.json({
    idea: {
      ...data,
      profile: data.profiles,
      profiles: undefined,
    },
  });
});

router.delete('/:ideaId', async (req, res) => {
  const { data, error } = await req.supabase
    .from('ideas')
    .delete()
    .eq('id', req.params.ideaId)
    .eq('user_id', req.user.id)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Delete idea:', error);
    return res.status(500).json({ error: 'Unable to delete idea.' });
  }

  if (!data) {
    return res.status(403).json({ error: 'You do not have permission to delete this idea.' });
  }

  return res.status(204).end();
});

router.post('/:ideaId/upvote', async (req, res) => {
  const { data: idea, error: ideaError } = await req.supabase
    .from('ideas')
    .select('id, workspace_id')
    .eq('id', req.params.ideaId)
    .maybeSingle();

  if (ideaError) {
    console.error('Verify idea:', ideaError);
    return res.status(500).json({ error: 'Unable to verify idea.' });
  }

  if (!idea) {
    return res.status(404).json({ error: 'Idea not found or you do not have access.' });
  }

  const { error } = await req.supabase.from('upvotes').insert({
    workspace_id: idea.workspace_id,
    idea_id: idea.id,
    user_id: req.user.id,
  });

  if (error?.code === '23505') {
    return res.status(200).json({ ok: true, alreadyVoted: true });
  }

  if (error) {
    console.error('Upvote:', error);
    return res.status(500).json({ error: 'Unable to upvote idea.' });
  }

  return res.status(201).json({ ok: true, alreadyVoted: false });
});

router.delete('/:ideaId/upvote', async (req, res) => {
  const { error } = await req.supabase
    .from('upvotes')
    .delete()
    .eq('idea_id', req.params.ideaId)
    .eq('user_id', req.user.id);

  if (error) {
    console.error('Remove upvote:', error);
    return res.status(500).json({ error: 'Unable to remove upvote.' });
  }

  return res.status(204).end();
});

export { categories };
export default router;
