import { TerminationReason } from '@prisma/client';
import { validate } from 'class-validator';
import { CreateEmploymentTerminationDto } from './create-employment-termination.dto';

describe('CreateEmploymentTerminationDto', () => {
  it('should accept terminationDate as YYYY-MM-DD', async () => {
    const dto = new CreateEmploymentTerminationDto();

    dto.employeeId = 'employee-1';
    dto.terminationDate = '2026-09-08';
    dto.reason = TerminationReason.RESIGNATION;

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('should reject terminationDate with time or timezone', async () => {
    const dto = new CreateEmploymentTerminationDto();

    dto.employeeId = 'employee-1';
    dto.terminationDate = '2026-09-08T15:30:00.000Z';
    dto.reason = TerminationReason.RESIGNATION;

    const errors = await validate(dto);

    const terminationDateError = errors.find(
      (error) => error.property === 'terminationDate',
    );

    expect(terminationDateError?.constraints).toMatchObject({
      matches: 'terminationDate debe tener formato YYYY-MM-DD',
    });
  });
});
