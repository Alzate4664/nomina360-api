# ADR-0001: Versionado y resolución de reglas de nómina

- Status: Accepted
- Date: 2026-09-24

El modelo temporal original de este ADR se refina en
[ADR-0002: PayrollRuleSet administration and applicability](0002-payroll-rule-set-administration-and-applicability.md),
que separa el sobre temporal aprobado e inmutable del snapshot de su calendario
operativo de aplicabilidad, preservando la determinación histórica por versión fijada.

## Context

Nómina360 calcula resultados laborales y financieros que dependen de parámetros
y reglas que pueden cambiar con el tiempo.

Al momento de adoptar esta decisión, varias reglas se encontraban centralizadas
en PAYROLL_RATES, mientras otras permanecían hardcodeadas en los calculadores.

Los resultados de PayrollPeriod y EmploymentTermination se almacenan actualmente
como el último cálculo materializado. Las recalculaciones reemplazan los conceptos
persistidos anteriormente.

El sistema debe evolucionar hacia reglas versionadas sin acoplar los calculadores
a Prisma, a configuración global mutable ni a infraestructura externa.

## Decision

### 1. PayrollRuleSet

Las reglas legales se representarán mediante PayrollRuleSet versionados e
inmutables después de su publicación.

Los RuleSets serán globales por jurisdicción y no pertenecerán a una Company.

Inicialmente la jurisdicción soportada será Colombia (`CO`).

Las vigencias utilizarán fechas de negocio y semántica de intervalo semiabierto:

    [effectiveFrom, effectiveTo)

Un RuleSet publicado no se modificará. Una corrección o cambio normativo producirá
una nueva versión.

### 2. PayrollRules como contrato de dominio

Los calculadores no consultarán Prisma, ConfigService ni PayrollRuleSet
directamente.

La persistencia será transformada a un objeto de dominio tipado PayrollRules.

Los calculadores recibirán explícitamente las reglas necesarias para producir un
resultado determinístico.

### 3. PayrollCalculationContext

La resolución regulatoria pertenecerá al contexto del cálculo, no al agregado que
almacena el resultado.

Conceptualmente:

    PayrollCalculationContext
      - effectiveBusinessDate
      - jurisdictionCode
      - ruleSetId
      - rules

Tanto PayrollPeriod como EmploymentTermination utilizarán este contexto.

### 4. Snapshot de la versión utilizada

PayrollPeriod y EmploymentTermination conservarán el identificador del RuleSet
utilizado para producir su cálculo materializado mediante un campo conceptualmente
denominado:

    calculatedRuleSetId

Este campo representa la procedencia del cálculo, no propiedad de las reglas.

Una recalculación reutilizará por defecto el RuleSet previamente fijado.

Cambiar deliberadamente la versión regulatoria deberá ser una operación explícita
y auditada.

### 5. No introducir PayrollCalculationRun todavía

El lifecycle actual conserva únicamente el último cálculo materializado y reemplaza
los conceptos durante la recalculación.

Agregar un historial append-only de ejecuciones en esta etapa aumentaría de forma
significativa la complejidad de persistencia, aprobación, cierre, reportes y APIs.

PayrollCalculationRun se considerará cuando el producto requiera conservar
reliquidaciones, correcciones, múltiples intentos de cálculo o trazabilidad
histórica completa.

### 6. No persistir aún RuleSet por concepto

En el modelo actual PayrollNovelty no contiene suficiente temporalidad de negocio
para aplicar distintas vigencias dentro de un mismo período con precisión.

Los campos appliedRuleSetId en conceptos se introducirán únicamente cuando exista
soporte para fechas efectivas y cálculo segmentado por vigencia.

### 6.1. Política temporal operativa inicial

La primera integración de PayrollRuleSet no asumirá que una única fecha representa
la aplicabilidad legal de todos los conceptos de nómina.

`effectiveBusinessDate` será inicialmente una fecha de resolución técnica del
snapshot regulatorio utilizado por un cálculo de una sola vigencia.

Para los tipos de nómina periódicos:

- MONTHLY
- SEMIMONTHLY
- WEEKLY
- BIWEEKLY

el período completo deberá estar cubierto por un único PayrollRuleSet publicado.

La aplicación resolverá el RuleSet aplicable a `startDate` y `endDate`. El cálculo
solo podrá continuar cuando ambos extremos resuelvan al mismo `ruleSetId`.

Si los extremos resuelven versiones distintas, o alguna fecha no tiene un RuleSet
publicado aplicable, el cálculo será rechazado explícitamente.

No se seleccionará silenciosamente la versión correspondiente únicamente a
`startDate`, `endDate`, `paymentDate` ni a la fecha de ejecución.

Esta restricción es temporal. Cuando PayrollNovelty disponga de temporalidad de
negocio suficiente, el motor podrá evolucionar hacia cálculo segmentado por
vigencia.

### 6.2. Nóminas especiales

BONUS y SEVERANCE utilizan actualmente un único conjunto de reglas para cálculos
cuyo período de causación se deriva de `year` y `month`.

La fecha regulatoria exacta aplicable a estos cálculos no queda definida por este
ADR. No se adoptará una fecha de corte arbitraria únicamente para completar la
integración técnica de PayrollRuleSet.

