export function ErrorState({ message, onRetry }) {
  return (
    <div className="error-state" role="alert">
      <div>
        <strong>Something went wrong</strong>
        <p>{message || 'Please try again.'}</p>
      </div>
      {onRetry ? <button onClick={onRetry}>Try again</button> : null}
    </div>
  );
}
