import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiProperty } from '@nestjs/swagger';
import * as turf from '@turf/turf';
import { AxiosRequestConfig } from 'axios';
import { CronJob } from 'cron';
import { readFile, readFileSync, writeFile } from 'fs';
import { forkJoin, map, Observable, of } from 'rxjs';

import { AddressData, NominatimService } from '../nominatim/nominatim.service';
import { SearchTermListService } from '../search-term-list/search-term-list';

type FilterPropertyKey =
  | 'country'
  | 'land'
  | 'kreis'
  | 'agency'
  | 'einzugsgebiet'
  | 'gewaesser';

export class PegelonlineTimeseries {
  @ApiProperty({
    description: 'Shortname zur Zeitreihe',
  })
  shortname: string;

  @ApiProperty({
    description: 'Longname zur Zeitreihe',
  })
  longname: string;

  @ApiProperty({
    description: 'Messeinheit der Zeitreihe',
  })
  unit: string;

  @ApiProperty({
    description: 'mqtt Topic für die Zeitreihe',
  })
  mqtttopic: string;

  @ApiProperty({
    description: 'Link zu den Messwerten',
  })
  pegelonlinelink: string;
  equidistance: number;
}

interface AddressOptions {
  id: string;
  country: string;
  country_alternatives?: string[];
  land: string;
  land_alternatives?: string[];
  kreis: string;
  kreis_alternatives?: string[];
  city: string;
  city_alternatives?: string[];
}

