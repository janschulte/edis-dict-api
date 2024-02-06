import { Controller, Get, Query } from '@nestjs/common';
import { StationQuery, StationsService } from '../stations/stations.service';

@Controller('query')
export class QueryController {
  constructor(private stationsSrvc: StationsService) {}
  @Get()
  findAll(@Query() query: StationQuery) {
    return this.stationsSrvc.getStations(query);
  }
}
