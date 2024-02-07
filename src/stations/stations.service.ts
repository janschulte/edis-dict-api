import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { readFile, writeFile } from 'fs';
import { forkJoin, map, mergeMap, Observable, of } from 'rxjs';

import { NominatimService } from '../nominatim/nominatim.service';

export interface PegelonlineStation {
  uuid: string;
  number: string;
  shortname: string;
  longname: string;
  km: number;
  agency: string;
  longitude: number;
  latitude: number;
  state?: string;
  county?: string;
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
  q?: string;
}

@Injectable()
export class StationsService {
  private readonly logger = new Logger(StationsService.name);

  private stations: PegelonlineStation[];

  private readonly stationFilePath = './stations,json';

  constructor(
    private readonly httpService: HttpService,
    private readonly nominatimSrvc: NominatimService,
  ) {
    // this.fetchStations();
    this.loadStations();
  }

  getStations(query: StationQuery = {}): Observable<PegelonlineStation[]> {
    this.logger.log(this.stations);
    return of(this.stations).pipe(
      map((res) => {
        return this.filterResults(res, query);
      }),
    );
  }

  private filterResults(
    origin: PegelonlineStation[],
    query: StationQuery,
  ): PegelonlineStation[] {
    this.logger.log(origin);
    origin = this.filterStation(query, origin);
    origin = this.filterGewaesser(query, origin);
    // TODO: add land filter
    // TODO: add einzugsgebiet filter
    // TODO: add kreis filter
    // TODO: add region filter
    // TODO: add parameter filter
    // TODO: add bbox filter
    return origin;
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
    this.logger.log(`start fetching stations`);
    this.httpService
      .get<PegelonlineStation[]>(
        'https://www.pegelonline.wsv.de/webservices/rest-api/v2/stations.json',
      )
      .pipe(map((res) => res.data))
      // TODO: remove next line later
      .pipe(map((stations) => stations.slice(0, 1)))
      .pipe(
        mergeMap((stations) => {
          const requests = stations.map((s) => {
            return this.nominatimSrvc.getAdressData(
              s.uuid,
              s.latitude,
              s.longitude,
            );
          });
          return forkJoin(requests).pipe(
            map((res) => {
              stations.forEach((st) => {
                const match = res.find((e) => e.id === st.uuid);
                if (match) {
                  st.state = match.state;
                  st.county = match.county;
                }
              });
              return stations;
            }),
          );
        }),
      )
      .subscribe((res) => {
        this.saveFetchedStations(res);
        this.stations = res;
        this.logger.log(`finished fetching stations`);
      });
  }

  private saveFetchedStations(res: PegelonlineStation[]) {
    writeFile(this.stationFilePath, JSON.stringify(res, null, 2), (err) => {
      if (err) {
        this.logger.error(err);
        return;
      }
      this.logger.log('Saved successfully');
    });
  }

  private loadStations() {
    readFile(this.stationFilePath, 'utf8', (err, data) => {
      if (err) {
        this.logger.log(err);
        return;
      }
      this.stations = JSON.parse(data);
    });
  }
}
