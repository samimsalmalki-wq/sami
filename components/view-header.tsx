export function ViewHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <h2 className="text-balance font-display text-xl font-medium">{title}</h2>
      {description ? <p className="mt-0.5 max-w-[70ch] text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}
