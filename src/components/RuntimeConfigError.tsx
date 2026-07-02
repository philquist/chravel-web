interface RuntimeConfigErrorProps {
  vars: string[];
}

export function RuntimeConfigError({ vars }: RuntimeConfigErrorProps) {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
      <div className="max-w-xl w-full rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold mb-3">ChravelApp is temporarily unavailable</h1>
        <p className="text-sm text-muted-foreground mb-4">
          The app is missing required runtime configuration. This is an environment setup issue, not
          your device.
        </p>
        <p className="text-sm font-medium mb-2">Missing variables</p>
        <ul className="list-disc ml-5 text-sm text-muted-foreground space-y-1">
          {vars.map(name => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
