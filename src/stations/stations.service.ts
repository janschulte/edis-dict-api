import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiProperty } from '@nestjs/swagger';
import * as turf from '@turf/turf';
import { AxiosRequestConfig } from 'axios';
import { CronJob } from 'cron';
import { readFile, readFileSync, writeFile } from 'fs';
import { forkJoin, map, mergeMap, Observable, of } from 'rxjs';

import { NominatimService } from '../nominatim/nominatim.service';

export class PegelonlineTimeseries {
  shortname: string;
  longname: string;
  unit: string;
  mqtttopic: string;
  pegelonlinelink: string;
  equidistance: number;
}

export class PegelonlineStation {
  @ApiProperty({
    description: 'Eindeutige Stations-ID aus Pegelonline-API',
  })
  uuid: string;

  number: string;

  @ApiProperty({
    description: 'Shortname aus Pegelonline-API',
  })
  shortname: string;

  @ApiProperty({
    description: 'Longname aus Pegelonline-API',
  })
  longname: string;

  km: number;

  @ApiProperty({
    description: 'Agency aus Pegelonline-API',
  })
  agency: string;

  @ApiProperty({
    description: 'Longitude aus Pegelonline-API',
    required: false,
  })
  longitude?: number;

  @ApiProperty({
    description: 'Latitude aus Pegelonline-API',
    required: false,
  })
  latitude?: number;

  @ApiProperty({
    description: 'Water aus Pegelonline-API',
  })
  water: {
    shortname: string;
    longname: string;
  };

  @ApiProperty({
    description: 'Land - angereichert in der DICT-API',
    required: false,
  })
  country?: string;

  @ApiProperty({
    description: 'Bundesland - angereichert in der DICT-API',
    required: false,
  })
  land?: string;

  @ApiProperty({
    description: 'Landkreis - angereichert in der DICT-API',
    required: false,
  })
  kreis?: string;

  @ApiProperty({
    description: 'Einzugsgebiet - angereichert in der DICT-API',
    required: false,
  })
  einzugsgebiet?: string;

  @ApiProperty({
    description: 'Zugehöriger mqtt topic für alle Messungen an der Station',
    required: false,
  })
  mqtttopic: string;

  @ApiProperty({
    description: 'Timeseries aus Pegelonline-API',
    type: PegelonlineTimeseries,
  })
  timeseries: PegelonlineTimeseries[];
}

export class AggregatedStationResponse {
  @ApiProperty({
    description: 'Liste aller MQTT topics zu den Stationen',
  })
  mqtttopics: string[];
  @ApiProperty({
    description: 'Liste aller Pegelonline-URLs zu den Stationen',
  })
  pegelonlinelinks: string[];
  @ApiProperty({
    type: [PegelonlineStation],
  })
  stations: PegelonlineStation[];
}

export class StationQuery {
  @ApiProperty({
    required: false,
    description: 'Suche über einen Stationsnamen (z.B. <code>Köln</code>)',
  })
  station?: string;
  @ApiProperty({
    required: false,
    description: 'Suche über ein Gewässer (z.B. <code>Rhein</code>)',
  })
  gewaesser?: string;
  @ApiProperty({
    required: false,
    description: 'Suche über eine Agency (z.B. <code>Dresden</code>)',
  })
  agency?: string;
  @ApiProperty({
    required: false,
    description: 'Suche über ein Bundesland (z.B. <code>Hamburg</code>)',
  })
  land?: string;
  @ApiProperty({
    required: false,
    description: 'Suche über ein Land (z.B. <code>Deutschland</code>)',
  })
  country?: string;
  @ApiProperty({
    required: false,
    description: 'Suche über ein Fluss-Einzugsgebiet (z.B. <code>Ems</code>)',
  })
  einzugsgebiet?: string;
  @ApiProperty({
    required: false,
    description: 'Suche über ein Landkreis (z.B. <code>Emsland</code>)',
  })
  kreis?: string;
  // @ApiProperty({
  //   required: false,
  //   description: 'Suche über eine Region',
  // })
  // region?: string;
  @ApiProperty({
    required: false,
    description:
      'Suche über einen Beobachtungsparameter (z.B. <code>Wassertemperatur</code>)',
  })
  parameter?: string;
  @ApiProperty({
    required: false,
    description:
      'Suche über eine BoundingBox in der Form <code>minLon, minLat, maxLon, maxLat</code> (z.B. <code>7,52,8,53</code>)',
  })
  bbox?: string;
  @ApiProperty({
    required: false,
    description:
      'Suche über alle verfügbaren Parameter (z.B. <code>Köln</code>)',
  })
  q?: string;
}

