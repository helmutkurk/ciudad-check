# Análisis de tracks para cuatro estudiantes de TUM

> **Actualización 2026-10-29 (Claude):** los briefs oficiales ya están publicados y cambian la recomendación (BSV exige DeFi como núcleo; Cardano pasa a principal). Ver [tracks-oficiales-2026-10-29.md](tracks-oficiales-2026-10-29.md). Este análisis se conserva como investigación previa.

**23 de octubre de 2026 · Codex.** Perfil de trabajo facilitado por el usuario: cuatro estudiantes de Wirtschaftsinformatik, TypeScript/Python/React y poca experiencia en Solidity. No se presuponen otras capacidades, aceptación individual de los cuatro ni experiencia previa en wallets.

**Todo juicio de dificultad, competencia, encaje, arquitectura e ideas es una inferencia/propuesta de Codex.** Las herramientas citadas existen en documentación primaria; eso no las convierte en requisitos del evento. Los briefs completos, reparto y posibilidad de acumular premios no quedaron verificados: véase [hackathon-datos.md](hackathon-datos.md). No hay datos públicos recuperados de equipos inscritos por track ni probabilidades de ganar calculables.

## Comparación y criterio de elección — inferencia

Escala relativa para un MVP durante el hackathon: **baja** = integración web conocida; **media** = aprender SDK/wallet y completar un flujo; **alta** = aprender además un modelo de contratos, seguridad o infraestructura especializada. La estimación supone documentación utilizable, fondos/red disponibles y que el brief admita ese alcance.

| Categoría | Dificultad estimada | Competencia probable — hipótesis de baja confianza | Encaje y principal riesgo |
|---|---|---|---|
| BSV Association | **Media** con pagos y recibos; **alta** al añadir identidad compleja, overlays y varias redes. | Podría atraer menos generalistas por su stack específico, pero también especialistas. No hay evidencia para llamarlo «fácil de ganar». | **Alto** para TS/React y un caso empresarial. Riesgo: conseguir wallet, fondos y primera transacción sin consumir la ventana. |
| Cardano | **Media** con pagos HTTP/SDK; **alta** si requiere validador Aiken propio. | Una bolsa mayor podría atraer equipos; también la curva UTxO puede disuadirlos. Dirección y magnitud reales desconocidas. | **Alto** con plantillas de pagos; menor si exige contratos originales. Poca Solidity no es un obstáculo directo aquí. |
| API3 | **Media** con un consumidor pequeño y UI; **alta** para lending, liquidaciones o búsqueda OEV. | Podría concentrar perfiles EVM/DeFi experimentados; bolsa menor no prueba menor competencia. | **Medio**: buena parte web, pero alguien debe asumir contratos, red, feed y unidades. |
| Créditos de auditoría TUM Blockchain Club | **No estimable** sin bases; el coste marginal de documentar controles de un MVP puede ser bajo/medio. | Indeterminada: desconocemos quién puede optar y cuántos premios se reparten. | Complemento **condicional**, nunca motivo suficiente para diseñar un supuesto «track de seguridad» que no está confirmado. |

