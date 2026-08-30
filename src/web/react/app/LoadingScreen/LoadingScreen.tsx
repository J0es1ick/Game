import "./LoadingScreen.css";

export function LoadingScreen({ full = false }: { full?: boolean }) {
  return (
    <div
      className={full ? "react-loading-screen" : "react-loading-page"}
      role="status"
    >
      <span className="loading-mark" aria-hidden="true">
        ✦
      </span>
      <p>Открываем летопись…</p>
    </div>
  );
}
