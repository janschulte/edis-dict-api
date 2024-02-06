import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { QueryController } from './query/query.controller';
import { StationsController } from './stations.controller';
import { StationsService } from './stations/stations.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
  ],
  controllers: [AppController, StationsController, QueryController],
  providers: [AppService, StationsService],
})
export class AppModule {}
