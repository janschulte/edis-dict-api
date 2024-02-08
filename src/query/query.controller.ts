import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Query,
} from '@nestjs/common';
import { mergeMap } from 'rxjs';

import { NominatimService } from '../nominatim/nominatim.service';
import { StationQuery, StationsService } from '../stations/stations.service';

@Controller('search')
export class QueryController {
  private readonly logger = new Logger(QueryController.name);

  constructor(
    private stationsSrvc: StationsService,
    private nominatimSrvc: NominatimService,
  ) {}

  @Get()
  queryStations(@Query() query: StationQuery) {
    if (query.q) {
      this.logger.log(`Query with term: ${query.q}`);
      return this.nominatimSrvc.query(query.q).pipe(
        mergeMap((res) => {
          if (res.length > 0) {
            const type = res[0].addresstype;
            const value = res[0].name;
            this.logger.log(`result type: ${type} with value: ${value}`);
            const query: StationQuery = {};
            switch (type) {
              case 'state':
                query.land = value;
                break;
              default:
                throw new HttpException(
                  `Could not resolve type: ${type}`,
                  HttpStatus.INTERNAL_SERVER_ERROR,
                );
            }
            return this.stationsSrvc.getStations(query);
          }
          throw new HttpException(
            'Could not resolve your query',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }),
      );
    } else {
      return this.stationsSrvc.getStations(query);
    }
  }
}
