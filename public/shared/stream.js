/** Read-only, reconnecting subscription shared by control and OBS clients. */
export function subscribe(onState, onConnection) {
  let socket,
    retry,
    stale,
    attempts = 0,
    disposed = false;
  function connect() {
    if (disposed) return;
    onConnection(false);
    socket = new WebSocket(
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`,
    );
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type !== "state" || !data.game) return;
        attempts = 0;
        onConnection(true);
        onState(data);
        clearTimeout(stale);
        stale = setTimeout(() => socket.close(), 8000);
      } catch {
        /* Ignore malformed packets; the next snapshot repairs state. */
      }
    };
    socket.onerror = () => socket.close();
    socket.onclose = () => {
      clearTimeout(stale);
      onConnection(false);
      if (!disposed)
        retry = setTimeout(connect, Math.min(10000, 500 * 2 ** attempts++));
    };
  }
  connect();
  return () => {
    disposed = true;
    clearTimeout(retry);
    clearTimeout(stale);
    socket?.close();
  };
}

export function text(id, value) {
  const element = document.getElementById(id);
  const next = String(value ?? "");
  if (element && element.textContent !== next) element.textContent = next;
}
export function clock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
