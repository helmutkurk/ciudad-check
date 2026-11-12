# TUM Blockchain & AI Hackathon 2026 — equipo Helmut, Isa, Troy, Fernando

Hackathon 30–31 oct 2026 (conferencia TBC26 29–31 oct), House of Communication, Friedenstraße 24, Múnich. Tema: **Agentic Payments**. Plataforma: Devfolio. Nota en el vault: `30 Trabajo y carrera/Proyectos en ejecución/TUM Blockchain Hackathon 2026.md`.

## Carpetas
- `investigacion/` — datos oficiales con fuentes (`hackathon-datos.md`), análisis de tracks e ideas (`tracks-analisis.md`), stack técnico (`tecnologia-fuentes.md`). Codex, 2026-10-23.
- `ideas/` — shortlist y decisión de idea.
- `codigo/` — repo del proyecto (solo durante la ventana de hacking; antes, únicamente pruebas de aprendizaje desechables).
- `pitch/` — slides, guion de demo, vídeo.

## Estado (Claude, 2026-10-23)
- Aceptados: Helmut, Isa, Troy, Fernando. Lorenz no aceptado.
- Correo del 23-10 (hackathon@tum-blockchain.com): asegurar la plaza con **depósito de 50 € en Luma antes del miércoles 28-10, 23:59 CET**. Llegará un **segundo correo con enlace personal de staking** (mirar spam); el ticket de hacker no aparece en la web.
- Devolución del depósito solo si: check-in el primer día, **asistencia los tres días** (29, 30 y 31) y entrega del proyecto.

## Pendientes antes del evento
| Cuándo | Qué | Quién |
|---|---|---|
| ✔ 23-10 | Depósito de Helmut pagado; Isa, Troy y Fernando lo pagan antes del 28-10 23:59 | compañeros |
| Hoy–sáb 24 | Escribir a hackathon@tum-blockchain.com: Lorenz (lista de espera), código previo, deadline exacto, briefs de sponsors, acumulación de premios | Helmut |
| Hoy | Unirse al Telegram oficial del FAQ | los 4 |
| sáb 24–dom 25 | Entorno: Node 22, wallet BSV (BRC-100) y wallet Cardano testnet; hacer un "hello payment" desechable de cada SDK | los 4 (repartido) |
| lun 26 | Llamada de 1 h: roles, shortlist de 2 ideas, preguntas al mentor | equipo |
| mié 28 23:59 | Fecha límite del depósito | los 4 |
| jue 29 | Conferencia (obligatoria para el reembolso): hablar con BSV/Cardano/API3 en sus stands y sacar el brief real | equipo |

## Plan de ataque (recomendación de Claude, inferencia)
1. **Track principal: BSV Association (4.000 €)**, con Cardano (6.000 €) como alternativa. Los dos encajan con un equipo TypeScript/React sin Solidity; API3 exige contratos EVM.
2. **Idea base: agente con presupuesto que paga herramientas por HTTP 402** (idea B1). Un producto, adaptadores de pago separados: BSV primero, Cardano solo si se permite acumular premios y el flujo BSV ya funciona de principio a fin.
3. Decidir definitivamente tras leer los briefs (aún "coming soon") y hablar con los sponsors el jueves 29.
4. Roles: pagos/wallet · agente y API · frontend React · integración, pruebas, entrega y pitch.
5. Hitos en el evento (~30 h): primera transacción real en las primeras 3–4 h → flujo completo con un caso de fallo (gasto rechazado) a mitad → segundo rail solo si sobra → último quinto del tiempo para README, vídeo, formulario Devfolio publicado y ensayo de demo.