EXTRAORDINARY tampoco tendrá una política implícita mientras no exista una fecha o
intervalo de negocio explícito suficiente para resolver las reglas.

PayrollType.TERMINATION no se integrará al mecanismo de resolución hasta decidir su
relación con el agregado EmploymentTermination existente.

### 6.3. EmploymentTermination

EmploymentTermination continuará siendo un agregado independiente de PayrollPeriod.

Para una primera migración técnica que conserve el comportamiento actual,
`terminationDate` actuará inicialmente como `effectiveBusinessDate` técnico
del único snapshot regulatorio utilizado por el cálculo.

Esta decisión representa una política técnica de resolución y no certifica que
`terminationDate` sea la fecha legal aplicable individualmente a salario pendiente,
cesantías, prima, vacaciones u otros conceptos.

La eventual resolución por concepto requerirá mayor temporalidad y validación
jurídica especializada.

### 7. Reglas legales y políticas empresariales

PayrollRuleSet representará legislación/regulación.

Las configuraciones particulares permitidas para una empresa pertenecerán a un
concepto independiente, por ejemplo CompanyPayrollPolicy.

Ambos dominios no se mezclarán.

## Alternatives considered

### Global mutable configuration

Rejected.

Modificar una constante o configuración global impediría reproducir resultados
históricos de manera determinística.

### PayrollRuleSet per Company

Rejected.

Duplicaría las mismas reglas legales para cada tenant y mezclaría legislación con
configuración empresarial.

### Database access from calculators

Rejected.

Acoplaría la lógica financiera a persistencia, reduciría la testabilidad y
dificultaría resolver varias vigencias en un mismo proceso.

### PayrollCalculationRun immediately

Deferred.

Es una dirección válida para trazabilidad histórica completa, pero constituye
complejidad prematura para el lifecycle actual.

### RuleSet only on PayrollPeriod

Rejected.

EmploymentTermination también utiliza el motor de cálculo y produce resultados
financieros independientemente de PayrollPeriod.

## Consequences

### Short term: 3-6 months

- Se requiere refactorizar calculadores para recibir PayrollRules explícitamente.
- Los cálculos actuales deben conservar exactamente sus resultados.
- Se agrega infraestructura de resolución sin cambiar reglas laborales durante el
  refactor.
- Se evita una migración prematura hacia historial completo de ejecuciones.

### Medium term: 1-2 years

- Los cálculos serán reproducibles por versión regulatoria.
- Las nuevas vigencias podrán introducirse sin modificar cálculos históricos.
- PayrollPeriod y EmploymentTermination compartirán el mismo mecanismo regulatorio.
- Será posible separar políticas empresariales de legislación.

### Long term: 3-5+ years

- El diseño permite múltiples jurisdicciones sin reescribir el motor.
- Puede evolucionar hacia cálculo segmentado por vigencia.
- Los conceptos podrán registrar su RuleSet específico.
- PayrollCalculationRun podrá agregarse como historial append-only sin reemplazar
  los contratos de dominio de los calculadores.

## Risks

- El modelo inicial seguirá soportando una única versión regulatoria por cálculo.
- Nóminas que crucen cambios de vigencia no deberán calcularse silenciosamente con
  una sola versión cuando la legislación requiera segmentación.
- La exactitud legal de los valores actuales no queda certificada por este ADR.
- Las reglas deberán ser validadas con fuentes oficiales y revisión especializada
  antes del uso comercial en producción.
- `effectiveBusinessDate` no debe interpretarse automáticamente como la fecha legal
  aplicable a todos los conceptos incluidos en un cálculo.
- BONUS, SEVERANCE y EXTRAORDINARY requieren una política temporal específica antes
  de consumir PayrollRuleSet en producción.
- EmploymentTermination utilizará inicialmente una única versión por compatibilidad
  con el motor actual; esto no sustituye la validación legal por concepto.

## Reversibility

La decisión es altamente reversible porque los calculadores dependerán de un
contrato de dominio y no de la persistencia de PayrollRuleSet.

Cambiar posteriormente la forma de almacenar o resolver las reglas no requiere
reescribir las fórmulas financieras.

## Migration strategy

1. Crear PayrollRules como contrato de dominio.
2. Representar la configuración actual como reglas por defecto.
3. Eliminar accesos directos a PAYROLL_RATES desde los calculadores.
4. Incorporar PayrollRuleSet persistente y PayrollRulesResolver.
5. Fijar calculatedRuleSetId en los agregados calculados.
6. Incorporar fechas efectivas a PayrollNovelty.
7. Soportar resolución segmentada cuando un cálculo cruce vigencias.
8. Añadir trazabilidad por concepto cuando exista cálculo multi-vigencia.
9. Evaluar PayrollCalculationRun cuando se requiera historial de ejecuciones.

## Open questions

- Fecha legal exacta que determina la vigencia para cada tipo de concepto.
- Tratamiento regulatorio de períodos que atraviesan múltiples vigencias.
- Política para correcciones retroactivas de RuleSets ya publicados.
- Reglas exactas de incapacidad, horas, recargos, contribuciones y demás parámetros,
  que deberán verificarse separadamente de este refactor arquitectónico.
