export default function Presence({ onlineUsers }) {
  return (
    <div
      className="presence-bar"
      title={`${onlineUsers.length} collaborator${onlineUsers.length === 1 ? '' : 's'} online`}
    >
      <div className="presence-avatars">
        {onlineUsers.slice(0, 5).map((person) => (
          <span className="presence-avatar" key={person.userId}>
            {(person.name || 'U').slice(0, 1).toUpperCase()}
          </span>
        ))}
      </div>
      <span className="online-dot" />
      <span>{onlineUsers.length} online</span>
    </div>
  );
}
