# Cartera Clara — primera vertical de cobranza

Demo original de cobranza operativa para empresas ficticias. Enseña un ciclo concreto: **supervisor asigna una cuenta → agente registra contacto y su resultado → si hubo acuerdo, guarda monto y fecha opcional → finanzas confirma un abono → el saldo y el historial se actualizan**. La cartera de ejemplo contiene tres cuentas independientes; al liquidar una se puede seleccionar y asignar otra.

No contiene código, datos, pantallas ni reglas de un empleador. No envía mensajes, no procesa pagos reales y no es una herramienta de cobranza lista para producción.

## Ejecutar con SQL Server local

Requiere Node.js 20+, el SDK de .NET 10 y Docker Desktop con el motor en ejecución. El lanzador reconoce una instalación normal de `dotnet`; en este espacio de trabajo también puede usar el SDK local de `../.tools/dotnet`.

Desde esta carpeta, en PowerShell:

```powershell
npm run db:setup
npm run db:up
npm run dev
```

Abrir `http://127.0.0.1:4173`. La primera ejecución aplica la migración y crea **tres cuentas ficticias limpias** en SQL Server. La contraseña local se genera en `.env` y no debe subirse a Git. El botón «Reiniciar datos de ejemplo» borra los movimientos de esta base local y vuelve a crear esas tres cuentas; solo está disponible en modo desarrollo. `npm run db:down` detiene el contenedor sin borrar su volumen.

La conexión de desarrollo usa `Encrypt=False` **solo** en el puerto local `127.0.0.1`; no reutilices esa configuración para un servidor remoto. Si defines `ConnectionStrings__CarteraClara`, el lanzador respetará tu propia configuración de cifrado.

La versión anterior guardada en `localStorage` no se importa ni se borra: esta versión simplemente deja de leerla. Así podrás probar desde cero sin afectar el historial que quedó en tu navegador.

## Probar una promesa vencida sin cambiar el reloj

La fecha acordada debe ser futura si el cliente definió una. Para ver una promesa **con fecha** vencida en la demo, déjala pendiente o parcialmente cubierta, elige en «Simular fecha de consulta» un día posterior a su vencimiento y revisa la cuenta: aparecerán «Promesa vencida» y el importe aún no cubierto. En la propia fecha acordada todavía no se marca vencida; una promesa totalmente cubierta nunca se marca vencida. Un compromiso de monto **sin fecha** puede recibir abonos, pero no vence automáticamente.

Esa fecha es una **vista previa de solo lectura** por pestaña: el servidor calcula cómo se vería el vencimiento, pero no modifica su reloj, la fecha pactada, el saldo, la base de datos ni la bitácora. Mientras esté activa se bloquean los formularios; «Volver a hoy» restaura la operación normal. Cuando una promesa realmente vence, el agente puede registrar otro contacto de seguimiento y finanzas todavía puede registrar abonos contra la misma promesa.

Para probar **agendar una nueva fecha de seguimiento** ahora mismo, pulsa «Volver a hoy» y después «Preparar caso vencido de prueba». Solo en desarrollo local, esto añade una cuarta cuenta ficticia (Comercial Arce) con una promesa histórica ya vencida; no toca las otras cuentas y volver a pulsarlo no la duplica. Como Lía, selecciona una fecha futura en «Agendar próxima gestión». La fecha original prometida para pagar no cambia: la nueva fecha es solo para la siguiente gestión del agente, queda en la bitácora y puede reprogramarse. Si finanzas termina de cubrir la promesa, la agenda pendiente se cierra. «Reiniciar datos de ejemplo» elimina todos los movimientos de la demo, incluido este caso opcional.

Para verificar las reglas originales:

```powershell
npm test
```

Con la API encendida y **solo si las tres cuentas siguen limpias**, `npm run test:e2e` recorre un flujo real contra SQL Server. Deja los movimientos creados para que puedas revisarlos en la interfaz; si deseas repetirlo, usa antes «Reiniciar datos de ejemplo».

## Roles de la demo

- **Supervisor:** asigna una cuenta a Lía o Marco, antes de que empiece el contacto.
- **Agente asignado:** clasifica el cierre de cada contacto efectivo. Si hay acuerdo de monto, lo guarda junto con el contacto, con fecha o sin ella. Si más tarde acuerdan una fecha, la agrega al mismo compromiso. También puede cerrar una gestión como «requiere seguimiento» o «sin acuerdo», sin crear una promesa ficticia.
- **Promesa vencida:** se detecta al consultar una fecha posterior al vencimiento si aún falta cubrir parte del importe. Es un estado calculado, no un cambio automático del acuerdo guardado.
- **Finanzas:** solo ve cuentas ya asignadas. Confirma abonos para una cuenta identificada con una referencia única; los abonos reducen el saldo y pueden completar una promesa.

El selector de rol es solo para recorrer la demo. No es autenticación real: cualquiera con acceso a la demo puede elegir un rol. La API vuelve a validar las reglas, además de ocultar controles no permitidos en la interfaz.

## Límites de la demo pública

En un despliegue fuera de desarrollo, la API permite como máximo 30 solicitudes por minuto por dirección IP observada por el servidor y 1,000 solicitudes a `/api` por día entre todos los visitantes. Al alcanzar el límite responde HTTP 429 sin consultar ni modificar SQL. Los archivos estáticos y `/api/health` no consumen el contador de SQL; la ruta de salud solo confirma que el proceso responde, **no** que la base está disponible. En desarrollo local estos límites no estorban las pruebas.

Los contadores viven en memoria: se reinician cuando la aplicación se reinicia y no son una garantía absoluta contra abuso ni un límite de facturación. Además, detrás de un proxy, varios visitantes podrían compartir la IP que observa la aplicación. La demo sigue siendo abierta y compartida: cualquiera puede cambiar las **cuentas ficticias**; nunca cargues información real. Para evitar cargos de nube, el despliegue debe usar exclusivamente un plan gratuito de aplicación y la oferta gratuita de Azure SQL con la opción **Auto-pause the database until next month** cuando se agote su cuota. Si alguna de esas opciones no aparece claramente como gratuita, detener la creación y revisar antes de confirmar. Un presupuesto de Azure solo alerta: no detiene el consumo.

## Qué persiste y qué sigue fuera

La API ASP.NET Core guarda cuentas, contactos, promesas, abonos y bitácora en tablas relacionadas. La migración inicial está en `api/Migrations`. Cada operación actualiza el expediente y la bitácora en una sola transacción; SQL Server impide referencias de abono duplicadas y su `rowversion` detecta cambios simultáneos en la misma cuenta. Los importes se guardan como centavos enteros.

Faltan autenticación real, pagos reales, comunicaciones con clientes, intereses moratorios, reglas legales de contacto y automatización de rutas. Por eso **no es una herramienta de cobranza lista para producción**. Tampoco se ha creado ningún recurso de nube de pago.

La elección de base y sus alternativas están explicadas en [DATABASE_DECISION.md](./DATABASE_DECISION.md).

## Publicación del proyecto

Este repositorio contiene la demo y sus instrucciones de ejecución local. La contraseña de SQL Server vive en `.env`, que está excluido de Git. Para un despliegue público deben configurarse la cadena `ConnectionStrings__CarteraClara` como secreto del servicio y una instancia de SQL Server accesible de forma segura; no se debe publicar la contraseña ni exponer el puerto local de Docker. El selector de roles de la demo **no es autenticación**, por lo que el sitio debe presentarse como muestra interactiva con datos ficticios, nunca como sistema de cobranza real.
