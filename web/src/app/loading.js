import { LoadingSkeleton } from '@/components/LoadingSkeleton';

export default function Loading() {
  return (
    <main className="loading-page">
      <div className="page-loading-card">
        <LoadingSkeleton rows={2} />
      </div>
    </main>
  );
}
