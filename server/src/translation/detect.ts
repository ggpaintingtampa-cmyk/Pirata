// P13: a small, pure language heuristic. It decides only the cheap cases (clearly English or clearly Spanish prose);
// anything short or doubtful is left to the provider's detection, and a person can state the language explicitly.
import type { SourceLocale } from '@pirata/contracts/translation';

const EN_WORDS = 'the and is are to of in on for with this that it be at by from we you they he she was were have has not but or as if will can need needs before after today tomorrow please check wall walls ceiling door doors room coat coats prep sand tape clean done finish start first second all any some more than then when where which who what there their your our out up down off into over only also just new old good bad yes ok job work time day days hour hours morning afternoon call client house home floor window windows trim primer should would could must because about again still already'.split(' ');
const ES_WORDS = 'el la los las de del y o que en es son un una unos unas por para con sin este esta esto ese esa eso al se lo le les su sus mi mis tu tus hay está están ser estar fue fueron tiene tienen hoy mañana antes después ya también todo toda todos todas más menos muy bien mal pero como cuando donde dónde porque pintar pintura pared paredes techo puerta puertas cuarto mano manos lijar limpiar terminar terminado empezar primero segundo trabajo tiempo día días hora horas cliente casa piso ventana ventanas cinta sellador listo falta faltan hacer poner quitar cocina baño necesita necesitamos revisar llamar'.split(' ');
const shared = new Set(EN_WORDS.filter(w => ES_WORDS.includes(w)));
const EN = new Set(EN_WORDS.filter(w => !shared.has(w)));
const ES = new Set(ES_WORDS.filter(w => !shared.has(w)));
const LITERAL = /^(https?:\/\/|www\.|[\w.+-]+@[\w-]+\.|\d|[A-Z]{2,}\d|[A-Z]{2,}-\d|#)/;
const ACCENTED = /[áéíóúñü¿¡]/i;

export interface Detection { locale: SourceLocale; confidence: number }
export function detectLocale(input: string): Detection {
  const tokens = input.split(/[\s,.;:!?()[\]"“”'’/\\|]+/).filter(Boolean);
  if (!tokens.length) return { locale: 'unknown', confidence: 0 };
  const literal = tokens.filter(t => LITERAL.test(t)).length;
  const words = tokens.filter(t => !LITERAL.test(t));
  if (!words.length || literal / tokens.length > 0.8) return { locale: 'unknown', confidence: 10 };
  let en = 0, es = 0;
  for (const raw of words) {
    const w = raw.toLowerCase();
    if (EN.has(w)) en++;
    if (ES.has(w)) es++;
    else if (ACCENTED.test(raw)) es += 0.75;
  }
  if (en === 0 && es === 0) return { locale: 'unknown', confidence: words.length < 3 ? 10 : 25 };
  const total = en + es, dominance = Math.max(en, es) / total, coverage = Math.min(1, (total / words.length) * 3);
  if (words.length >= 8 && Math.min(en, es) / Math.max(en, es) > 0.6) return { locale: 'mixed', confidence: 60 };
  let confidence = Math.round(100 * (0.5 * dominance + 0.5 * coverage));
  if (words.length < 4) confidence = Math.min(confidence, 45);
  else if (words.length < 6) confidence = Math.min(confidence, 65);
  return { locale: en > es ? 'en' : 'es', confidence: Math.max(0, Math.min(95, confidence)) };
}
