'use client';

import { useEffect, useState } from 'react';

const CATEGORIES = ['General', 'Product', 'Study', 'Event', 'Design', 'Tech'];

export default function IdeaForm({ initialIdea, onSubmit, onCancel, busy }) {
  const [title, setTitle] = useState(initialIdea?.title || '');
  const [description, setDescription] = useState(initialIdea?.description || '');
  const [category, setCategory] = useState(initialIdea?.category || 'General');
  const [error, setError] = useState('');

  useEffect(() => {
    setTitle(initialIdea?.title || '');
    setDescription(initialIdea?.description || '');
    setCategory(initialIdea?.category || 'General');
    setError('');
  }, [initialIdea]);

  function submit(event) {
    event.preventDefault();
    const cleanTitle = title.trim();
    const cleanDescription = description.trim();

    if (cleanTitle.length < 3) {
      setError('Title must be at least 3 characters.');
      return;
    }
    if (cleanTitle.length > 120) {
      setError('Title must be 120 characters or fewer.');
      return;
    }
    if (cleanDescription.length > 2000) {
      setError('Description must be 2000 characters or fewer.');
      return;
    }
    if (!CATEGORIES.includes(category)) {
      setError('Choose a valid category.');
      return;
    }

    onSubmit({
      title: cleanTitle,
      description: cleanDescription,
      category,
    });
  }

  return (
    <form className="idea-form" onSubmit={submit} noValidate>
      <label>
        Idea title
        <input
          value={title}
          maxLength={120}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="What should we build?"
          autoFocus
        />
        <span className="field-count">{title.length}/120</span>
      </label>

      <label>
        Description
        <textarea
          value={description}
          maxLength={2000}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Give the team enough context to understand the idea…"
          rows={5}
        />
        <span className="field-count">{description.length}/2000</span>
      </label>

      <label>
        Category
        <select value={category} onChange={(event) => setCategory(event.target.value)}>
          {CATEGORIES.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
      </label>

      {error ? <div className="form-error" role="alert">{error}</div> : null}

      <div className="form-actions">
        {onCancel ? (
          <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        ) : null}
        <button className="primary-button" disabled={busy}>
          {busy ? 'Saving…' : initialIdea ? 'Save changes' : 'Add idea →'}
        </button>
      </div>
    </form>
  );
}
