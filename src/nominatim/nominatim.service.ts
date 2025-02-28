import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosRequestConfig } from 'axios';
import { catchError, map, Observable } from 'rxjs';

export interface AddressData {
  id: string;
  county: string;
  state: string;
  country: string;
  city: string;
}

interface NominatimReverseResponse {
  error?: string;
  place_id: number;
  address: {
    state: string;
    county: string;
    city: string;
    country: string;
  };
}

export interface NominatimSearchResponse {
  place_id: number;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  category: string;
  place_rank: number;
  name: string;
  type: string;
  addresstype: string;
}

@Injectable()
export class NominatimService {
  private nominatimBaseUrl =
    this.configService.get<string>('NOMINATIM_BASE_URL');
  private readonly logger = new Logger(NominatimService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  getAdressData(id: string, lat: number, lon: number): Observable<AddressData> {
    const url = `${this.nominatimBaseUrl}reverse?lat=${lat}&lon=${lon}&format=json`;
    const config: AxiosRequestConfig = {
      headers: { 'Accept-Language': 'de' },
    };
    return this.httpService
      .get<NominatimReverseResponse>(url, config)
      .pipe(map((res) => res.data),
            catchError((err) => {
              this.logger.error(err);
              throw "Error gettind address data: " + err;
            })
      )
      .pipe(
        map((res) => {
          if (res.address) {
            return {
              id: id,
              country: res.address.country,
              state: res.address.state,
              county: res.address.county,
              city: res.address.city,
            };
          } else if (res.error) {
            this.logger.error(res.error);
          }
          return {
            id: id,
            country: "",
            state: "",
            county: "",
            city: "",
          }
        }),
      );
  }

  query(query: string): Observable<NominatimSearchResponse[]> {
    return this.httpService
      .get<NominatimSearchResponse[]>(
        `${this.nominatimBaseUrl}/search?q=${query}&format=jsonv2`,
      )
      .pipe(map((res) => res.data));
  }
}
