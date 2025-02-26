import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Query,
} from '@nestjs/common';
import { map } from 'rxjs';

import { ApiExcludeController } from '@nestjs/swagger';
import { StationsService } from '../stations/stations.service';

@Controller('options')
@ApiExcludeController()
export class OptionsController {
  private readonly logger = new Logger(OptionsController.name);

  constructor(private stationsSrvc: StationsService) {}

  @Get()
  findAll(@Query() query: { parameter: string }) {
    if (query.parameter) {
      this.logger.log(query.parameter);
      return this.stationsSrvc.getStations().pipe(
        map((stations) => {
          switch (query.parameter) {
            case 'kreis':
              return [
                ...Array.from(
                  new Set(stations.map((st) => st.kreis).filter((e) => e)),
                ),
                ...Array.from(
                  new Set(
                    stations
                      .map((st) => st.kreis_alternatives)
                      .filter((e) => e)
                      .flat(),
                  ),
                ),
              ].sort();
            case 'einzugsgebiet':
              return Array.from(
                new Set(
                  stations
                    .map((st) => st.einzugsgebiet)
                    .sort()
                    .filter((e) => e),
                ),
              );
            case 'land':
              return [
                ...Array.from(
                  new Set(stations.map((st) => st.land).filter((e) => e)),
                ),
                ...Array.from(
                  new Set(
                    stations
                      .map((st) => st.land_alternatives)
                      .filter((e) => e)
                      .flat(),
                  ),
                ),
              ].sort();
            case 'station':
              return Array.from(
                new Set(
                  stations
                    .map((st) => st.shortname)
                    .sort()
                    .filter((e) => e),
                ),
              );
            case 'agency':
              return Array.from(
                new Set(
                  stations
                    .map((st) => st.agency)
                    .sort()
                    .filter((e) => e),
                ),
              );
            case 'gewaesser':
              return Array.from(
                new Set(
                  stations
                    .map((st) => st.water.shortname)
                    .sort()
                    .filter((e) => e),
                ),
              );
            case 'country':
              return [
                ...Array.from(
                  new Set(stations.map((st) => st.country).filter((e) => e)),
                ),
                ...Array.from(
                  new Set(
                    stations
                      .map((st) => st.country_alternatives)
                      .filter((e) => e)
                      .flat(),
                  ),
                ),
              ].sort();
            case 'parameter':
              return Array.from(
                new Set(
                  stations
                    .map((st) =>
                      st.timeseries.map((e) => [e.longname, e.shortname]),
                    )
                    .flat()
                    .flat()
                    .sort()
                    .filter((e) => e),
                ),
              );
            default:
              throw new HttpException(
                'unsupported parameter',
                HttpStatus.BAD_REQUEST,
              );
          }
        }),
      );
    } else {
      throw new HttpException('missing parameter', HttpStatus.BAD_REQUEST);
    }
  }
}
