import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { NominatimService } from './nominatim/nominatim.service';
import { QueryController } from './query/query.controller';
import { StationsService } from './stations/stations.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
  ],
  controllers: [AppController, QueryController],
  providers: [AppService, StationsService, NominatimService],
})
export class AppModule {}
