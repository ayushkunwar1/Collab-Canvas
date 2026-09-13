import WorkspaceClient from '@/components/WorkspaceClient';

export default async function WorkspacePage({ params }) {
  const { id } = await params;
  return <WorkspaceClient workspaceId={id} />;
}
