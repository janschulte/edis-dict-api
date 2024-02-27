import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { readFile, writeFile } from 'fs';
import { forkJoin, map, mergeMap, Observable, of } from 'rxjs';

import { NominatimService } from '../nominatim/nominatim.service';

interface PegelonlineTimeseries {
  shortname: string;
  longname: string;
  unit: string;
  mqtttopic: string;
  pegelonlinelink: string;
  equidistance: number;
}

export interface PegelonlineStation {
  uuid: string;
  number: string;
  shortname: string;
  longname: string;
  km: number;
  agency: string;
  longitude?: number;
  latitude?: number;
  country: string;
  land?: string;
  kreis?: string;
  mqtttopic: string;
  water: {
    shortname: string;
    longname: string;
  };
  timeseries: PegelonlineTimeseries[];
}

export interface AggregatedStationResponse {
  mqtttopics: string[];
  pegelonlinelinks: string[];
  stations: PegelonlineStation[];
}

export interface StationQuery {
  station?: string;
  gewaesser?: string;
  agency?: string;
  land?: string;
  country?: string;
  einzugsgebiet?: string;
  kreis?: string;
  region?: string;
  parameter?: string;
  bbox?: string;
  q?: string;
}

@Injectable()
export class StationsService {
  private readonly logger = new Logger(StationsService.name);

  private stations: PegelonlineStation[];

  private readonly stationFilePath = './stations.json';
  private readonly pegelonlineBaseUrl =
    'https://www.pegelonline.wsv.de/webservices/rest-api/v2';
  private readonly mqttBaseUrl = 'edis/pegelonline';

  constructor(
    private readonly httpService: HttpService,
    private readonly nominatimSrvc: NominatimService,
  ) {
    // this.fetchStations();
    this.loadStations();
  }

  getStations(query: StationQuery = {}): Observable<PegelonlineStation[]> {
    if (query.q) {
      return this.filterQ(query.q);
    } else {
      return of(this.stations).pipe(
        map((stations) => this.filterResults(stations, query)),
      );
    }
  }

  private filterQ(filter: string): Observable<PegelonlineStation[]> {
    const fields = ['shortname', 'longname', 'agency', 'land', 'kreis'];
    const waterFields = ['shortname', 'longname'];
    const timeseriesFields = ['shortname', 'longname'];
    return of(
      this.stations.filter((station) => {
        const matchField = fields.some(
          (f) =>
            station[f] &&
            station[f].toLowerCase().indexOf(filter.toLowerCase()) >= 0,
        );
        const matchWaterFields = waterFields.some(
          (wf) =>
            station.water[wf] &&
            station.water[wf].toLowerCase().indexOf(filter.toLowerCase()) >= 0,
        );
        const matchTimeseriesFields = timeseriesFields.some((tsf) =>
          station.timeseries.some(
            (ts) => ts[tsf].toLowerCase().indexOf(filter.toLowerCase()) >= 0,
          ),
        );
        return matchField || matchWaterFields || matchTimeseriesFields;
      }),
    );
  }

  prepareResponse(stations: PegelonlineStation[]): AggregatedStationResponse {
    // TODO: add here some intelligent aggregation of mqtt topics
    const mqtttopics = [];
    const pegelonlinelinks = [];
    stations.forEach((st) => {
      st.mqtttopic = `${this.mqttBaseUrl}/+/+/+/+/${st.uuid}/+`;
      mqtttopics.push(st.mqtttopic);
      st.timeseries.forEach((ts) => {
        ts.mqtttopic = `${this.mqttBaseUrl}/+/+/+/+/${st.uuid}/${ts.shortname}`;
        ts.pegelonlinelink = `${this.pegelonlineBaseUrl}/stations/${st.uuid}/${ts.shortname}/measurements.json`;
        pegelonlinelinks.push(ts.pegelonlinelink);
      });
    });
    return {
      mqtttopics,
      pegelonlinelinks,
      stations,
    };
  }

  private filterResults(
    origin: PegelonlineStation[],
    query: StationQuery,
  ): PegelonlineStation[] {
    origin = this.filterStation(query, origin);
    origin = this.filterGewaesser(query, origin);
    origin = this.filterLand(query, origin);
    origin = this.filterAgency(query, origin);
    origin = this.filterCountry(query, origin);
    // TODO: add einzugsgebiet filter
    origin = this.filterKreis(query, origin);
    // TODO: add region filter
    origin = this.filterParameter(query, origin);
    origin = this.filterBbox(query, origin);
    return origin;
  }

  private filterStation(query: StationQuery, stations: PegelonlineStation[]) {
    if (query.station) {
      const filter = query.station;
      this.logger.log(`Filter with Station: ${filter}`);
      stations = stations.filter(
        (e) => e.shortname.toLowerCase().indexOf(filter.toLowerCase()) >= 0,
      );
    }
    return stations;
  }

  private filterGewaesser(query: StationQuery, stations: PegelonlineStation[]) {
    if (query.gewaesser) {
      const filter = query.gewaesser;
      this.logger.log(`Filter with Gewaesser: ${filter}`);
      stations = stations.filter(
        (e) =>
          e.water.shortname.toLowerCase().indexOf(filter.toLowerCase()) >= 0,
      );
    }
    return stations;
  }

  private filterParameter(
    query: StationQuery,
    stations: PegelonlineStation[],
  ): PegelonlineStation[] {
    if (query.parameter) {
      const filter = query.parameter;
      this.logger.log(`Filter with Gewaesser: ${filter}`);
      return stations.filter((st) =>
        st.timeseries.find(
          (ts) =>
            ts.longname.toLowerCase() === filter.toLowerCase() ||
            ts.shortname.toLowerCase() === filter.toLowerCase(),
        ),
      );
    }
    return stations;
  }

  private filterAgency(query: StationQuery, stations: PegelonlineStation[]) {
    return this.filter(query, 'agency', stations);
  }

  private filterLand(query: StationQuery, stations: PegelonlineStation[]) {
    return this.filter(query, 'land', stations);
  }

  private filterKreis(query: StationQuery, stations: PegelonlineStation[]) {
    return this.filter(query, 'kreis', stations);
  }

  private filterCountry(query: StationQuery, stations: PegelonlineStation[]) {
    return this.filter(query, 'country', stations);
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

  private filterBbox(
    query: StationQuery,
    stations: PegelonlineStation[],
  ): PegelonlineStation[] {
    const bboxFilter = query.bbox?.split(',');
    if (bboxFilter && bboxFilter.length === 4) {
      this.logger.log(`Filter with paramter bbox: ${bboxFilter}`);
      const [minLon, minLat, maxLon, maxLat] = bboxFilter.map((c) =>
        parseFloat(c),
      );
      return stations.filter(
        (st) =>
          st.longitude >= minLon &&
          st.longitude <= maxLon &&
          st.latitude >= minLat &&
          st.latitude <= maxLat,
      );
    }
    return stations;
  }

  private fetchStations() {
    this.logger.log(`start fetching stations`);
    this.httpService
      .get<PegelonlineStation[]>(
        'https://www.pegelonline.wsv.de/webservices/rest-api/v2/stations.json?includeTimeseries=true',
      )
      .pipe(map((res) => res.data))
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
                  st.country = match.country;
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