La base técnica de estas diferencias está documentada en las secciones siguientes. Los importes y categorías oficiales están en [premios](https://hackathon.tum-blockchain.com/prizes) y [Devfolio premios](https://tum.devfolio.co/prizes).

**Recomendación provisional:** comparar primero BSV y Cardano según el brief y soporte que realmente ofrezcan. Elegir el que permita demostrar un pago completo pronto. API3 puede ser principal si una persona acepta dedicar tiempo a Solidity y la tarea del sponsor encaja; no elegirlo solo por la posibilidad de añadir un oracle a otra app.

Wirtschaftsinformatik puede aportar ventaja en flujo de compras, presupuesto, trazabilidad y explicación del valor. Es una valoración del perfil, no un criterio oficial del jurado. Una compra completa con fallo controlado y evidencia es una meta más realista que una plataforma multichain amplia.

## BSV Association

### Base técnica verificada

`@bsv/sdk` ofrece APIs TypeScript de transacciones y wallet; `WalletClient` usa la interfaz BRC-100. [SDK oficial](https://bsv-blockchain.github.io/ts-sdk/). El paquete actual `@bsv/402-pay` incorpora middleware y cliente para pagos HTTP BRC-121, con Node.js 22+; está en el monorepo `ts-stack`. [Paquete oficial](https://github.com/bsv-blockchain/ts-stack/tree/main/packages/middleware/402-pay). La guía de remesas ofrece otra ruta para factura/pago/recibo. [Remesas](https://bsv-blockchain.github.io/ts-sdk/remittance-getting-started/).

**Inferencia de encaje:** podéis mantener agente, APIs y frontend en TypeScript y usar Python solo si aporta algo al procesamiento. Solidity no es necesario para este diseño propuesto. El primer riesgo es operativo —wallet, firma, transacción y verificación—; no empezar por reputación descentralizada ni identidad civil.

### Idea B1 · Agente con presupuesto para comprar herramientas

**Problema:** un agente necesita pagar por llamadas a servicios y su dueño quiere entender y limitar el gasto.

- **MVP:** React permite fijar presupuesto y dos proveedores permitidos. Un agente compra extracción de una página pública y una comparación; el backend hace pagos BSV, guarda identificador de tarea y recibos, y presenta resultado y coste. El catálogo y precios pueden ser de proveedores de demostración, etiquetados como tales.
- **Demo concreta:** completar una tarea; rechazar una compra que supera el presupuesto; reintentar una petición sin cobrar dos veces. El agente puede ser simple: la aportación central es decidir y pagar con controles verificables.
- **Tecnología propuesta:** TS/Node, SDK y middleware BSV; wallet compatible; almacenamiento de idempotencia. La autorización del gasto vive en el backend de la demo salvo que se implemente otra garantía: no afirmar que la cadena impone por sí sola ese presupuesto.
- **Vía a varios premios:** BSV como principal; segundo adaptador Cardano para pagar un servicio distinto si hay tiempo; posible auditoría si admite este alcance. BSV y Cardano serían flujos separados, sin bridge. **Elegibilidad y acumulación por verificar**.
- **Dificultad inferida:** media con un rail, alta con dos. Recortar el segundo rail antes que los recibos y la prueba de gasto rechazado.

### Idea B2 · Compras de una asociación con expediente verificable

**Problema:** comparar presupuestos y justificar compras pequeñas consume trabajo administrativo.

- **MVP:** tres proveedores de prueba cobran micropagos por presupuestos; el agente compara coste/plazo, solicita aprobación y paga al elegido con BSV. React muestra criterios y recibos en un expediente exportable.
- **Demo concreta:** dos solicitudes, una compra y una oferta rechazada por exceder el máximo. Los datos serán públicos o sintéticos. Un hash demuestra integridad del expediente, no que un proveedor haya dicho la verdad.
- **Tecnología propuesta:** SDK/remesas BSV, TS y UI. Identidad verificable solo como ampliación, con emisor y confianza explícitos; ver [referencia Identity](https://bsv-blockchain.github.io/ts-sdk/reference/identity/).
- **Vía a varios premios:** añadir un módulo EVM/API3 que valore una reserva ETH en USD y recomiende un techo de compra. Usar solo un feed realmente disponible; no asumir feed BSV/USD ni EUR/USD. El backend coordina esa lectura y el pago BSV, **sin garantía atómica entre redes**. Candidaturas hipotéticas BSV + API3 + auditoría.
- **Dificultad inferida:** media para compras BSV, media-alta con valoración EVM. Si el brief API3 exige otra cosa, descartar esa candidatura.

## Cardano

### Base técnica verificada

El portal oficial presenta `@x402/cardano` y plantillas TypeScript para Express/Next.js. Masumi añade mecanismos de escrow, identidad y descubrimiento. [Agentic Commerce](https://developers.cardano.org/x402/). Mesh ofrece conectores React y herramientas de transacciones. [Inicio React](https://meshjs.dev/react/getting-started). Crear validadores propios introduce Aiken y conceptos específicos de Cardano. [Guía Aiken](https://meshjs.dev/aiken/first-script).

**Inferencia de encaje:** empezar por pago directo; activar escrow únicamente si el brief y la biblioteca elegida lo justifican. No exigir aprender Aiken para una transferencia sencilla. Confirmar red, wallet, fondos, latencia y disponibilidad del facilitador durante el evento.

### Idea C1 · Agentes que contratan informes con devolución

**Problema:** un agente paga por un resultado y necesita una vía definida si el proveedor no entrega.

- **MVP:** un agente comprador encarga a otro un informe breve sobre un documento público. Interfaz con precio, plazo y estado; el flujo deposita, recibe el resultado y sigue las condiciones reales de liberación/devolución del escrow elegido. No inventar arbitraje automático por «calidad».
- **Demo concreta:** un trabajo entregado y otro sin entrega; mostrar el estado on-chain y el camino de recuperación que permita el contrato. El caso vencido puede demostrarse con plazos de prueba admitidos; si se simula alguna parte, indicarlo.
- **Tecnología propuesta:** TS/React, x402/Masumi o un escrow mantenido que satisfaga el caso. Revisar el contrato antes de adoptar su semántica: [Mesh Escrow](https://meshjs.dev/smart-contracts/escrow) es otro patrón y no debe asumirse equivalente a Masumi.
- **Vía a varios premios:** Cardano + auditoría, sujetos a bases. Como ampliación independiente, BSV cobra por una herramienta de verificación del informe; no añadir una segunda cadena solo para guardar un hash ornamental.
- **Dificultad inferida:** media-alta por el ciclo de escrow. Alternativa de alcance: pago directo con recibo si la devolución no se logra durante la ventana.

### Idea C2 · Asistente de investigación que paga por fuentes

**Problema:** reunir información mediante APIs de pago sin exceder un presupuesto ni perder la procedencia.

- **MVP:** el usuario plantea una consulta; el agente compara dos endpoints de datos públicos, compra uno mediante Cardano y entrega una respuesta con fuentes, coste y recibo. Los proveedores de demostración venden procesamiento o acceso de prueba, sin atribuirse derechos sobre bases ajenas.
- **Demo concreta:** compra barata aceptada; compra adicional rechazada al agotar el saldo; respuesta final con cada afirmación enlazada a su evidencia.
- **Tecnología propuesta:** React y TS con pago HTTP. Presupuesto aplicado por el servicio comprador y firmas de wallet; no prometer delegación on-chain segura sin implementarla.
- **Vía a varios premios:** Cardano + posible auditoría. Para API3, incorporar un contrato de valoración de reserva EVM y usar su decisión en el presupuesto; el backend es el puente de confianza. Solo compensa si existe feed pertinente y el reto API3 acepta ese uso. Evitar una cotización decorativa.
- **Dificultad inferida:** media para compra y procedencia; alta con segundo entorno de contratos. Mantener un solo proveedor pagado como mínimo defendible.

## API3

### Base técnica verificada

El quickstart integra feeds en un contrato Solidity sobre EVM y muestra Remix/Hardhat. [Quickstart](https://docs.api3.org/dapps/quickstart/). `Api3ReaderProxyV1.read()` devuelve valor y timestamp; la documentación exige comprobar feed activo/proxy desplegado y explica unidades y cautelas temporales. [Integración](https://docs.api3.org/dapps/integration/contract-integration.html). Las actualizaciones OEV están restringidas actualmente a searchers asociados. [Data feeds/OEV](https://docs.api3.org/oev/in-depth/data-feeds/).

**Inferencia de encaje:** un contrato consumidor pequeño es abordable con una persona dedicada; un protocolo financiero nuevo es una apuesta de mucho más riesgo. No confundir OEV Rewards del protocolo con el premio del hackathon. Si un proyecto solo consulta un dato desde Node, puede no satisfacer el brief: confirmarlo.

### Idea A1 · Guardián de autorizaciones para una tesorería de agentes

**Problema:** evitar que un agente autorice una operación que supera el límite de exposición de una tesorería.

- **MVP:** un contrato EVM lee un feed activo —por ejemplo ETH/USD si está disponible en la red elegida— y evalúa una operación de prueba contra un límite en USD. React muestra importe, dato utilizado y motivo del permiso/rechazo. El agente propone; el contrato evalúa.
- **Demo concreta:** solicitud válida, solicitud por encima del límite y fallo por dato no utilizable. Para fallos difíciles de provocar en un feed real, usar un mock separado y etiquetado; mantener una lectura real como evidencia de integración.
- **Tecnología propuesta:** Solidity mínimo, TS/React, proxy API3 y pruebas de unidades/aritmética. Revisar las cautelas del timestamp y no copiar una regla temporal simplista.
- **Vía a varios premios:** API3 principal; BSV o Cardano liquida una compra de herramienta tras aprobación del coordinador. El contrato EVM **no controla de forma trustless** esa wallet en otra cadena; declarar la confianza en el servidor. Auditoría como candidatura adicional si las condiciones lo permiten.
- **Dificultad inferida:** media-alta. Mantener en testnet, sin DEX, préstamo ni custodia de fondos reales.

### Idea A2 · Agente que detiene pagos ante un oracle no utilizable

**Problema:** un sistema automatizado sigue pagando aunque su referencia de valoración haya dejado de ser válida.

- **MVP:** monitor consulta un proxy API3; contrato pequeño registra una decisión permitida/bloqueada para un flujo de gasto de prueba. Un tablero muestra valor, actualización, política y último recibo. El agente explica por qué se detuvo y solicita revisión.
- **Demo concreta:** lectura del feed real; escenarios controlados de dato no positivo, vencido y error de lectura con un proveedor de prueba. No afirmar que un feed real falló si se utilizó un mock.
- **Tecnología propuesta:** API3, contrato de política y Node/React. La política de antigüedad depende del feed y de las recomendaciones del sponsor; no hay un umbral universal supuesto.
- **Vía a varios premios:** API3 + BSV para micropagos por un servicio que solo se ejecuta cuando el coordinador recibe permiso; posible auditoría por controles demostrados. El servicio debe aportar valor al usuario y encajar en el brief BSV. La coordinación entre redes sigue siendo confiada, no atómica.
- **Dificultad inferida:** media para monitor, media-alta para autorización más pago. La alternativa mínima es API3 y un gasto simulado claramente identificado.

## Créditos de auditoría del TUM Blockchain Club

No se verificó un reto técnico propio, lenguaje admitido, auditor proveedor ni si basta competir en otro track. Las ideas siguientes son **formas de reforzar un proyecto de sponsor**, no afirmaciones sobre qué gana estos créditos. Fuente de la categoría: [premios oficiales](https://hackathon.tum-blockchain.com/prizes).

### Idea T1 · Banco de pruebas de una wallet con presupuesto

- **MVP:** construir sobre B1 una interfaz que reproduce cuatro acciones: autorizada, excedida, destinatario prohibido y repetición. Enseñar decisión, pago/ausencia de pago y recibo. Incluir un modelo de amenazas de una página que identifique quién controla las claves y dónde se aplican las reglas.
- **Combinación propuesta:** BSV + créditos; API3 solo si añade una valoración indispensable y se completa su integración. Para buscar auditoría de contratos, verificar que el componente realmente es auditable por el proveedor; un backend TS puede quedar fuera de su alcance.
- **Dificultad inferida:** media como ampliación de un MVP terminado; alta si se intenta construir una wallet completa. Su mérito es la evidencia reproducible, no llamarlo «seguro» por tener tests.

### Idea T2 · Laboratorio de fallos de contratación entre agentes

- **MVP:** extender C1 con escenarios de entrega válida, ausencia de entrega y petición duplicada; comprobar saldos y estados según la semántica real del escrow. Entregar scripts reproducibles y explicar qué puede y qué no puede recuperar el comprador.
- **Combinación propuesta:** Cardano + créditos. BSV podría cobrar por una validación adicional del resultado únicamente si hay flujo útil, tiempo y admisión multitrack. No es necesario un segundo rail para tener un buen proyecto principal.
- **Dificultad inferida:** media-alta, dominada por comprender el escrow. Evitar escribir arbitraje, reputación y marketplace desde cero.

## Cómo intentar varios premios sin perder el MVP — propuesta

| Ruta | Integración principal que habría que demostrar | Ampliación coherente | Condición que puede invalidarla |
|---|---|---|---|
| BSV + Cardano | Un pago y consumo de servicio en BSV | Otro servicio con pago Cardano, adaptadores separados | Exclusividad de track; segundo flujo insuficiente; requisitos de red/protocolo distintos. |
| BSV + API3 | Compra BSV con recibo | Evaluación real de reserva EVM antes de autorizar | Feed inexistente; brief API3 distinto; mera lectura no aceptada; confianza del coordinador incompatible con el reto. |
| Cardano + API3 | Compra/escrow Cardano completo | Evaluación de presupuesto EVM que cambia una decisión | Igual que arriba; retrasos y falta de atomicidad entre redes. |
| Un sponsor + auditoría | MVP funcional con evidencia técnica | Pruebas de fallos, threat model y alcance de auditoría claro | Créditos no acumulables o lenguaje/proyecto no elegible. |

**No hay permiso confirmado para ninguna combinación.** La ruta mínima son un sponsor y una demo completa; añadir una segunda candidatura solo tras leer sus condiciones. No sumar bolsas como ganancia esperada ni asumir que un proyecto tiene opción automática a todos los premios.

BSV BRC-121 y Cardano x402 comparten el uso de HTTP 402, pero eso no demuestra interoperabilidad. API3 EVM tampoco es un oracle nativo de BSV/Cardano. Las fuentes respectivas son [BSV](https://github.com/bsv-blockchain/ts-stack/tree/main/packages/middleware/402-pay), [Cardano](https://developers.cardano.org/x402/) y [API3](https://docs.api3.org/dapps/quickstart/); la separación mediante adaptadores y las limitaciones de confianza son inferencias de arquitectura.

## Reparto y puntos de decisión — propuesta

Para cuatro personas: una responsable de wallet/pagos, otra del agente y API, otra de React/UX y otra de integración, pruebas y entrega. Son responsabilidades iniciales, no silos; reservar trabajo conjunto para la primera transacción y la demo final.

Durante la **ventana de código permitida**, priorizar:

1. Leer el brief y escribir una lista de cumplimiento: requisito → componente → evidencia que se mostrará.
2. Conseguir un pago/lectura real y recuperar su evidencia. Si no funciona pronto, acudir al mentor y reducir alcance.
3. Completar un recorrido de usuario, incluido un fallo comprensible. Después integrar agente y mejorar la explicación.
4. Añadir segundo sponsor solo cuando la entrega principal se pueda reproducir desde cero.
5. Reservar aproximadamente el último quinto del tiempo disponible para documentación, vídeo si se exige, revisión del formulario y ensayo. Es una asignación propuesta, no un plazo del organizador.

Decisiones aún necesarias: admisión del compañero, reglas de código previo, requisitos reales de cada sponsor, fondos/wallets disponibles, deadline y acumulación. Hasta resolverlas, este documento sirve para elegir opciones y formular preguntas; **no acredita elegibilidad**.

## Fuentes y trazabilidad

La investigación técnica auxiliar, con referencias adicionales y avisos de migración de paquetes, está en [tecnologia-fuentes.md](tecnologia-fuentes.md). Fue elaborada por un agente de investigación en segundo plano conforme a la skill `hks-research`; Codex contrastó las fuentes críticas de Cardano, BSV y API3 y redactó este análisis. No se ejecutaron SDKs, no se probaron transacciones y no se preparó código de proyecto.
