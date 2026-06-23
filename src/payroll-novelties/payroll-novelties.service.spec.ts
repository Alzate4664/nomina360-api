import { Test, TestingModule } from '@nestjs/testing';
import { PayrollNoveltiesService } from './payroll-novelties.service';

describe('PayrollNoveltiesService', () => {
  let service: PayrollNoveltiesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PayrollNoveltiesService],
    }).compile();

    service = module.get<PayrollNoveltiesService>(PayrollNoveltiesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
