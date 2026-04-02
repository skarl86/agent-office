export function StreamingIndicator() {
  return (
    <span className="inline-flex items-center gap-0.5 ml-1">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.3s]" />
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.15s]" />
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" />
    </span>
  );
}
