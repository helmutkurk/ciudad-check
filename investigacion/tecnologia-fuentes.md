# Fuentes técnicas auxiliares para analizar los tracks

Investigado el **2026-10-23** por Codex. Esta nota respalda el análisis de tecnologías; **no establece requisitos ni elegibilidad de premios**. Solo se usan fuentes primarias de los proyectos y sus mantenedores. Las ideas, dificultad, encaje y posibles combinaciones son **inferencias/propuestas**, pendientes de los briefs del hackathon.

## BSV Association

### Hechos técnicos verificados

- El SDK TypeScript se instala como `@bsv/sdk`; expone `WalletClient`, `PrivateKey` y `Transaction`. Su interfaz aplicación–wallet es BRC-100, con implementaciones de referencia BSV Desktop y BSV Browser. Fuente: [documentación oficial del SDK](https://bsv-blockchain.github.io/ts-sdk/).
- `WalletClient` contempla creación de acciones, firmas, certificados y consulta de salidas. Fuente: [referencia Wallet](https://bsv-blockchain.github.io/ts-sdk/reference/wallet/).
- La capa de identidad ofrece `IdentityClient`, resolución por atributos/clave y revelación/revocación de atributos. Esto no prueba por sí mismo una identidad civil ni una afiliación universitaria: hace falta un emisor y un modelo de confianza. Fuente de las capacidades: [referencia Identity](https://bsv-blockchain.github.io/ts-sdk/reference/identity/); última frase: inferencia.
- La guía de remesas describe `RemittanceManager`, transporte de mensajes y el módulo `Brc29RemittanceModule`; permite un flujo factura → liquidación → recibo y, si se configura, intercambio de identidad. Fuente: [guía de remesas](https://bsv-blockchain.github.io/ts-sdk/remittance-getting-started/).
- El código actual de herramientas está agrupado en `ts-stack`: SDK, wallets, overlays, mensajería y middleware. Fuente: [repositorio oficial actual](https://github.com/bsv-blockchain/ts-stack).
- `@bsv/402-pay` implementa BRC-121 para micropagos HTTP: middleware de servidor y cliente `create402Fetch`. Documenta Node.js 22+, uso en navegador y dependencia de `@bsv/sdk`. Fuente: [README actual de 402-pay](https://github.com/bsv-blockchain/ts-stack/tree/main/packages/middleware/402-pay).
- El middleware antiguo `@bsv/payment-express-middleware` usa otro flujo autenticado y advierte que sus cabeceras/cliente no son intercambiables con BRC-121. Fuente: [README actual del middleware legacy](https://github.com/bsv-blockchain/ts-stack/tree/main/packages/middleware/payment-express-middleware).
- Los repositorios independientes antiguos de [402-pay](https://github.com/bsv-blockchain/402-pay) y [payment-express-middleware](https://github.com/bsv-blockchain/payment-express-middleware) están archivados y redirigen al monorepo. Conviene seguir el destino actual, no copiar tutoriales antiguos sin cotejar las APIs. Primera frase: hecho; segunda: recomendación técnica.

### Evaluación para cuatro estudiantes — inferencia

**Dificultad estimada: media** para pagos sencillos con SDK y wallet ya disponible; **media-alta** si se añaden certificados propios, overlays, reputación y mensajería. Buen encaje con TypeScript/React; no exige aprender Solidity para esos flujos. Riesgo principal: wallet, fondos de prueba y conexión entre cliente/servidor. Probar durante la ventana permitida primero un pago real con recibo y después añadir el agente. Ninguna tecnología anterior queda marcada como obligatoria del track hasta que el sponsor lo publique.

**Competencia probable: indeterminada.** Hipótesis débil: un ecosistema específico puede atraer menos equipos generalistas, pero también participantes experimentados. No hay números de equipos por track que permitan estimar probabilidades.

### Dos propuestas originales — elegibilidad y acumulación por verificar

1. **Agent Budget Gate:** un asistente compra dos servicios HTTP de pago para resolver una tarea, con presupuesto total, lista de proveedores autorizados y aprobación humana por encima de un umbral. MVP: servicio de extracción de datos + servicio de comparación, dos pagos BSV, recibos y tablero React. Demostrar bloqueo de un gasto excesivo y de un pago repetido. Posible extensión API3: un adaptador EVM obtiene una cotización verificable y aplica un límite monetario antes de pagar; ese dato **no convierte API3 en un oracle nativo de BSV**. Posibles candidaturas: BSV + API3 + créditos de auditoría, solo si sus reglas lo permiten y el uso de API3 es sustancial.
2. **ProcureProof:** agente de compras para una asociación estudiantil que solicita ofertas, paga una microtarifa por cada presupuesto y entrega un expediente verificable de decisión y recibos. MVP: tres proveedores de prueba y una compra aprobada. BSV para pagos/identidad; Cardano como segundo adaptador de liquidación independiente, sin bridge. Posibles candidaturas BSV + Cardano + auditoría, condicionadas a relevancia real y reglas. Para mantener el alcance, completar primero un único rail.

## Cardano

### Hechos técnicos verificados

- Mesh ofrece SDK TypeScript, constructor de transacciones y conectores de wallet. Su frontend React dispone de `MeshProvider`, `CardanoWallet` y `useWallet`. Fuentes: [Mesh](https://meshjs.dev/), [inicio React](https://meshjs.dev/react/getting-started).
- Para lógica on-chain propia, la guía Aiken introduce validadores, datum, redeemer y firmas; requiere CLI Aiken y conocimientos de transacciones Cardano. Fuente: [primer validador Aiken](https://meshjs.dev/aiken/first-script).
- Mesh publica un contrato escrow con integración TypeScript: depósito de las dos partes y firma de ambas para completar el intercambio; permite cancelación antes de completarse. Fuente: [Mesh Escrow](https://meshjs.dev/smart-contracts/escrow).
- El portal oficial presenta `@x402/cardano` para pagos HTTP y templates TypeScript Express/Next.js. Incluye pagos directos y, con Masumi, escrow, identidad y descubrimiento de agentes. Fuente: [Agentic Commerce oficial](https://developers.cardano.org/x402/).
- Lucid Evolution es otra biblioteca TypeScript para transacciones y código off-chain, mantenida por Anastasia Labs. Fuente: [directorio oficial de Cardano](https://developers.cardano.org/tools/lucid-evolution/).

### Evaluación para cuatro estudiantes — inferencia

**Dificultad media** con pagos HTTP y stack TypeScript existente; **media-alta/alta** si el brief exige diseñar y depurar un validador Aiken propio. Poca experiencia en Solidity no es una desventaja directa en este ecosistema. Aun así hay que aprender wallets, UTxOs, red de pruebas y confirmación de pagos. No asumir que cualquier plantilla esté autorizada como código previo.

**Competencia probable: indeterminada.** Un premio nominal mayor podría atraer más equipos, pero no permite concluir que sea el track más competitivo. La madurez de equipos y el número de premios importan tanto como el fondo total.

### Dos propuestas originales — elegibilidad y acumulación por verificar

1. **Campus Service Escrow:** un agente contrata otro agente para traducir y verificar un documento público; el usuario define precio máximo y plazo, y ve pago, entrega y opción de devolución. MVP: un trabajo, dos agentes de prueba y escrow existente; evitar arbitraje complejo. Cardano como rail principal. Un recibo BSV independiente podría registrar el expediente, pero solo tendría sentido añadirlo si responde al brief BSV. Candidaturas hipotéticas Cardano + BSV + auditoría.
2. **Research Agent Wallet:** asistente que selecciona y paga fuentes/datasets públicos bajo un presupuesto por tarea. Frontend React muestra motivo de cada compra, coste y saldo. MVP: dos endpoints de pago y una tarea reproducible. Extensión API3: adaptador EVM de cotización cuando exista feed adecuado; demostrar que bloquea una compra con dato vencido. Candidaturas hipotéticas Cardano + API3 + auditoría. Si API3 exige un contrato consumidor on-chain, una simple lectura HTTP no bastaría.

## API3

### Hechos técnicos verificados

- El quickstart usa una red EVM, selecciona un feed activo en API3 Market y muestra un contrato Solidity desplegado desde Remix; enlaza también un ejemplo Hardhat. Fuente: [quickstart oficial](https://docs.api3.org/dapps/quickstart/).
- `Api3ReaderProxyV1.read()` devuelve valor y timestamp; para OEV Rewards hay que usar los proxies de la propia dApp. La existencia del proxy y actividad del feed deben verificarse. Fuente: [integración de contratos](https://docs.api3.org/dapps/integration/contract-integration.html).
- API3 Market documenta parámetros de actualización por desviación y heartbeat, planes de testnet y posibles paradas de actualización si se agota el pago. Fuente: [uso de API3 Market](https://docs.api3.org/dapps/integration/).
- Las Signed APIs públicas sirven datos firmados. La documentación distingue datos base retrasados de OEV en tiempo real y advierte que **las actualizaciones OEV están disponibles solo para searchers asociados a API3**, no para el público general. Fuente: [data feeds y Signed APIs](https://docs.api3.org/oev/in-depth/data-feeds/).
- El panorama OEV distingue subastas privadas con searchers asociados y búsqueda pública sobre datos retrasados. Fuente: [introducción OEV](https://docs.api3.org/oev/).

### Evaluación para cuatro estudiantes — inferencia

**Dificultad media** para consumir un proxy y mostrar decisiones de presupuesto; **alta** para un protocolo de crédito/liquidación nuevo o un buscador OEV competitivo. React/TypeScript encajan; alguien tendría que aprender al menos lectura de contratos, despliegue y aritmética Solidity si el reto exige integración on-chain. Preferir un contrato pequeño y testeable, sin fondos reales. No confundir premios de hackathon con OEV Rewards del protocolo.

**Competencia probable: indeterminada.** Es razonable esperar perfiles EVM/DeFi entre los interesados, pero no hay datos públicos de distribución ni experiencia de equipos. Fondo menor no equivale a menor dificultad para ganar.

### Dos propuestas originales — elegibilidad y acumulación por verificar

1. **Oracle Budget Guard:** contrato sencillo que permite o rechaza un gasto del agente según cotización y antigüedad del dato; tablero explica la decisión. MVP: un feed activo, un límite, compra aceptada y compra bloqueada con simulación explícita de dato vencido. BSV o Cardano liquidan un servicio mediante un adaptador independiente; el servidor hace de coordinador y se declara esa confianza. Candidaturas hipotéticas API3 + uno de los rails + auditoría. No se promete seguridad cross-chain ni bridge.
2. **Agent Treasury Dry Run:** agente propone rebalancear una tesorería de prueba, API3 valora exposición y un contrato aplica límites antes de autorizar. MVP: dos activos simulados, una cotización real, un rebalanceo y su explicación. BSV cobra por una herramienta de análisis o Cardano paga al proveedor del informe. Candidaturas hipotéticas API3 + BSV/Cardano + auditoría. Evitar DEX, préstamo y liquidaciones reales en el MVP.

## TUM Blockchain Club: créditos de auditoría

La web anuncia créditos de auditoría; **no deducir que exista un track general, un premio de seguridad o que cualquier lenguaje/contrato sea elegible**. El importe y las condiciones verificadas están en [hackathon-datos.md](hackathon-datos.md).

### Evaluación — inferencia

La dificultad no es clasificable sin criterios. Añadir controles verificables y un threat model ayuda a explicar calidad, pero no demuestra elegibilidad. La competencia y el número de premiados son desconocidos.

### Dos propuestas originales — elegibilidad y acumulación por verificar

1. **Policy Wallet Testbench:** un agente solo puede usar un presupuesto delegado; demo de cuatro intentos (permitido, excede importe, proveedor no autorizado, replay). Implementar un rail principal BSV o Cardano, con contrato pequeño solo donde aporte una garantía demostrable. Posible combinación con el premio del rail y API3 para valoración, si las bases admiten acumulación.
2. **Escrow Failure Lab:** interfaz que permite reproducir entrega válida, entrega tardía y falta de entrega en un servicio contratado por agentes. Mostrar estado y recuperación en red de pruebas; reutilizar escrow autorizado y documentar límites. Posible combinación Cardano + auditoría; extensión BSV solo si se completa un segundo flujo de pagos útil y admitido.

## Límites del análisis

- Las combinaciones anteriores describen arquitectura e ideas, **no permisos de doble candidatura o doble premio**.
- No hay acceso confirmado a mentores concretos, test funds, créditos de APIs, contratos específicos ni infraestructura reservada al evento.
- Una capa HTTP común no hace interoperables los protocolos BRC-121 de BSV y x402 de Cardano. Diseñar adaptadores separados es una inferencia de arquitectura, no una función oficial cross-chain.
- Preparar esta investigación no equivale a permiso para escribir o reutilizar código antes del inicio; confirmar las reglas del evento.
