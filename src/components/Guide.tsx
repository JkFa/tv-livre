import type { Channel } from '../../shared/types.ts';
import { faixaHoras, horaCurta, progresso, useGuide, type Programa } from '../lib/epg.ts';

/** Barra fina de progresso do programa (só `transform`: nada anima largura). */
export function ProgressBar({ p, t, large = false }: { p: Programa; t: number; large?: boolean }) {
  const pct = Math.round(progresso(p, t) * 100);
  return (
    <span className={`prog${large ? ' prog-lg' : ''}`} role="progressbar" aria-label="Quanto do programa já passou" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <i style={{ transform: `scaleX(${pct / 100})` }} />
    </span>
  );
}

/**
 * "Agora: Título · 20h00–21h30" + barra, e "A seguir: Título · 21h30". Sem guia para o canal, não desenha nada.
 * `overlay`: versão do Modo TV, sobre o vídeo; nasce a cada troca de canal (key) e some sozinha por CSS.
 */
export function GuideStrip({ channel, overlay = false, nonce = 0 }: { channel: Channel; overlay?: boolean; nonce?: number }) {
  const { now, next, t } = useGuide(channel);
  const seguinte = next[0];
  if (!now && !seguinte) return null;
  return (
    <div
      className={`guide${overlay ? ' guide-tv' : ''}`}
      key={overlay ? `${channel.country}/${channel.id}:${nonce}` : undefined}
      data-testid={overlay ? 'guide-tv' : 'guide-strip'}
      aria-hidden={overlay || undefined}
    >
      {now && (
        <>
          <p className="guide-now" data-testid="guide-now">
            <b>Agora:</b> <span className="guide-title">{now.title}</span> <span className="guide-time">{faixaHoras(now)}</span>
          </p>
          <ProgressBar p={now} t={t} large />
        </>
      )}
      {seguinte && (
        <p className="guide-next" data-testid="guide-next">
          <b>A seguir:</b> <span className="guide-title">{seguinte.title}</span> <span className="guide-time">{horaCurta(seguinte.start)}</span>
        </p>
      )}
    </div>
  );
}
