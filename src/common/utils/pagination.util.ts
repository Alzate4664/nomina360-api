import { BadRequestException } from '@nestjs/common';

export function parsePositiveInteger(
  value: string | undefined,
  fieldName: string,
  defaultValue: number,
  maxValue?: number,
) {
  if (value === undefined) {
    return defaultValue;
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    throw new BadRequestException(
      `${fieldName} debe ser un número entero mayor o igual a 1`,
    );
  }

  if (maxValue && parsedValue > maxValue) {
    throw new BadRequestException(
      `${fieldName} no puede ser mayor que ${maxValue}`,
    );
  }

  return parsedValue;
}

export function parseOptionalInteger(
  value: string | undefined,
  fieldName: string,
  minValue: number,
  maxValue: number,
) {
  if (value === undefined) {
    return undefined;
  }

  const parsedValue = Number(value);

  if (
    !Number.isInteger(parsedValue) ||
    parsedValue < minValue ||
    parsedValue > maxValue
  ) {
    throw new BadRequestException(
      `${fieldName} debe ser un número entero entre ${minValue} y ${maxValue}`,
    );
  }

  return parsedValue;
}