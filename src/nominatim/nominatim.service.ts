import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { map, Observable } from 'rxjs';

export interface AddressData {
  id: string;
  county: string;
  state: string;
}

interface NominatimReverseResponse {
  place_id: number;
  address: {
    state: string;
    county: string;
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
  private nominatimBaseUrl = 'https://nominatim.openstreetmap.org/';
  //   private nominatimBaseUrl = 'http://localhost:9090/';
  private readonly logger = new Logger(NominatimService.name);

  constructor(private readonly httpService: HttpService) {}

  getAdressData(id: string, lat: number, lon: number): Observable<AddressData> {
    return this.httpService
      .get<NominatimReverseResponse>(
        `${this.nominatimBaseUrl}/reverse?lat=${lat}&lon=${lon}&format=json`,
      )
      .pipe(map((res) => res.data))
      .pipe(
        map((res) => {
          return {
            id: id,
            state: res.address.state,
            county: res.address.county,
          };
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
