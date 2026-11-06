/** Tela de ajuste: barras em tons de papel e tinta, com uma única barra vermelha. Estado de espera do player e vitrine da tela inicial. */
export function TestCard({ dim = false }: { dim?: boolean }) {
  const bars = ['#f1e9d8', '#d3c9b4', '#b0a692', '#8c8372', '#69614f', '#ff4b2b', '#3b342b', '#1e1914'];
  return (
    <svg className={`testcard${dim ? ' dim' : ''}`} viewBox="0 0 80 45" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {bars.map((c, i) => (
        <rect key={i} x={i * 10} y="0" width="10" height="45" fill={c} />
      ))}
    </svg>
  );
}
