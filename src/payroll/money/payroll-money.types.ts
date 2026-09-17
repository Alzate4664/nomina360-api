import Decimal from 'decimal.js';
import { ConceptType } from '@prisma/client';

export interface PayrollConceptAmount {
  code: string;
  name: string;
  type: ConceptType;
  amount: Decimal;
}

export interface PayrollCalculationResult {
  earnedTotal: Decimal;
  deductionsTotal: Decimal;
  netPay: Decimal;
  concepts: PayrollConceptAmount[];
}