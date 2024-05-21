import { Controller, Get, Logger, Query } from '@nestjs/common';
import { map } from 'rxjs';

import { StationQuery, StationsService } from '../stations/stations.service';

@Controller('search')
export class QueryController {
  private readonly logger = new Logger(QueryController.name);

  constructor(private stationsSrvc: StationsService) {}

  @Get()
  queryStations(@Query() query: StationQuery) {
    return this.stationsSrvc
      .getStations(query)
      .pipe(map((st) => this.stationsSrvc.prepareResponse(st)));
  }
}
