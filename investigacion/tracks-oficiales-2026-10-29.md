# Tracks oficiales publicados (29-10-2026)

**Claude, 2026-10-29.** Fuente: https://hackathon.tum-blockchain.com/prizes (copia local no versionada, git-ignored: `prizes.html`; textos extraídos del bundle JS en `chunk.txt`). Las secciones «Hechos» transcriben la página; «Valoración» son inferencias de Claude. Sustituye las partes «por confirmar» de [tracks-analisis.md](tracks-analisis.md) y [hackathon-datos.md](hackathon-datos.md); esos archivos se conservan como investigación previa.

## Reglas generales (hechos)

- **Hacking:** desde vie 30-10, 09:00. **Deadline de entrega:** sáb 31-10, **15:00** (Devfolio, `tum.devfolio.co`). Se puede editar hasta el deadline. Recomiendan crear el proyecto temprano el sábado.
- **Una entrega por equipo**, inscrita en **hasta 3 tracks de partner** (BSV, Cardano, API3). Todo proyecto entra además **automáticamente** en el TUM Blockchain Track. → La acumulación de candidaturas está permitida; si un proyecto puede ganar varios premios no se dice explícitamente, pero cada partner juzga su track por separado.
- **Entrega común:** vídeo ≤ 2,5 min; descripción detallada en Devfolio (problema, qué se construyó, cómo funciona); repo **público** antes del deadline con README de instalación y ejecución. Más los extras de cada track.
- **Jurado:** 15:00 cierre; **15:00–17:00 jurado en vivo**: hay que presentar ante los jueces de cada track inscrito; 17:30 ganadores.
- **Workshops vie 30-10:** Cardano 10:30–11:00 · API3 11:00–11:30 · BSV 11:30–12:00.

## Premios

| Track | Total | 1.º / 2.º / 3.º |
|---|---:|---|
| Cardano — *Agentic Commerce on Cardano* | 6.000 € | 3.000 / 2.000 / 1.000 € |
| BSV — *DeFi Rails for Agentic Payments* | 4.000 € | 2.500 / 1.000 / 500 € |
| API3 — *Any API in your contract* | 2.000 € | 1.000 / 600 / 400 € |
| TUM Blockchain Track (automático) | 16.000 $ en créditos de auditoría de Adevar Labs | 10.000 $ / Pre-Audit Core 4.000 $ / Pre-Audit Express 2.000 $; válidos un año |

## Cardano (hechos)

- **Reto:** un agente, servicio o herramienta de desarrollo que hace un trabajo útil y **cobra por él en Cardano**.
- **Dos vías de cobro (combinables):** por trabajo con **Masumi en Sokosumi** (el agente se vuelve un «Coworker» contratable; el pago espera en escrow hasta la entrega, reembolso si no entrega) o por petición con **x402** (HTTP 402, sin cuentas ni API keys; «la vía más rápida al primer pago»).
- **Requisito único:** agente/servicio funcional que complete **al menos un trabajo o pago en Cardano preprod**.
- **Entrega extra:** hash de la transacción en preprod; vídeo con a quién va dirigido, problema, **business case** y un trabajo pagado de principio a fin; descripción con funcionamiento, herramientas Cardano y uso real.
- **Jurado:** caso original, flujo pagado completo, ejecución técnica, creatividad, UX, pitch y demo, impacto real y continuidad. Cardano quiere ver especialmente: **cliente claro y su recorrido**; **pago ligado al resultado** (escrow, reembolso, pagar solo si pasa un control); **agentes que contratan a otros agentes** o que actúan en el mundo real (comprar, publicar, reservar); demo en vivo con la tx en un explorador preprod.
- **Ideas de ejemplo:** informe de investigación para una tienda vía Sokosumi; API de datos pagada por x402; agente líder que contrata a un especialista.
- **Recursos:** guía https://www.masumi.network/tum-hackathon (y `agent-guide.md`, `skill/SKILL.md`), starter https://github.com/masumi-network/tum-hackathon-quickstart, x402 https://developers.cardano.org/x402/ (plantillas x402-express y x402-next), dispenser de tADA/tUSDM https://dispenser.masumi.network/, Blockfrost preprod, demo https://github.com/cardano-foundation/x402-cardano-demo, plugin https://github.com/cardano-foundation/cardano-dev-skills, sesiones 1:1 con ingeniero de Masumi (Calendly en la web).
- **Setup Masumi (guía):** Node.js 24, Sokosumi CLI 1.0.4, cuenta preprod + unirse a TUM Workspace, crear Vendor y Coworker privado, conexión a un modelo (sugieren Z.ai o Vercel AI Gateway), `npm start` + `npm run worker`. El pago es un paso aparte (Masumi Payment Service con base de datos, wallet de prueba, `PAID_TASKS_ENABLED`); una tarea completada no prueba el cobro: comprobar el recibo del vendedor. Escollos: no ejecutar dos workers por Coworker, mantener el PC despierto, gestionar `grant_required`.
- **Jueces:** Bora Oben (Cardano), Vladislav Kudrin (Cardano Foundation).

