# ADR-0001: Versionado y resolución de reglas de nómina

- Status: Accepted
- Date: 2026-09-24

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
