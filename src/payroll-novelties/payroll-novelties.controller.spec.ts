import { Test, TestingModule } from '@nestjs/testing';
import { PayrollNoveltiesController } from './payroll-novelties.controller';

describe('PayrollNoveltiesController', () => {
  let controller: PayrollNoveltiesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PayrollNoveltiesController],
    }).compile();

    controller = module.get<PayrollNoveltiesController>(PayrollNoveltiesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
