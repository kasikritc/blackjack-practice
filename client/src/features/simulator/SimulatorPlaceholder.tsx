export function SimulatorPlaceholder({ title }: { title: string }) {
  return (
    <section className="simulator-panel simulator-placeholder">
      <p className="eyebrow">Simulator</p>
      <h2>{title}</h2>
      <p>The analytical controls for this section are loading into the new simulator workspace.</p>
    </section>
  );
}
