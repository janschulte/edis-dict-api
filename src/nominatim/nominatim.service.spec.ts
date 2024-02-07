import { Test, TestingModule } from '@nestjs/testing';
import { NominatimService } from './nominatim.service';

describe('NominatimService', () => {
  let service: NominatimService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NominatimService],
    }).compile();

    service = module.get<NominatimService>(NominatimService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
