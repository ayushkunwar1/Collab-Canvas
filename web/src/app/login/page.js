import Link from 'next/link';
import AuthForm from '@/components/AuthForm';

export default function LoginPage() {
  return (
    <main className="auth-page">
      <Link className="back-link" href="/">
        ← Back to home
      </Link>
      <AuthForm />
    </main>
  );
}
