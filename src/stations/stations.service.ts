import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import * as turf from '@turf/turf';
import { readFile, readFileSync, writeFile } from 'fs';
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
  einzugsgebiet?: string;
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
    const fields = ['shortname', 'longname', 'agency', 'land', 'kreis', 'uuid'];
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
    originStations: PegelonlineStation[],
    query: StationQuery,
  ): PegelonlineStation[] {
    originStations = this.filterStation(query, originStations);
    originStations = this.filterGewaesser(query, originStations);
    originStations = this.filter(query, 'land', originStations);
    originStations = this.filter(query, 'agency', originStations);
    originStations = this.filter(query, 'country', originStations);
    originStations = this.filter(query, 'einzugsgebiet', originStations);
    originStations = this.filter(query, 'kreis', originStations);
    // TODO: add region filter
    originStations = this.filterParameter(query, originStations);
    originStations = this.filterBbox(query, originStations);
    return originStations;
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
                if (st.latitude && st.longitude) {
                  const drainage = this.getDrainage(st.latitude, st.longitude);
                  st.einzugsgebiet = drainage;
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

  private getDrainage(lat: number, lon: number): string | undefined {
    this.logger.log(`Get drainage for ${lat} and ${lon}`);
    const fileContent = readFileSync('einzugsgebiete.geojson', 'utf-8');
    const geojson = JSON.parse(fileContent);
    const point = turf.point([lon, lat, 0]);
    if (
      geojson?.type === 'FeatureCollection' &&
      geojson.features instanceof Array
    ) {
      const match = geojson.features.find((feature) => {
        const polygon = turf.multiPolygon(feature.geometry.coordinates);
        const inside = turf.booleanPointInPolygon(point, polygon);
        return inside;
      });
      if (match) {
        if (match.properties.NAME_2500) return match.properties.NAME_2500;
        if (match.properties.NAME_1000) return match.properties.NAME_1000;
        if (match.properties.NAME_500) return match.properties.NAME_500;
      }
    }
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