## BSV Association (hechos)

- **Reto:** construir **la capa DeFi en BSV** (valor estable, liquidez, swaps, mover fondos entre cadenas) y mostrar a un agente pagando con ella. «El producto DeFi es el núcleo; el agente puede ser simple, p. ej. uno que cambia al token correcto y paga una llamada API».
- **Requisitos (todos):** ts-stack (BSV SDK + Wallet Toolbox); flujos conectados a una wallet estándar (BSV Desktop o BSV Browser) vía `WalletClient`; transacciones reales (testnet o mainnet); **no custodial**; al menos un agente que pague a través del proyecto.
- **Entrega extra:** enlaces a transacciones en WhatsOnChain; vídeo end-to-end con el pago del agente; descripción con problema, usuarios, uso y qué aporta a BSV.
- **Jurado:** producto DeFi útil, potencial de adopción y liquidez para la red, uso del stack, ejecución, diseño no custodial, pago real del agente, originalidad, demo clara.
- **Ideas:** swap de tokens de demo (BSV-21) conectado a wallet; launchpad con stablecoins puenteadas (confirmar disponibilidad con BSV); financiación cross-chain no custodial (avanzado; un bridge desde cero es demasiado).
- **Recursos:** developer pack (Google Drive, empezar por `START-HERE.md`, copiar `AGENTS.md` a la raíz, starter `bsv21-token-kit` con 38 tests, `BSV_STACK_COMPLETE_GUIDE.md`); versiones fijadas en `AGENTS.md`; broadcast por Arcade; fondos de prueba pidiéndolos a Axel Maisonneuve (Telegram) con dirección y nombre de equipo.

## API3 (hechos)

- **Reto:** app o agente cuya funcionalidad on-chain **central** depende de datos autenticados de **AirnodeHub**. Un usuario/keeper/agente lleva la respuesta firmada on-chain y el contrato verifica **firmante esperado, petición prevista y frescura** antes de tomar una decisión o cambio de estado. Una llamada API añadida a un proyecto ajeno no basta.
- **Requisitos:** integración AirnodeHub esencial (quitarla debe romper la app); contrato desplegado (testnet vale) que verifica firmante, petición y tiempo; valor ligado a la respuesta firmada que dispara una acción on-chain, con protección contra doble ejecución.
- **Calificación pass/fail — tamper test** en el vídeo: una respuesta válida que dispara la acción y **cuatro rechazadas**: valor editado, respuesta demasiado antigua, respuesta a otra petición, firma de otra clave.
- **Entrega extra:** dirección y red del contrato; forma (app o script) para que los jueces envíen sus propias respuestas; descripción con quién depende del dato, qué pasa si se falsifica y qué dato faltó en AirnodeHub.
- **Jurado:** caso real donde el dato autenticado importa; ejecución y originalidad. Un agente autónomo suma si elige datos, paga por x402 cuando haga falta y actúa on-chain en ciclos repetidos.
- **Recursos:** starter https://github.com/api3dao/airnodehub-hackathon-starter (consumer ETH/USD firmado de Nodary, cliente y tests; Foundry, Node.js, pnpm), docs https://api3dao.github.io/airnodehub-hackathon/, faucet aUSD, USDC de Circle, MCP de AirnodeHub.

## TUM Blockchain Track (hechos)

Automático, no cuenta entre los tres. Jueces del club eligen los **tres proyectos más serios**, «los que más merecen una auditoría de seguridad para seguir construyendo». Premio: créditos de Adevar Labs (auditoría de smart contracts), no dinero.

