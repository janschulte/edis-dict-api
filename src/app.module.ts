import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { NominatimService } from './nominatim/nominatim.service';
import { OptionsController } from './options/options.controller';
import { QueryController } from './query/query.controller';
import { StationsService } from './stations/stations.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
    ConfigModule.forRoot(),
  ],
  controllers: [QueryController, OptionsController],
  providers: [StationsService, NominatimService],
})
export class AppModule {}
