import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { map, Observable } from 'rxjs';

export interface PegelonlineStation {
  uuid: string;
  number: string;
  shortname: string;
  longname: string;
  km: number;
  agency: string;
  longitude: number;
  latitude: number;
  water: {
    shortname: string;
    longname: string;
  };
}

export interface StationQuery {
  station?: string;
  gewaesser?: string;
  land?: string;
  einzugsgebiet?: string;
  kreis?: string;
  region?: string;
  parameter?: string;
  bbox?: number[];
}

@Injectable()
export class StationsService {
  private readonly logger = new Logger(StationsService.name);

  private fetchedStations: Observable<PegelonlineStation[]> | undefined;

  constructor(private readonly httpService: HttpService) {}

  getStations(query: StationQuery = {}): Observable<PegelonlineStation[]> {
    if (this.fetchedStations === undefined) {
      this.fetchStations();
    }
    this.logger.log(`Query ${JSON.stringify(query)}`);
    return this.fetchedStations.pipe(map(this.filterResults(query)));
  }

  private filterResults(
    query: StationQuery,
  ): (value: PegelonlineStation[], index: number) => PegelonlineStation[] {
    return (res) => {
      res = this.filterStation(query, res);
      res = this.filterGewaesser(query, res);
      return res;
    };
  }

  private filterStation(query: StationQuery, res: PegelonlineStation[]) {
    if (query.station) {
      const filter = query.station;
      this.logger.log(`Filter with Station: ${filter}`);
      res = res.filter(
        (e) => e.shortname.toLowerCase() === filter.toLowerCase(),
      );
    }
    return res;
  }

  private filterGewaesser(query: StationQuery, res: PegelonlineStation[]) {
    if (query.gewaesser) {
      const filter = query.gewaesser;
      this.logger.log(`Filter with Gewaesser: ${filter}`);
      res = res.filter(
        (e) => e.water.shortname.toLowerCase() === filter.toLowerCase(),
      );
    }
    return res;
  }

  private fetchStations() {
    this.logger.log('fetch stations');
    this.fetchedStations = this.httpService
      .get<PegelonlineStation[]>(
        'https://www.pegelonline.wsv.de/webservices/rest-api/v2/stations.json',
      )
      .pipe(map((res) => res.data));
  }
}