## Qué cambia respecto a la investigación del 23-10 (valoración de Claude)

1. **BSV ya no encaja con la idea B1.** El brief exige que el núcleo sea un producto **DeFi** (swap, liquidez, stablecoins) con wallet estándar y no custodial; un agente con presupuesto que paga herramientas por HTTP 402 sería, como mucho, el «agente simple» del final. El starter BSV-21 reduce el riesgo de un swap de tokens de demo, pero un swap no custodial entre tokens es más trabajo de dominio blockchain que el que suponíamos.
2. **Cardano pasa a ser el track principal recomendado.** Mayor bolsa (6.000 €, 3.000 € al primero), un único requisito técnico (un pago en preprod), plantillas TS listas, y un jurado que premia cliente, business case, UX y pitch: el punto fuerte de un equipo de Wirtschaftsinformatik. Las ideas C1/C2 del 23-10 se ajustan casi literalmente a lo que piden.
3. **API3 es viable pero exige una persona en Solidity/Foundry** y el tamper test con cuatro fallos. Es un requisito claro y comprobable; con el starter (ETH/USD firmado) es acotable. Bolsa pequeña.
4. **Créditos de auditoría:** solo realistas si el proyecto tiene contratos propios dignos de auditar (API3 o un validador Cardano). No orientar el proyecto a ellos.
5. **La acumulación está permitida** (hasta 3 tracks por entrega), pero cada track exige presentación en vivo en la misma ventana 15:00–17:00: con varios tracks hay que repartir quién presenta dónde.

## Recomendación (valoración de Claude)

**Track principal: Cardano. Secundario opcional: API3. BSV solo si alguien del equipo quiere asumir el swap DeFi.**

Idea propuesta, uniendo C1 y lo que Cardano dice querer ver:

> **Agente de investigación de mercado para pequeños comercios, contratado y pagado por resultado.** Una tienda (cliente concreto: p. ej. un comercio local que evalúa un producto nuevo) contrata vía Sokosumi a un agente líder; el pago queda en escrow Masumi. El agente líder **subcontrata** a un agente especialista (p. ej. precios de competidores) pagándole por x402 en preprod. El informe pasa un control mínimo (fuentes enlazadas, campos completos) antes de liberar el pago; si no, reembolso.

Cubre: cliente y recorrido claros, pago ligado al resultado, agente que contrata a otro agente, dos herramientas Cardano y demo con tx en el explorador.

**Extensión API3 (solo si sobra una persona):** el agente especialista obtiene un dato firmado de AirnodeHub y un contrato EVM en testnet lo verifica antes de registrar el precio de referencia usado por el informe. Debe ser central (p. ej. el contrato decide si el presupuesto del encargo sigue dentro del límite en USD) y pasar el tamper test; si queda decorativo, no inscribirse en API3.

## Plan para vie 30 – sáb 31 (propuesta)

- **Vie 09:00–10:30:** clonar `tum-hackathon-quickstart`, cuentas Sokosumi preprod, unirse a TUM Workspace, Blockfrost key, tADA/tUSDM del dispenser. Lograr una tarea `COMPLETED` sin pago.
- **10:30 workshop Cardano** (todos o dos personas); 11:00 API3 si se considera la extensión; reservar 1:1 con Masumi.
- **Vie tarde:** primer pago en preprod (x402 es lo más rápido; Masumi escrow después). Guardar hashes desde el primer pago.
- **Vie noche:** subcontratación entre agentes y control de calidad antes de liberar pago.
- **Sáb mañana:** UX/frontend, README, vídeo ≤ 2,5 min (cliente → problema → business case → tarea pagada → tx en explorador). Crear el proyecto en Devfolio temprano; **entregar antes de 15:00**.
- **Sáb 15:00–17:00:** demo en vivo ante cada track inscrito.

Reparto inicial sugerido: (1) Masumi/Sokosumi y worker, (2) x402 y agente especialista, (3) frontend/flujo de cliente y pitch, (4) integración, README, vídeo y, si procede, API3.

## Abierto

- Si un mismo proyecto puede ganar en varios tracks (no se dice; preguntar en Telegram).
- Normas sobre código previo al viernes 09:00 (no publicadas en la página de premios).
- Qué modelo/API usar para el LLM del agente y quién paga la cuota (la guía Masumi sugiere Z.ai o Vercel AI Gateway).
