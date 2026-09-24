# Cómo elegimos la base de datos de Cartera Clara

**Estado:** implementada para desarrollo local. La API ASP.NET Core usa SQL Server y una migración inicial; las pruebas originales del dominio en JavaScript siguen como referencia de comportamiento.

## Primero el problema, luego la marca

| Pregunta | Lo que necesita este proyecto |
| --- | --- |
| ¿Qué relaciones hay? | Una cuenta tiene un responsable, contactos, promesas, abonos e historial. Necesitamos relacionarlos sin mezclar expedientes. |
| ¿Qué no puede fallar? | Un abono no debe registrarse dos veces; saldo, abono y evento de auditoría deben quedar consistentes juntos. |
| ¿Qué consultaremos? | Cuentas por agente y estado, saldos, promesas pendientes y movimientos por periodo. |
| ¿Dónde correrá? | Desarrollo local primero; quizá una demo alojada después. |
| ¿Qué queremos aprender/mostrar? | Un backend .NET distinto del stack de ClientFlow/PosFlow, con una base empresarial y control de concurrencia. |

Estas respuestas favorecen una **base relacional con transacciones y restricciones**. No obligan a una marca única: PostgreSQL también sería buena elección.

## Por qué elegimos SQL Server

- EF Core tiene un proveedor oficial para SQL Server y Azure SQL, cómodo para una API .NET ([Microsoft Learn](https://learn.microsoft.com/en-us/ef/core/providers/sql-server/)).
- Nos permite mostrar una combinación nueva en el portafolio, distinta de PostgreSQL y DynamoDB.
- SQL Server Express es una edición gratuita para aprender y construir aplicaciones pequeñas; debemos revisar sus límites vigentes al instalarlo ([Microsoft Learn](https://learn.microsoft.com/en-us/sql/sql-server/editions-and-components-of-sql-server-latest)).
- Si más adelante alojamos la demo en Azure, Azure SQL tiene una oferta gratuita sujeta a condiciones y límites. Elegiríamos **pausar al agotar el cupo**, nunca continuar con cobros automáticamente sin revisar la cuenta ([Microsoft Learn](https://learn.microsoft.com/en-us/azure/azure-sql/database/free-offer?view=azuresql)).

## Cuándo escogeríamos otra

- **PostgreSQL:** si el equipo ya lo opera, el despliegue resulta más barato o queremos portabilidad. Para las reglas actuales es igual de defendible.
- **SQLite:** si solo quisiéramos una demo local de una sola instancia con instalación mínima. Sería práctico, pero mostraría menos del escenario multiusuario que queremos construir.
- **DynamoDB:** si las consultas estuvieran muy definidas alrededor de claves/eventos y la prioridad fuera otra arquitectura. Para cuentas, pagos, reportes y relaciones, aquí introduciría más diseño que beneficio.

## Regla para aprender a elegir

No preguntes primero «¿cuál está de moda?». Anota **modelo de datos, invariantes, consultas, carga/concurrencia, operación/costo y experiencia del equipo**. Descarta lo que no resuelve esos puntos; entre las opciones que sí, elige la que reduzca trabajo y riesgo. Revisa la decisión cuando aparezca un requisito nuevo.
