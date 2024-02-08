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
  longitude?: number;
  latitude?: number;
  land?: string;
  kreis?: string;
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
    origin = this.filterStation(query, origin);
    origin = this.filterGewaesser(query, origin);
    origin = this.filterLand(query, origin);
    // TODO: add einzugsgebiet filter
    origin = this.filterKreis(query, origin);
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
        (e) => e.shortname.toLowerCase().indexOf(filter.toLowerCase()) >= 0,
      );
    }
    return res;
  }

  private filterGewaesser(query: StationQuery, res: PegelonlineStation[]) {
    if (query.gewaesser) {
      const filter = query.gewaesser;
      this.logger.log(`Filter with Gewaesser: ${filter}`);
      res = res.filter(
        (e) =>
          e.water.shortname.toLowerCase().indexOf(filter.toLowerCase()) >= 0,
      );
    }
    return res;
  }

  private filterLand(query: StationQuery, stations: PegelonlineStation[]) {
    return this.filter(query, 'land', stations);
  }

  private filterKreis(query: StationQuery, stations: PegelonlineStation[]) {
    return this.filter(query, 'kreis', stations);
  }

  private filter(
    query: StationQuery,
    propertyKey: string,
    stations: PegelonlineStation[],
  ): PegelonlineStation[] {
    const filterTerm = query[propertyKey];
    if (filterTerm) {
      this.logger.log(`Filter with paramter ${propertyKey}: ${filterTerm}`);
      return stations.filter(
        (e) =>
          e[propertyKey]?.toLowerCase().indexOf(filterTerm.toLowerCase()) >= 0,
      );
    }
    return stations;
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
          const requests = stations
            .filter((s) => {
              if (s.latitude && s.longitude) {
                return true;
              } else {
                this.logger.warn(`${s.shortname} has no coordinates`);
                return false;
              }
            })
            .map((s) => {
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
                  st.land = match.state || match.county || match.city;
                  st.kreis = match.county || match.city;
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
