import type { StreetCategory, StreetCountry, StreetEvaluateKind } from "@shelfie/core";

/**
 * Spanish worker instructions per category. Guatemala says "banqueta", Colombia says "andén";
 * everything else is shared. Shown to workers before the capture, so every list starts with safety.
 */
type Instructions = Record<StreetCategory, string[]>;

const sidewalkWord: Record<StreetCountry, string> = { GT: "banqueta", CO: "andén" };

function build(country: StreetCountry): Instructions {
  const acera = sidewalkWord[country];
  const safe = `Párate en la ${acera} o en un lugar seguro; nunca tomes la foto desde la calle ni en medio del tráfico.`;
  const people = "No fotografíes a personas ni placas de vehículos.";
  return {
    ramp: [
      safe,
      `Toma la rampa completa, con el inicio en la calle y el final en la ${acera} visibles.`,
      "Si la rampa está bloqueada, rota o demasiado inclinada, que el problema se vea en el centro de la foto.",
      people,
    ],
    sidewalk: [
      safe,
      `Toma el tramo dañado de la ${acera} (hoyos, losas levantadas, obstáculos) con algo de contexto de la calle.`,
      "Sostén el teléfono a la altura del pecho y apunta hacia el suelo en diagonal.",
      people,
    ],
    pothole: [
      safe,
      `Toma el bache desde la orilla de la ${acera}, con el bache completo dentro de la foto.`,
      "Si puedes hacerlo sin bajar a la calle, deja un objeto de referencia al lado (un zapato o una hoja tamaño carta).",
      people,
    ],
    graffiti: [
      safe,
      "Toma la pared o el mobiliario urbano completo, de frente y con buena luz.",
      "Incluye un poco del entorno (puerta, esquina o poste) para reconocer el lugar.",
      people,
    ],
    drain_cover: [
      safe,
      "Toma la alcantarilla desde una distancia segura; nunca te acerques al borde ni metas el pie o la mano.",
      "Que se vea claramente si falta la tapa, si está rota o si está hundida.",
      people,
    ],
    street_light: [
      safe,
      "Toma el poste completo con la luminaria visible en la parte de arriba.",
      "Hazlo de noche o al anochecer para que se note que está apagada; incluye una luminaria vecina encendida si la hay.",
      people,
    ],
  };
}

export const STREET_INSTRUCTIONS_GT: Instructions = build("GT");
export const STREET_INSTRUCTIONS_CO: Instructions = build("CO");

export function streetInstructions(country: StreetCountry): Instructions {
  return country === "CO" ? STREET_INSTRUCTIONS_CO : STREET_INSTRUCTIONS_GT;
}

/** Extra Spanish steps for a paid mission kind, appended after the category instructions. */
export const STREET_KIND_INSTRUCTIONS: Record<StreetEvaluateKind, string[]> = {
  report: ["Agrega una nota corta si algo no se entiende en la foto."],
  confirm: ["Ve al punto del mapa y confirma con una foto nueva que el problema sigue ahí."],
  measure: [
    "Coloca un objeto de referencia junto al problema (un zapato o una hoja tamaño carta) sin ponerte en riesgo.",
    "Toma la foto desde arriba, con el objeto y el problema completos.",
  ],
  repair_check: [
    'Mira la foto de "antes" y párate en el mismo lugar, con el mismo encuadre.',
    "Toma la foto de cómo está hoy, se haya reparado o no.",
  ],
};

export function streetWorkerSteps(
  country: StreetCountry,
  kind: StreetEvaluateKind,
  category: StreetCategory,
): string[] {
  return [...streetInstructions(country)[category], ...STREET_KIND_INSTRUCTIONS[kind]];
}
