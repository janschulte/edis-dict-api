import { HttpModule, HttpService } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { NominatimService } from './nominatim/nominatim.service';
import { OptionsController } from './options/options.controller';
import { QueryController } from './query/query.controller';
import { SearchTermListService } from './search-term-list/search-term-list';
import { StationsService } from './stations/stations.service';

const INTERVAL_MS = 100;
@Module({
  imports: [
    HttpModule.register({
      // timeout: 5000,
      maxRedirects: 5,
    }),
    ConfigModule.forRoot(),
  ],
  controllers: [QueryController, OptionsController],
  providers: [StationsService, NominatimService, SearchTermListService],
})
export class AppModule {
  private pendingRequests = 0;

  private readonly maxRequestsCount = this.configService.get<number>(
    'MAX_REQUESTS_COUNT',
    99,
  );

  constructor(
    private readonly configService: ConfigService,
    private httpService: HttpService,
  ) {
    httpService.axiosRef.interceptors.request.use((config) => {
      return new Promise((resolve) => {
        const interval = setInterval(() => {
          if (this.pendingRequests < this.maxRequestsCount) {
            this.pendingRequests++;
            clearInterval(interval);
            resolve(config);
          }
        }, INTERVAL_MS);
      });
    });

    httpService.axiosRef.interceptors.response.use(
      (response) => {
        this.pendingRequests = Math.max(0, this.pendingRequests - 1);
        return Promise.resolve(response);
      },
      (error) => {
        this.pendingRequests = Math.max(0, this.pendingRequests - 1);
        return Promise.reject(error);
      },
    );
  }
}