interface AddressTupel {
  country: string;
  land: string;
  kreis: string;
  city: string;
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
    description: 'Alternative Bennenungen zu Water',
    required: false,
  })
  water_alternatives?: string[];

  @ApiProperty({
    description: 'Stadt - angereichert in der DICT-API',
    required: false,
  })
  city?: string;

  @ApiProperty({
    description: 'Alternative Bennenungen zur Stadt',
    required: false,
  })
  city_alternatives?: string[];

  @ApiProperty({
    description: 'Land - angereichert in der DICT-API',
    required: false,
  })
  country?: string;

  @ApiProperty({
    description: 'Alternative Bennenungen zum Land',
    required: false,
  })
  country_alternatives?: string[];

  @ApiProperty({
    description: 'Bundesland - angereichert in der DICT-API',
    required: false,
  })
  land?: string;

  @ApiProperty({
    description: 'Alternative Bennenungen zum Bundesland',
    required: false,
  })
  land_alternatives?: string[];

  @ApiProperty({
    description: 'Landkreis - angereichert in der DICT-API',
    required: false,
  })
  kreis?: string;

  @ApiProperty({
    description: 'Alternative Bennenungen zum Landkreis',
    required: false,
  })
  kreis_alternatives?: string[];

  @ApiProperty({
    description: 'Einzugsgebiet - angereichert in der DICT-API',
    required: false,
  })
  einzugsgebiet?: string;

  @ApiProperty({
    description: 'Alternative Bennenungen zum Einzugsgebiet',
    required: false,
  })
  einzugsgebiet_alternatives?: string[];

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
    description: 'Liste aller Pegelonlinestationen',
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

  private stations: PegelonlineStation[] = [];

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

  private readonly harvestLanguageList: string[] = [];

  private readonly proxyProtocol =
    this.configService.get<string>('PROXY_PROTOCOL');
  private readonly proxyHost = this.configService.get<string>('PROXY_HOST');
  private readonly proxyPort = this.configService.get<number>('PROXY_PORT');

  private readonly runDataEnlargingOnInit =
    this.configService.get('RUN_DATA_ENLARGING_ON_INIT', 'true') === 'true';

  private readonly cronTimeForDataEnlarging = this.configService.get<string>(
    'CRON_TIME_FOR_DATA_ENLARGING',
    '00 00 * * *',
  );

  private stationCount = 0;
  private count = 0;

  constructor(
    private readonly httpService: HttpService,
    private readonly nominatimSrvc: NominatimService,
    private readonly configService: ConfigService,
    private readonly searchTermListSrvc: SearchTermListService,
  ) {
    this.loadStations().then(() => {
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
    });

    const langListConfig = this.configService.get<string>(
      'ADDITIONAL_HARVEST_LANGUAGE_LIST',
    );
    if (langListConfig) {
      this.harvestLanguageList = langListConfig.split(',');
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
    const fields = [
      'shortname',
      'longname',
      'agency',
      'country',
      'country_alternatives',
      'land',
      'land_alternatives',
      'kreis',
      'kreis_alternatives',
      'uuid',
      'water_alternatives',
      'einzugsgebiet',
      'einzugsgebiet_alternatives',
      'city',
      'city_alternatives',
    ];
    const waterFields = ['shortname', 'longname'];
    const timeseriesFields = ['shortname', 'longname'];
    return of(
      this.stations.filter((station) => {
        const matchField = fields.some((f) => {
          const prop = station[f];
          if (typeof prop === 'string') {
            return prop.toLowerCase().indexOf(filter.toLowerCase()) >= 0;
          } else if (prop instanceof Array) {
            return prop.some(
              (e) => e.toLowerCase().indexOf(filter.toLowerCase()) >= 0,
            );
          }
        });
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
    const preparedStations = stations.map((st) => {
      const stationTopic = `${this.mqttBase}/+/+/+/+/${st.uuid}/+`;
      mqtttopics.push(stationTopic);
      const timeseries = st.timeseries.map((ts) => {
        const mqtttopic = `${this.mqttBase}/+/+/+/+/${st.uuid}/${ts.shortname}`;
        const pegelonlinelink = `${this.pegelonlineBaseUrl}/stations/${st.uuid}/${ts.shortname}/measurements.json`;
        pegelonlinelinks.push(pegelonlinelink);
        return { ...ts, mqtttopic, pegelonlinelink } as PegelonlineTimeseries;
      });
      const station = {
        ...st,
        timeseries,
        mqtttopic: stationTopic,
      } as PegelonlineStation;
      return station;
    });
    return {
      mqtttopics,
      pegelonlinelinks,
      stations: preparedStations,
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
    propertyKey: FilterPropertyKey,
    stations: PegelonlineStation[],
  ): PegelonlineStation[] {
    const filterTerm = query[propertyKey];
    if (filterTerm) {
      this.logger.log(`Filter with paramter ${propertyKey}: ${filterTerm}`);
      return stations.filter((st) => {
        const match =
          st[propertyKey]?.toLowerCase().indexOf(filterTerm.toLowerCase()) >= 0;
        if (propertyKey === 'country' && !match) {
          return st.country_alternatives?.some(
            (e) => e.toLowerCase().indexOf(filterTerm.toLowerCase()) >= 0,
          );
        }
        if (propertyKey === 'land' && !match) {
          return st.land_alternatives?.some(
            (e) => e.toLowerCase().indexOf(filterTerm.toLowerCase()) >= 0,
          );
        }
        if (propertyKey === 'kreis' && !match) {
          return st.kreis_alternatives?.some(
            (e) => e.toLowerCase().indexOf(filterTerm.toLowerCase()) >= 0,
          );
        }
        if (propertyKey === 'einzugsgebiet' && !match) {
          return st.einzugsgebiet_alternatives?.some(
            (e) => e.toLowerCase().indexOf(filterTerm.toLowerCase()) >= 0,
          );
        }
        if (propertyKey === 'gewaesser' && !match) {
          return st.water_alternatives?.some(
            (e) => e.toLowerCase().indexOf(filterTerm.toLowerCase()) >= 0,
          );
        }
        return match;
      });
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
    const url = `${this.pegelonlineBaseUrl}/stations.json?includeTimeseries=true`;
    this.httpService
      .get<PegelonlineStation[]>(url, config)
      .pipe(map((res) => res.data))
      .subscribe({
        next: (fetchedStations) => {
          this.cleanupStationList(fetchedStations);
          const filteredStations = fetchedStations.filter((st) =>
            this.filterStations(st),
          );
          this.stationCount = filteredStations.length;
          this.count = 0;
          filteredStations.forEach((st) => {
            this.extendStation(st);
          });
        },
        error: (err) => {
          this.logger.error(err.stack);
        },
      });
  }

  private cleanupStationList(newList: PegelonlineStation[]) {
    this.stations = this.stations.filter(
      (st) => newList.find((nSt) => nSt.uuid === st.uuid) !== undefined,
    );
  }

  private extendStation(station: PegelonlineStation) {
    this.fetchAddressData(station).subscribe({
      next: (data) => {
        station.country = data.country;
        station.country_alternatives = data.country_alternatives;
        station.land = data.land;
        station.land_alternatives = data.land_alternatives;
        station.kreis = data.kreis;
        station.city = data.city;
        station.city_alternatives = data.city_alternatives;
        station.kreis_alternatives = this.mergeToArray([
          data.kreis_alternatives,
          this.searchTermListSrvc.getAlternativeKreise(data.kreis),
        ]);
        station.water_alternatives =
          this.searchTermListSrvc.getAlternativeGewaesser(
            station.water.longname,
          );
        if (station.latitude && station.longitude) {
          const drainage = this.getDrainage(
            station.latitude,
            station.longitude,
          );
          station.einzugsgebiet = drainage;
          station.einzugsgebiet_alternatives =
            this.searchTermListSrvc.getAlternativeEinzugsgebiete(drainage);
        }
        this.logger.log(`Enlarging data for station ${station.longname}`);
        this.addAndSaveStation(station, true);
      },
      error: (error) => {
        this.logger.error(
          `Error occurred while requesting additional address data for ${station.longname}`,
        );
        this.logger.error(error.stack);
        this.addAndSaveStation(station, false);
      },
    });
  }

  private addAndSaveStation(station: PegelonlineStation, replace: boolean) {
    this.count++;
    const match = this.stations.findIndex((st) => st.uuid === station.uuid);
    if (match >= 0) {
      if (replace) {
        this.stations[match] = station;
      }
    } else {
      this.stations.push(station);
    }
    this.logger.log(
      `save station ${station.longname} - ${this.count}/${this.stationCount}`,
    );
    this.saveFetchedStations();
  }

  private mergeToArray(entries: string[][]): string[] | undefined {
    const list = entries.filter((e) => e !== undefined).flat();
    return list.length ? list : undefined;
  }

  private filterStations(s: PegelonlineStation): boolean {
    if (s.latitude && s.longitude) {
      return true;
    } else {
      this.stationCount--;
      this.logger.warn(`${s.shortname} has no coordinates`);
      return false;
    }
  }

  private fetchAddressData(s: PegelonlineStation): Observable<AddressOptions> {
    const requests: { [key: string]: Observable<AddressData> } = {
      de: this.nominatimSrvc.getAdressData(
        s.uuid,
        s.latitude,
        s.longitude,
        'de',
      ),
    };
    this.harvestLanguageList.forEach((lang) => {
      requests[lang] = this.nominatimSrvc.getAdressData(
        s.uuid,
        s.latitude,
        s.longitude,
        lang,
      );
    });
    return forkJoin(requests).pipe(
      map((res) => {
        const deData = res['de'];
        const deTupel = this.getTupel(deData);
        const response: AddressOptions = {
          id: deData.id,
          country: deTupel.country,
          country_alternatives: this.getTranscriptions(deTupel.country),
          land: deTupel.land,
          land_alternatives: this.getTranscriptions(deTupel.land),
          kreis: deTupel.kreis,
          kreis_alternatives: this.getTranscriptions(deTupel.kreis),
          city: deTupel.city,
          city_alternatives: this.getTranscriptions(deTupel.city),
        };
        this.harvestLanguageList.forEach((e) => {
          const data = res[e];
          const tupel = this.getTupel(data);
          if (response.country !== tupel.country) {
            if (!response.country_alternatives) {
              response.country_alternatives = [];
            }
            response.country_alternatives.push(tupel.country);
          }
          if (response.land !== tupel.land) {
            if (!response.land_alternatives) {
              response.land_alternatives = [];
            }
            response.land_alternatives.push(tupel.land);
          }
          if (response.kreis !== tupel.kreis) {
            if (!response.kreis_alternatives) {
              response.kreis_alternatives = [];
            }
            response.kreis_alternatives.push(tupel.kreis);
          }
        });
        return response;
      }),
    );
  }

  private getTranscriptions(text?: string): string[] | undefined {
    if (text) {
      if (text.indexOf('ü') >= 0) {
        return [text.replaceAll('ü', 'ue')];
      }
      if (text.indexOf('ä') >= 0) {
        return [text.replaceAll('ä', 'ae')];
      }
      if (text.indexOf('ö') >= 0) {
        return [text.replaceAll('ö', 'oe')];
      }
    }
    return undefined;
  }

  private getTupel(data: AddressData): AddressTupel {
    return {
      country: data.country,
      land: data.state || data.county || data.city,
      kreis: data.county || data.city,
      city: data.city,
    };
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

  private saveFetchedStations() {
    writeFile(
      this.stationsFilePath,
      JSON.stringify(this.stations, null, 2),
      (err) => {
        if (err) {
          this.logger.error(err);
          return;
        }
      },
    );
  }

  private loadStations() {
    return new Promise<void>((resolve) => {
      readFile(this.stationsFilePath, 'utf8', (err, data) => {
        if (err) {
          this.logger.warn(`Could not load stations.json`);
          return resolve();
        }
        try {
          this.stations = JSON.parse(data);
        } catch (error) {
          this.logger.warn(`Error while parsing stations data`);
        }
        resolve();
      });
    });
  }
}
