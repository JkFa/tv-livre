import { Sheet } from './Sheet.tsx';

const ROWS: [string[], string][] = [
  [['←', '→'], 'Canal anterior / próximo'],
  [['↑', '↓'], 'Canal anterior / próximo'],
  [['0–9', 'Enter'], 'Digitar o número do canal'],
  [['Z'], 'Zapear: sortear um canal no ar'],
  [['/'], 'Buscar canal'],
  [['F'], 'Tela cheia'],
  [['M'], 'Mudo'],
  [['P'], 'Imagem sobre imagem'],
  [['Espaço'], 'Pausar e continuar'],
  [['S'], 'Compartilhar o canal'],
  [['T'], 'Modo TV (controle remoto)'],
  [['?'], 'Mostrar esta lista'],
];

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet id="atalhos" open={open} onClose={onClose} title="Atalhos do teclado" variant="modal">
      <dl className="keys">
        {ROWS.map(([keys, label]) => (
          <div key={label + keys.join()}>
            <dt>
              {keys.map((k) => (
                <kbd key={k}>{k}</kbd>
              ))}
            </dt>
            <dd>{label}</dd>
          </div>
        ))}
      </dl>
    </Sheet>
  );
}
