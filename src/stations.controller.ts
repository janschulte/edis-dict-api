import { Controller, Get } from '@nestjs/common';

import { StationsService } from './stations/stations.service';

@Controller('stations')
export class StationsController {
  constructor(private stationsSrvc: StationsService) {}
  @Get()
  findAll() {
    return this.stationsSrvc.getStations();
  }
}