@Injectable()
export class StationsService {
  private readonly logger = new Logger(StationsService.name);

  private stations: PegelonlineStation[];

  private readonly stationsFilePath = this.configService.get<string>(
    'STATIONS_FILE_PATH',
    'stations.json',
  );
  private readonly pegelonlineBaseUrl = this.configService.get<string>(
    'PEGELONLINE_BASE_URL',
  );
  private readonly mqttBase = this.configService.get<string>(
    'MQTT_BASE',
    'edis/pegelonline',
  );

  private readonly proxyProtocol =
    this.configService.get<string>('PROXY_PROTOCOL');
  private readonly proxyHost = this.configService.get<string>('PROXY_HOST');
  private readonly proxyPort = this.configService.get<number>('PROXY_PORT');

  private readonly runDataEnlargingOnInit =
    this.configService.get('RUN_DATA_ENLARGING_ON_INIT', 'true') === 'true';

  private readonly cronTimeForDataEnlarging = this.configService.get<string>(
    'CRON_TIME_FOR_DATA_ENLARGING',
    '00 00 00 * * *',
  );

  constructor(
    private readonly httpService: HttpService,
    private readonly nominatimSrvc: NominatimService,
    private readonly configService: ConfigService,
  ) {
    new CronJob(
      this.cronTimeForDataEnlarging,
      () => {
        this.fetchStations();
      },
      null,
      true,
      null,
      null,
      this.runDataEnlargingOnInit,
    );
    if (!this.runDataEnlargingOnInit) {
      this.loadStations();
    }
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
      st.mqtttopic = `${this.mqttBase}/+/+/+/+/${st.uuid}/+`;
      mqtttopics.push(st.mqtttopic);
      st.timeseries.forEach((ts) => {
        ts.mqtttopic = `${this.mqttBase}/+/+/+/+/${st.uuid}/${ts.shortname}`;
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
    this.logger.log(`Start fetching stations`);
    const config: AxiosRequestConfig = {};
    if (this.proxyProtocol && this.proxyHost && this.proxyPort) {
      config.proxy = {
        protocol: this.proxyProtocol,
        host: this.proxyHost,
        port: this.proxyPort,
      };
    }
    this.httpService
      .get<PegelonlineStation[]>(
        `${this.pegelonlineBaseUrl}/stations.json?includeTimeseries=true`,
        config,
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
                this.logger.log(
                  `Finished enlarging data for station ${st.longname}`,
                );
              });
              return stations;
            }),
          );
        }),
      )
      .subscribe({
        next: (res) => {
          this.saveFetchedStations(res);
          this.stations = res;
          this.logger.log(`finished fetching stations`);
        },
        error: (err) => {
          this.logger.error(err);
        },
      });
  }

  private getDrainage(lat: number, lon: number): string | undefined {
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
    writeFile(this.stationsFilePath, JSON.stringify(res, null, 2), (err) => {
      if (err) {
        this.logger.error(err);
        return;
      }
      this.logger.log('Saved successfully');
    });
  }

  private loadStations() {
    readFile(this.stationsFilePath, 'utf8', (err, data) => {
      if (err) {
        this.logger.log(err);
        return;
      }
      this.stations = JSON.parse(data);
    });
  }
}
