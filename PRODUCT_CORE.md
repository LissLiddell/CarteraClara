# Núcleo de producto — Cartera Clara

## Problema

Un equipo pequeño que vende a crédito necesita saber **quién atiende cada cuenta, qué se habló con el cliente, qué prometió pagar y cuánto adeuda tras cada abono confirmado**. La demo no reproduce una operación ni política de una empresa real.

## Escenario inicial

«Estudio Bruma» es un cliente empresarial ficticio con $12,500 pendientes. La supervisora asigna su cuenta a un agente. El agente registra un contacto efectivo y una promesa de $4,000. Finanzas registra un abono confirmado de $2,500. Resultado verificable: saldo $10,000; promesa parcialmente cubierta por $2,500; historial con las cuatro acciones y sus responsables.

La cartera incluye además «Librería Jacaranda» ($7,800) y «Taller Nube» ($4,300), ambas sin asignar. Cada expediente tiene saldo, promesas, pagos e historial propios. Al liquidar uno no se recicla: se conserva para consulta y la supervisora puede asignar el siguiente.

## Decisiones de esta vertical

1. Solo un supervisor asigna. Puede cambiar la asignación antes del primer contacto; después no, para no borrar responsabilidad sin un proceso de transferencia.
2. Solo el agente asignado registra contactos. Un contacto efectivo requiere clasificar su cierre: promesa con fecha, compromiso de monto sin fecha, requiere seguimiento o sin acuerdo. Un intento sin respuesta no crea promesa. Contacto y compromiso se guardan en una sola operación para no dejar una llamada efectiva sin clasificar.
3. Hay un compromiso abierto por cuenta. Su monto debe ser positivo y no superar el saldo. La fecha de pago, si se acordó, debe ser futura. Un compromiso sin fecha no vence automáticamente; tampoco se le inventa una fecha. Si luego se acuerda un día, se añade al mismo compromiso sin duplicarlo ni cambiar el monto. Si ni siquiera se acordó monto, corresponde «requiere seguimiento» y no se crea compromiso.
4. Finanzas confirma el abono. Importe positivo y no mayor al saldo. La referencia es obligatoria y única para evitar doble registro accidental.
   La cuenta debe estar asignada y su identificador y cliente aparecen dentro del formulario de abono. Finanzas no ve cuentas sin asignar.
5. Un abono disminuye el saldo y se aplica primero a la promesa abierta. Si no alcanza, queda parcial; si alcanza, queda cumplida. El sobrante del abono también reduce el saldo, pero no se atribuye a la promesa.
   Si no hay promesa abierta, el abono se liga solo a la cuenta y aparece en la bitácora como **abono independiente**; nunca se liga al intento de contacto. Si un pago cubre la promesa y además deja sobrante, la bitácora separa ambos importes como **abono mixto**.
6. No se borran eventos ni abonos. El historial conserva actor, instante e impacto. Esta demo permite reiniciar su estado local completo, no editar transacciones individuales.
7. Una promesa con fecha no cubierta aparece vencida desde el día posterior a su fecha acordada. El agente puede registrar un contacto y agendar o reprogramar la próxima gestión, ambos identificados en la bitácora. La fecha de esa gestión es distinta de la fecha original prometida para pagar; no altera el saldo ni cancela la promesa. Finanzas todavía puede aplicar abonos. Al cumplirse la promesa, se cierra la agenda pendiente. La fecha de consulta simulada solo previsualiza el vencimiento y no crea movimientos; para practicar acciones reales existe un caso histórico ficticio opcional en desarrollo local.

## Etapa técnica actual y siguiente

La API .NET y SQL Server local ya modelan cuentas, contactos, promesas, abonos e historial. Hay transacciones, referencia única de abono y control optimista de concurrencia. El selector de roles continúa siendo **solo una simulación**, no autenticación ni autorización de una persona real. Lo siguiente, antes de cualquier despliegue público, sería autenticación y RBAC reales, pruebas de integración con SQL Server y una estrategia de despliegue. Ver [DATABASE_DECISION.md](./DATABASE_DECISION.md) para el razonamiento de la base.
